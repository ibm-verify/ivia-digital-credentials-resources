/**
 * setupProxy.mjs
 * Development proxy handling external requests + OIDC auth (IBM Verify) using openid-client v6+
 */

import express from 'express';
import bodyParser from 'body-parser';
import * as client from 'openid-client';
import session from 'express-session';
import crypto from 'crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { reliableFetch, reliableFetchGet, reliableFetchPost } from './reliableFetch.mjs';
import * as uuid from 'uuid';

/**
 * Sanitize user input for logging to prevent log forging attacks
 * Removes newlines, carriage returns, and other control characters
 * @param {string} input - The input to sanitize
 * @returns {string} Sanitized input safe for logging
 */
function sanitizeForLog(input) {
    if (typeof input !== 'string') {
        input = String(input);
    }
    // Replace newlines, carriage returns, and other control characters
    return input.replace(/[\r\n\t\x00-\x1F\x7F]/g, ' ').trim();
}

// --- Environment / config ---
const diagencyAccountUrl = process.env.REACT_APP_ACCOUNT_URL || '';
const tokenUrl = process.env.REACT_APP_TOKEN_ENDPOINT || '';
const w3Root = process.env.REACT_APP_DMV_W3_ROOT || '';

const ibmVerifyBaseUrl = process.env.IBM_VERIFY_BASE_URL || '';
const ibmVerifyTokenUrl = process.env.IBM_VERIFY_TOKEN_URL || '';
const ibmVerifyClientId = process.env.IBM_VERIFY_CLIENT_ID || '';
const ibmVerifyClientSecret = process.env.IBM_VERIFY_CLIENT_SECRET || '';
const fido2RelyingPartyId = process.env.IBM_VERIFY_FIDO2_RELYING_PARTY_ID || '';

const dmvAgentClientId = process.env.REACT_APP_DMV_AGENT_CLIENT_ID || '';
const dmvAgentPassword = process.env.REACT_APP_DMV_AGENT_PASSWORD || '';

const clientId = process.env.REACT_APP_DMV_CLIENT_ID || '';
const clientSecret = process.env.REACT_APP_DMV_CLIENT_SECRET || '';
const redirectUri = process.env.REACT_APP_DMV_REDIRECT_URL || '';
const logoutRedirectUri = process.env.REACT_APP_DMV_LOGOUT_REDIRECT_URL || '';

// --- Token storage ---
const tokenStorage = { accessToken: '', expiresAt: 0 };
const ibmVerifyTokenStorage = { accessToken: '', expiresAt: 0 };

// --- Session configuration ---
const isProduction = (process.env.NODE_ENV === undefined || process.env.NODE_ENV === 'production');
const sessionConfig = {
    secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: isProduction, // Require HTTPS in production, allow HTTP for localhost development
        httpOnly: true, // Prevent client-side JavaScript access
        sameSite: isProduction ? 'strict' : 'lax', // Strict in production, lax for localhost
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    },
    name: 'dmv.session.id' // Custom session name
};

// --- Authentication middleware ---
function requireAuth(req, res, next) {
    if (!req.session?.user?.authenticated) {
        return res.status(401).json({
            error: 'Unauthorized',
            message: 'Authentication required'
        });
    }
    next();
}

// Check token expiry and session validity
function requireValidSession(req, res, next) {
    console.log('[DMV-AUTH] Checking session validity');
    console.log('[DMV-AUTH] Session exists:', !!req.session);
    console.log('[DMV-AUTH] User in session:', !!req.session?.user);
    console.log('[DMV-AUTH] User authenticated:', req.session?.user?.authenticated);

    if (!req.session?.user?.authenticated) {
        console.log('[DMV-AUTH] Authentication required - no valid session found');
        return res.status(401).json({
            error: 'Unauthorized',
            message: 'Authentication required'
        });
    }

    // Check if tokens are expired
    const now = Date.now();
    if (req.session.user.tokenExpiresAt && req.session.user.tokenExpiresAt < now) {
        console.log('[DMV-AUTH] Session expired');
        req.session.destroy();
        return res.status(401).json({
            error: 'Session Expired',
            message: 'Please login again'
        });
    }

    console.log('[DMV-AUTH] Session valid, proceeding');
    next();
}

// --- Helper to forward requests ---
/**
 * Fetch a QR-code PNG from Diagency and stream it to the client.
 *
 * Only server-controlled values are accepted as parameters — the offer ID
 * comes from the server session and the token from the server's own credential
 * store.  No client request headers, query parameters, or body are forwarded.
 * The only header sent to the backend is Authorization; the only header
 * returned to the client is Content-Type.
 */
async function fetchOfferImage(res, token, url) {
    try {
        console.log(`[DMV-DIAGENCY] Fetching offer image from Diagency`);
        const response = await reliableFetch(url, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'image/png',
            },
        }, { timeout: 30000 });

        if (!response.ok) {
            console.error(`[DMV-DIAGENCY] Offer image fetch failed: ${response.status}`);
            return res.status(response.status).json({ error: 'Failed to fetch offer image' });
        }

        const arrayBuffer = await response.arrayBuffer();
        console.log(`[DMV-DIAGENCY] Sending offer image, size: ${arrayBuffer.byteLength} bytes`);
        res.setHeader('Content-Type', 'image/png');
        return res.send(Buffer.from(arrayBuffer));
    } catch (error) {
        console.error(`[DMV-DIAGENCY] Error fetching offer image:`, error);
        return res.status(504).json({ error: 'Gateway Timeout', message: error.message });
    }
}

// --- DMV Token Helper ---
async function getOrRefreshDmvToken() {
    if (tokenStorage.accessToken && tokenStorage.expiresAt > Date.now()) return tokenStorage.accessToken;

    const formBody = new URLSearchParams({
        client_id: dmvAgentClientId,
        client_secret: dmvAgentPassword,
        grant_type: 'client_credentials'
    });

    const response = await reliableFetchPost(tokenUrl, formBody, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }
    }, {
        timeout: 30000,
        onRetry: (attempt, error) => {
            console.log(`[DMV-TOKEN] Retrying token request, attempt ${attempt}. Error: ${error.message}`);
        }
    });

    if (!response.ok) {
        throw new Error(`Token request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    tokenStorage.accessToken = data.access_token;
    tokenStorage.expiresAt = Date.now() + (data.expires_in * 1000) - 60000;
    return tokenStorage.accessToken;
}

// --- OIDC Setup ---
let oidcClient = null;
const authParams = new Map();

async function loadOidcClient() {
    if (!oidcClient) {
        if (!clientId) throw new Error('Client ID not defined (REACT_APP_CLIENT_ID)');
        if (!w3Root) throw new Error('W3 root not defined (REACT_APP_W3_ROOT)');

        try {
            // Create a URL object for the server's issuer identifier with the correct path
            const issuerUrl = new URL(w3Root + '/oauth2');
            const configUrl = new URL(w3Root + '/oauth2/.well-known/openid-configuration');
            console.log(`Attempting to discover OIDC configuration from: ${configUrl.href}`);

            // Use the discovery method with the correct configuration URL and our reliable fetch
            const config = await client.discovery(
                issuerUrl,
                clientId,
                clientSecret,
                {
                    discoveryEndpoint: configUrl,
                    [client.customFetch]: reliableFetch
                }
            );

            oidcClient = config;
            console.log('OIDC client successfully initialized');
        } catch (error) {
            console.error('Failed to initialize OIDC client:', error);
            throw new Error(`OIDC discovery failed: ${error.message}. Please check that REACT_APP_W3_ROOT is correctly configured.`);
        }
    }
    return oidcClient;
}

// Portrait image used in mDL credentials — loaded from the default profile image at startup.
// Keeping this server-side ensures the credential image cannot be swapped by the client.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let DMV_PORTRAIT = '';
try {
    const portraitPath = path.join(__dirname, 'images', 'default-profile-male.jpeg');
    DMV_PORTRAIT = fs.readFileSync(portraitPath).toString('base64');
    console.log('[DMV] Default portrait image loaded and base64-encoded successfully');
} catch (err) {
    console.error('[DMV] ERROR: Failed to load default portrait image from images/default-profile-male.jpeg —', err.message);
    console.error('[DMV] Credential offers will be issued with an empty portrait field until this is resolved');
}

// --- DMV Profile Defaults ---
const _today = new Date();
const _expiryDate = new Date(_today);
_expiryDate.setFullYear(_expiryDate.getFullYear() + 1);

const DMV_PROFILE_DEFAULTS = {
    id: 'user123',
    firstName: 'John',
    lastName: 'Doe',
    email: 'john.doe@example.com',
    licenseNumber: 'DL-987654321',
    licenseClass: 'C',
    issueDate: _today.toJSON().slice(0, 10),
    expiryDate: _expiryDate.toJSON().slice(0, 10),
    address: '123 High Street, Southport, QLD 4217, Australia',
    dateOfBirth: '1990-01-15',
    birthPlace: 'VIC, Australia',
    sex: 'Male (1)',
    height: 180,
    weight: 75,
    eyeColour: 'Hazel',
    hairColour: 'Brown',
    ageInYears: 35,
    birthYear: 1990,
    nationality: 'AU',
    ageOver18: true,
    ageOver21: true,
    ageOver65: false,
    residentAddress: '123 High Street, Southport, QLD 4217, Australia',
    residentCity: 'Gold Coast',
    residentState: 'QLD',
    residentPostalCode: '4217',
    residentCountry: 'AU',
    administrativeNumber: 'ADM-12345',
    issuingCountry: 'AU',
    unDistinguishingSign: 'AU',
    issuingAuthority: 'Department of Motor Vehicles',
    issuingJurisdiction: 'Main Roads Australia',
    drivingPrivileges: [
        { vehicle_category_code: 'C', issue_date: _today.toJSON().slice(0, 10), expiry_date: _expiryDate.toJSON().slice(0, 10) },
        { vehicle_category_code: 'RE', issue_date: _today.toJSON().slice(0, 10), expiry_date: _expiryDate.toJSON().slice(0, 10) }
    ]
};

// --- Main Export ---
export default function setupRoutes(app) {
    // Trust proxy - required when behind a reverse proxy (like in production)
    // This ensures secure cookies work correctly with HTTPS termination at the proxy
    app.set('trust proxy', 1);

    app.use(bodyParser.json());
    app.use(bodyParser.urlencoded({ extended: true }));

    // Add session middleware
    app.use(session(sessionConfig));

    // --- Auth routes ---
    const authRouter = express.Router();

    authRouter.get('/login', async (req, res) => {
        try {
            const config = await loadOidcClient();

            // Generate PKCE code verifier and challenge
            const code_verifier = client.randomPKCECodeVerifier();
            const code_challenge = await client.calculatePKCECodeChallenge(code_verifier);
            const state = client.randomState();

            // Store the code verifier and state for later use
            authParams.set(state, { code_verifier, createdAt: Date.now() });

            // Build the authorization URL with parameters
            const parameters = {
                redirect_uri: redirectUri,
                scope: 'openid profile email',
                response_type: 'code',
                code_challenge,
                code_challenge_method: 'S256',
                state
            };

            const redirectTo = client.buildAuthorizationUrl(config, parameters);

            res.json({ authUrl: redirectTo.href, state });
        } catch (err) {
            console.error('Error generating auth URL:', err);
            res.status(500).json({ error: 'Failed to generate authorization URL', details: err.message });
        }
    });

    authRouter.post('/callback', async (req, res) => {
        try {
            const config = await loadOidcClient();
            const { code, state } = req.body;
            if (!code || !state) return res.status(400).json({ error: 'Missing code or state' });

            const params = authParams.get(state);
            if (!params) return res.status(400).json({ error: 'Invalid or expired state' });

            // Manually construct the token request
            const tokenEndpoint = new URL(`${w3Root}/oauth2/token`);
            const tokenParams = new URLSearchParams({
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: redirectUri,
                client_id: clientId,
                client_secret: clientSecret,
                code_verifier: params.code_verifier
            });

            const tokenResponse = await reliableFetchPost(tokenEndpoint.href, tokenParams, {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            }, {
                onRetry: (attempt, error) => {
                    console.log(`[DMV-OIDC] Retrying OIDC token exchange, attempt ${attempt}. Error: ${error.message}`);
                }
            });

            if (!tokenResponse.ok) {
                throw new Error(`Token exchange failed: ${tokenResponse.status} ${tokenResponse.statusText}`);
            }

            const tokens = await tokenResponse.json();

            authParams.delete(state);

            // Fetch user info if needed
            let userInfo = {};
            try {
                const userInfoEndpoint = new URL(`${w3Root}/oauth2/userinfo`);

                const userInfoResponse = await reliableFetchGet(userInfoEndpoint.href, {
                    headers: {
                        'Authorization': `Bearer ${tokens.access_token}`
                    }
                }, {
                    onRetry: (attempt, error) => {
                        console.log(`[DMV-OIDC] Retrying userinfo request, attempt ${attempt}. Error: ${error.message}`);
                    }
                });

                if (userInfoResponse.ok) {
                    userInfo = await userInfoResponse.json();
                } else {
                    throw new Error(`Userinfo request failed: ${userInfoResponse.status}`);
                }
            } catch (e) {
                console.error('Userinfo error:', e);
                // Continue even if userinfo fails
            }

            // Establish authenticated session
            req.session.user = {
                authenticated: true,
                userInfo,
                tokens: {
                    access_token: tokens.access_token,
                    id_token: tokens.id_token,
                    refresh_token: tokens.refresh_token
                },
                tokenExpiresAt: tokens.expires_in ? Date.now() + (tokens.expires_in * 1000) : null,
                loginTime: Date.now()
            };

            // Return success without exposing access tokens
            res.json({
                success: true,
                userInfo: {
                    name: userInfo.name,
                    given_name: userInfo.given_name,
                    family_name: userInfo.family_name,
                    email: userInfo.email,
                },
                message: 'Authentication successful'
            });
        } catch (err) {
            console.error('Error in callback:', err);
            res.status(500).json({ error: 'Authentication failed', details: err.message });
        }
    });

    // Check session status
    authRouter.get('/status', (req, res) => {
        if (req.session?.user?.authenticated) {
            res.json({
                authenticated: true,
                user: req.session.user.userInfo,
                loginTime: req.session.user.loginTime
            });
        } else {
            res.json({ authenticated: false });
        }
    });

    // Return merged profile (OIDC claims override defaults)
    authRouter.get('/profile', requireValidSession, (req, res) => {
        const userInfo = req.session.user.userInfo || {};
        const profile = {
            ...DMV_PROFILE_DEFAULTS,
            id: userInfo.sub || DMV_PROFILE_DEFAULTS.id,
            firstName: userInfo.given_name || DMV_PROFILE_DEFAULTS.firstName,
            lastName: userInfo.family_name || DMV_PROFILE_DEFAULTS.lastName,
            email: userInfo.email || DMV_PROFILE_DEFAULTS.email,
        };
        return res.json(profile);
    });

    // Enhanced logout
    authRouter.post('/logout', async (req, res) => {
        try {
            let logoutUrl = null;
            const postLogoutRedirectUri = logoutRedirectUri || `${req.protocol}://${req.get('host')}/logoutcallback`;

            // If we have an ID token in session, create logout URL
            if (req.session?.user?.tokens?.id_token) {
                const config = await loadOidcClient();
                logoutUrl = client.buildEndSessionUrl(config, {
                    id_token_hint: req.session.user.tokens.id_token,
                    post_logout_redirect_uri: postLogoutRedirectUri
                }).href;
            }

            // Destroy session
            req.session.destroy((err) => {
                if (err) {
                    console.error('Session destruction error:', err);
                }

                res.clearCookie(sessionConfig.name, {
                    path: '/',
                    secure: sessionConfig.cookie.secure,
                    sameSite: sessionConfig.cookie.sameSite
                });

                res.json({
                    success: true,
                    logoutUrl
                });
            });
        } catch (err) {
            console.error('Logout error:', err);
            res.clearCookie(sessionConfig.name, {
                path: '/',
                secure: sessionConfig.cookie.secure,
                sameSite: sessionConfig.cookie.sameSite
            });
            res.json({ success: true });
        }
    });

    app.use('/auth', authRouter);

    // IBM Verify token used for server-side FIDO2 assertion calls
    async function getOrRefreshIBMVerifyToken() {
        if (ibmVerifyTokenStorage.accessToken && ibmVerifyTokenStorage.expiresAt > Date.now()) {
            return ibmVerifyTokenStorage.accessToken;
        }
        const formBody = new URLSearchParams({
            client_id: ibmVerifyClientId,
            client_secret: ibmVerifyClientSecret,
            grant_type: 'client_credentials'
        });
        const response = await reliableFetchPost(ibmVerifyTokenUrl, formBody, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }
        }, {
            timeout: 30000,
            onRetry: (attempt, error) => {
                console.log(`[DMV-PASSKEY] Retrying IBM Verify token request, attempt ${attempt}. Error: ${error.message}`);
            }
        });
        if (!response.ok) {
            const text = await response.text();
            throw new Error(`IBM Verify token request failed: ${response.status} ${text}`);
        }
        const data = await response.json();
        ibmVerifyTokenStorage.accessToken = data.access_token;
        ibmVerifyTokenStorage.expiresAt = Date.now() + (data.expires_in * 1000) - 60000;
        return ibmVerifyTokenStorage.accessToken;
    }

    // Passkey FIDO2 routes 
    // IBM Verify FIDO2 base path: /v2.0/factors/fido2/relyingparties/{rpId}
    const passkeyRouter = express.Router();

    // Initiate passkey registration — returns a WebAuthn PublicKeyCredentialCreationOptions challenge.
    // Requires an active OIDC session; uses the user's own access token so IBM Verify associates
    // the new credential with the correct account (manageEnrollMFAMethod entitlement).
    passkeyRouter.post('/register/options', requireValidSession, async (req, res) => {
        try {
            if (!fido2RelyingPartyId) {
                return res.status(500).json({ error: 'FIDO2 relying party not configured (IBM_VERIFY_FIDO2_RELYING_PARTY_ID)' });
            }
            const userToken = req.session.user.tokens.access_token;
            const userId = req.session.user.userInfo?.sub;
            const displayName = req.session.user.userInfo?.name || req.session.user.userInfo?.email || 'DMV User';

            const url = `${ibmVerifyBaseUrl}/v2.0/factors/fido2/relyingparties/${fido2RelyingPartyId}/attestation/options`;
            const response = await reliableFetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${userToken}`,
                    'Accept': 'application/json'
                },
                body: JSON.stringify({
                    userId,
                    displayName,
                    authenticatorSelection: {
                        authenticatorAttachment: 'platform',
                        residentKey: 'preferred',
                        userVerification: 'preferred'
                    },
                    attestation: 'none'
                })
            }, { timeout: 15000 });

            if (!response.ok) {
                const err = await response.text();
                throw new Error(`IBM Verify attestation/options failed: ${response.status} ${err}`);
            }
            const options = await response.json();
            res.json(options);
        } catch (err) {
            console.error('[DMV-PASSKEY] register/options error:', err);
            res.status(500).json({ error: 'Failed to get passkey registration options', details: err.message });
        }
    });

    // Complete passkey registration — verifies the authenticator's attestation with IBM Verify.
    // Body: { credential: RegistrationResponseJSON (from @simplewebauthn/browser), nickname: string }
    passkeyRouter.post('/register/complete', requireValidSession, async (req, res) => {
        try {
            if (!fido2RelyingPartyId) {
                return res.status(500).json({ error: 'FIDO2 relying party not configured' });
            }
            const userToken = req.session.user.tokens.access_token;
            const { credential, nickname } = req.body;
            if (!credential) return res.status(400).json({ error: 'Missing credential in request body' });

            // Map SimpleWebAuthn browser response format to IBM Verify's expected schema.
            // IBM Verify uses getTransports/getClientExtensionResults naming from the WebAuthn spec methods.
            const ibmVerifyPayload = {
                id: credential.id,
                nickname: (nickname || 'My Passkey').substring(0, 64),
                rawId: credential.rawId,
                type: credential.type,
                enabled: true,
                response: {
                    clientDataJSON: credential.response.clientDataJSON,
                    attestationObject: credential.response.attestationObject
                },
                getTransports: credential.response.transports || [],
                getClientExtensionResults: credential.clientExtensionResults || {},
                ...(credential.authenticatorAttachment && { authenticatorAttachment: credential.authenticatorAttachment })
            };

            const url = `${ibmVerifyBaseUrl}/v2.0/factors/fido2/relyingparties/${fido2RelyingPartyId}/attestation/result`;
            const response = await reliableFetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${userToken}`,
                    'Accept': 'application/json'
                },
                body: JSON.stringify(ibmVerifyPayload)
            }, { timeout: 15000 });

            if (!response.ok) {
                const err = await response.text();
                throw new Error(`IBM Verify attestation/result failed: ${response.status} ${err}`);
            }
            const result = await response.json();
            res.json({ success: true, result });
        } catch (err) {
            console.error('[DMV-PASSKEY] register/complete error:', err);
            res.status(500).json({ error: 'Failed to complete passkey registration', details: err.message });
        }
    });

    // Initiate passkey authentication — returns a WebAuthn PublicKeyCredentialRequestOptions challenge.
    // No session required; uses server-side IBM Verify admin token (authnAnyUser entitlement).
    passkeyRouter.post('/login/options', async (req, res) => {
        try {
            if (!fido2RelyingPartyId) {
                return res.status(500).json({ error: 'FIDO2 relying party not configured' });
            }
            const token = await getOrRefreshIBMVerifyToken();

            const url = `${ibmVerifyBaseUrl}/v2.0/factors/fido2/relyingparties/${fido2RelyingPartyId}/assertion/options`;
            const response = await reliableFetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/json'
                },
                body: JSON.stringify({ userVerification: 'preferred' })
            }, { timeout: 15000 });

            if (!response.ok) {
                const err = await response.text();
                throw new Error(`IBM Verify assertion/options failed: ${response.status} ${err}`);
            }
            const options = await response.json();
            res.json(options);
        } catch (err) {
            console.error('[DMV-PASSKEY] login/options error:', err);
            res.status(500).json({ error: 'Failed to get passkey authentication options', details: err.message });
        }
    });

    // Complete passkey authentication — IBM Verify verifies the signed challenge, we establish a session.
    // Body: { credential: AuthenticationResponseJSON (from @simplewebauthn/browser) }
    passkeyRouter.post('/login/complete', async (req, res) => {
        try {
            if (!fido2RelyingPartyId) {
                return res.status(500).json({ error: 'FIDO2 relying party not configured' });
            }
            const token = await getOrRefreshIBMVerifyToken();
            const { credential } = req.body;
            if (!credential) return res.status(400).json({ error: 'Missing credential in request body' });

            // Map SimpleWebAuthn browser response format to IBM Verify's expected schema.
            const ibmVerifyPayload = {
                id: credential.id,
                rawId: credential.rawId,
                type: credential.type,
                response: {
                    clientDataJSON: credential.response.clientDataJSON,
                    authenticatorData: credential.response.authenticatorData,
                    signature: credential.response.signature,
                    ...(credential.response.userHandle && { userHandle: credential.response.userHandle })
                },
                getClientExtensionResults: credential.clientExtensionResults || {},
                ...(credential.authenticatorAttachment && { authenticatorAttachment: credential.authenticatorAttachment })
            };

            // returnJwt=true includes a JWT in the response so we can extract user identity
            const url = `${ibmVerifyBaseUrl}/v2.0/factors/fido2/relyingparties/${fido2RelyingPartyId}/assertion/result?returnJwt=true`;
            const response = await reliableFetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/json'
                },
                body: JSON.stringify(ibmVerifyPayload)
            }, { timeout: 15000 });

            if (!response.ok) {
                const err = await response.text();
                throw new Error(`IBM Verify assertion/result failed: ${response.status} ${err}`);
            }
            const result = await response.json();

            // IBM Verify returns the FIDO2 assertion JWT in result.assertion (not result.token).
            // Its audience includes the IBM Verify token endpoint, so we can exchange it for a
            // user-scoped access token and then call the OIDC userinfo endpoint — the same
            // profile data the regular OIDC login flow receives.
            let userInfo = { sub: result.userId };

            // IBM Verify's FIDO2 assertion JWT has no profile claims
            // Look up the user via SCIM admin API using the userId as the SCIM resource id.
            try {
                const adminToken = await getOrRefreshIBMVerifyToken();
                const response = await reliableFetchGet(
                    `${ibmVerifyBaseUrl}/v2.0/Users/${result.userId}`,
                    { headers: { Authorization: `Bearer ${adminToken}`, Accept: 'application/scim+json' } },
                    { timeout: 10000 }
                );
                if (response.ok) {
                    const scimUser = await response.json();
                    const nameObj = scimUser.name || {};
                    userInfo = {
                        sub: scimUser.id || result.userId,
                        name: scimUser.name.formatted,
                        given_name: scimUser.name.givenName,
                        family_name: scimUser.name.familyName,
                        email: scimUser.emails?.[0]?.value
                    };
                } else {
                    console.error('[DMV-PASSKEY] SCIM user lookup failed:', response.status, await response.text());
                }
            } catch (e) {
                console.error('[DMV-PASSKEY] SCIM lookup error:', e.message);
            }

            req.session.user = {
                authenticated: true,
                userInfo,
                tokens: {
                    access_token: token,
                    id_token: null,
                    refresh_token: null
                },
                tokenExpiresAt: Date.now() + 24 * 60 * 60 * 1000,
                loginTime: Date.now(),
                authMethod: 'passkey'
            };

            res.json({
                success: true,
                userInfo: {
                    name: userInfo.name,
                    given_name: userInfo.given_name,
                    family_name: userInfo.family_name,
                    email: userInfo.email
                }
            });
        } catch (err) {
            console.error('[DMV-PASSKEY] login/complete error:', err);
            res.status(500).json({ error: 'Passkey authentication failed', details: err.message });
        }
    });

    // List passkeys registered to the current user.
    passkeyRouter.get('/list', requireValidSession, async (req, res) => {
        try {
            const userToken = req.session.user.tokens.access_token;
            const userId = req.session.user.userInfo?.sub;

            // For OIDC sessions the user token already scopes results to the token owner.
            // For passkey-login sessions the token is the admin token, so filter by userId.
            let url = `${ibmVerifyBaseUrl}/v2.0/factors/fido2/registrations`;
            if (userId) url += `?search=userId%3D"${encodeURIComponent(userId)}"`;

            const response = await reliableFetchGet(url, {
                headers: {
                    'Authorization': `Bearer ${userToken}`,
                    'Accept': 'application/json'
                }
            }, { timeout: 15000 });

            if (!response.ok) {
                const err = await response.text();
                throw new Error(`IBM Verify list registrations failed: ${response.status} ${err}`);
            }
            const data = await response.json();
            res.json(data);
        } catch (err) {
            console.error('[DMV-PASSKEY] list error:', err);
            res.status(500).json({ error: 'Failed to list passkeys', details: err.message });
        }
    });

    // Delete a passkey by registration ID.
    passkeyRouter.delete('/:id', requireValidSession, async (req, res) => {
        try {
            const registrationId = req.params.id;
            // Reject IDs that contain characters outside safe alphanumeric/dash/underscore set
            if (!/^[\w-]+$/.test(registrationId)) {
                return res.status(400).json({ error: 'Invalid registration ID' });
            }

            const userToken = req.session.user.tokens.access_token;
            const url = `${ibmVerifyBaseUrl}/v2.0/factors/fido2/registrations/${registrationId}`;
            const response = await reliableFetch(url, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${userToken}`,
                    'Accept': 'application/json'
                }
            }, { timeout: 15000 });

            // IBM Verify returns 204 No Content on success
            if (!response.ok) {
                const err = await response.text();
                throw new Error(`IBM Verify delete registration failed: ${response.status} ${err}`);
            }
            res.json({ success: true });
        } catch (err) {
            console.error('[DMV-PASSKEY] delete error:', err);
            res.status(500).json({ error: 'Failed to delete passkey', details: err.message });
        }
    });

    app.use('/auth/passkey', passkeyRouter);

    // --- Diagency routes ---
    const diagencyRouter = express.Router();

    // Apply authentication middleware to all diagency routes
    diagencyRouter.use(requireValidSession);

    // POST /v1.0/oidvc/vci/offers - Create credential offers
    // The offer ID returned by diagency is stored in the server session so it
    // never needs to be echoed back as a user-controlled URL parameter.
    diagencyRouter.post('/offers', async (req, res) => {
        console.log('[DMV-DIAGENCY] POST /credentials/offers called — assembling credential_data server-side');
        try {
            const userInfo = req.session.user?.userInfo || {};
            const p = {
                ...DMV_PROFILE_DEFAULTS,
                id:        userInfo.sub        || DMV_PROFILE_DEFAULTS.id,
                firstName: userInfo.given_name || DMV_PROFILE_DEFAULTS.firstName,
                lastName:  userInfo.family_name || DMV_PROFILE_DEFAULTS.lastName,
                email:     userInfo.email      || DMV_PROFILE_DEFAULTS.email,
            };

            const credential_data = {
                'org.iso.18013.5.1:document_number':   p.licenseNumber,
                'org.iso.18013.5.1:issue_date':        p.issueDate,
                'org.iso.18013.5.1:expiry_date':       p.expiryDate,
                'org.iso.18013.5.1:given_name':        p.firstName,
                'org.iso.18013.5.1:family_name':       p.lastName,
                'org.iso.18013.5.1:birth_date':        p.dateOfBirth,
                'org.iso.18013.5.1:issuing_country':   p.issuingCountry,
                'org.iso.18013.5.1:issuing_authority': p.issuingAuthority,
                'org.iso.18013.5.1:portrait':          DMV_PORTRAIT,
                'org.iso.18013.5.1:driving_privileges':    p.drivingPrivileges,
                'org.iso.18013.5.1:un_distinguishing_sign': p.issuingCountry,
                'org.iso.18013.5.1:resident_address':      p.residentAddress,
                'org.iso.18013.5.1:resident_city':         p.residentCity,
                'org.iso.18013.5.1:resident_state':        p.residentState,
                'org.iso.18013.5.1:resident_postal_code':  p.residentPostalCode,
                'org.iso.18013.5.1:resident_country':      'AU',
            };

            const payload = {
                credential_configuration_ids: [process.env.REACT_APP_CREDENTIAL_DEFINITION_ID],
                credential_data,
            };

            const token = await getOrRefreshDmvToken();
            const targetUrl = `${diagencyAccountUrl}/v1.0/oidvc/vci/offers`;
            const response = await reliableFetch(targetUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                },
                body: JSON.stringify(payload),
            }, { timeout: 30000 });

            const responseText = await response.text();
            if (!response.ok) {
                console.error(`[DMV-DIAGENCY] Diagency POST /offers failed: ${response.status} ${responseText}`);
                return res.status(response.status).json({ error: 'Failed to create credential offer', message: responseText });
            }

            const data = JSON.parse(responseText);
            if (data?.id) {
                req.session.currentOfferId = data.id;
                await new Promise((resolve, reject) =>
                    req.session.save(err => err ? reject(err) : resolve())
                );
                console.log(`[DMV-DIAGENCY] Stored offer ID in session: ${sanitizeForLog(data.id)}`);
            }
            return res.json(data);
        } catch (err) {
            console.error('[DMV-DIAGENCY] Error creating credential offer:', err.message);
            return res.status(500).json({ error: 'Failed to create credential offer', details: err.message });
        }
    });

    // GET /v1.0/oidvc/vci/offers - Get current session offer status or QR code image.
    // The offer ID is read exclusively from the server session — never from user input.
    // Image requests (Accept: image/png) are proxied directly to diagency.
    // For JSON state-poll requests, if diagency returns 404 the offer has been consumed;
    // confirm issuance via the credentials endpoint and return a synthetic Completed/Error.
    diagencyRouter.get('/offers', async (req, res) => {
        const id = req.session.currentOfferId;
        if (!id) {
            console.warn('[DMV-DIAGENCY] GET /offers called but no offer ID in session');
            return res.status(400).json({ error: 'No active offer', message: 'No credential offer found for this session' });
        }
        console.log(`[DMV-DIAGENCY] GET /credentials/offers called, using session offer ID: ${sanitizeForLog(id)}`);

        // Image requests: fetch from Diagency using server-controlled parameters only.
        // No client headers or query parameters are forwarded.
        if (req.headers.accept?.includes('image/')) {
            const token = await getOrRefreshDmvToken();
            const imageUrl = `${diagencyAccountUrl}/v1.0/oidvc/vci/offers/${id}`;
            return fetchOfferImage(res, token, imageUrl);
        }

        try {
            const token = await getOrRefreshDmvToken();
            const offerUrl = `${diagencyAccountUrl}/v1.0/oidvc/vci/offers/${id}`;
            const offerRes = await reliableFetch(offerUrl, {
                headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
            }, {
                timeout: 30000,
                onRetry: (attempt, error) => {
                    console.log(`[DMV-DIAGENCY] Retrying offer state check, attempt ${attempt}. Error: ${error.message}`);
                },
            });

            if (offerRes.status === 404) {
                // Offer no longer exists — confirm issuance via the credentials endpoint.
                console.log(`[DMV-DIAGENCY] Offer ${sanitizeForLog(id)} returned 404 — checking credentials endpoint`);
                const credUrl = `${diagencyAccountUrl}/v1.0/diagency/credentials?filter=${encodeURIComponent(JSON.stringify({ oid4vci_offer_id: id }))}`;
                const credRes = await reliableFetch(credUrl, {
                    headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
                }, {
                    timeout: 30000,
                    onRetry: (attempt, error) => {
                        console.log(`[DMV-DIAGENCY] Retrying credentials lookup, attempt ${attempt}. Error: ${error.message}`);
                    },
                });

                if (!credRes.ok) {
                    console.error(`[DMV-DIAGENCY] Credentials lookup failed: ${credRes.status}`);
                    return res.status(200).json({ state: 'Error' });
                }

                const credData = await credRes.json();
                if (credData.count > 0 && credData.items?.length > 0) {
                    console.log(`[DMV-DIAGENCY] Credential confirmed issued for offer ${sanitizeForLog(id)}`);
                    return res.status(200).json({ state: 'Completed' });
                } else {
                    console.warn(`[DMV-DIAGENCY] Offer 404 but no credentials found for offer ${sanitizeForLog(id)}`);
                    return res.status(200).json({ state: 'Error' });
                }
            }

            if (!offerRes.ok) {
                const errText = await offerRes.text();
                console.error(`[DMV-DIAGENCY] Offer status check failed: ${offerRes.status} ${errText}`);
                return res.status(offerRes.status).json({ error: 'Offer request failed', message: errText });
            }

            const data = await offerRes.json();
            return res.status(200).json(data);
        } catch (err) {
            console.error('[DMV-DIAGENCY] Error checking offer state:', err.message);
            return res.status(500).json({ error: 'Failed to check offer state', details: err.message });
        }
    });

    // Handle all other paths with 403 Forbidden
    diagencyRouter.use((req, res) => {
        console.warn(`Blocked unauthorized ${sanitizeForLog(req.method)} request to ${sanitizeForLog(req.url)}`);
        res.status(403).json({
            error: 'Forbidden',
            message: 'Access to this endpoint is forbidden'
        });
    });

    app.use('/credentials', diagencyRouter);
}
