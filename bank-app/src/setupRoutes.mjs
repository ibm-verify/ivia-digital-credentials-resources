/**
 * Setup proxy for development server
 * Handles proxying requests to external services
 * ESM version for consistency with bankapp
 */
import express from 'express';
import bodyParser from 'body-parser';
import * as client from 'openid-client';
import session from 'express-session';
import crypto from 'crypto';
import { reliableFetch, reliableFetchGet, reliableFetchPost } from './reliableFetch.mjs';

// External service URLs
const diagencyAccountUrl = process.env.REACT_APP_ACCOUNT_URL || '';
const tokenUrl = process.env.REACT_APP_TOKEN_ENDPOINT || '';

// Bank agent credentials - stored securely on server side only
const bankAgentClientId = process.env.REACT_APP_BANK_AGENT_CLIENT_ID || '';
const bankAgentPassword = process.env.REACT_APP_BANK_AGENT_PASSWORD || '';

// IBM Verify configuration, for managing users and groups (signup) and passkey FIDO2
const ibmVerifyBaseUrl = process.env.IBM_VERIFY_BASE_URL || '';
const ibmVerifyTokenUrl = process.env.IBM_VERIFY_TOKEN_URL || '';
const ibmVerifyClientId = process.env.IBM_VERIFY_CLIENT_ID || '';
const ibmVerifyClientSecret = process.env.IBM_VERIFY_CLIENT_SECRET || '';
const bankUsersGroupName = process.env.IBM_VERIFY_BANK_USERS_GROUP || '';
const fido2RelyingPartyId = process.env.IBM_VERIFY_FIDO2_RELYING_PARTY_ID || '';
const projectName = process.env.PROJECT_NAME || '';

// OIDC Environment Variables
const w3Root = process.env.REACT_APP_BANK_W3_ROOT || '';
const clientId = process.env.REACT_APP_BANK_CLIENT_ID || '';
const clientSecret = process.env.REACT_APP_BANK_CLIENT_SECRET || '';
const redirectUri = process.env.REACT_APP_BANK_REDIRECT_URL || '';
const logoutRedirectUri = process.env.REACT_APP_BANK_LOGOUT_REDIRECT_URL || '';


// Token storage - server-side only, not exposed to client
const tokenStorage = {
    accessToken: '',
    expiresAt: 0
};

// Token storage for IBM Verify
const ibmVerifyTokenStorage = {
    accessToken: '',
    expiresAt: 0
};

// Session configuration
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
    name: 'bank.session.id'
};

// --Authentication middleware--
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
    console.log('[BANK-AUTH] Checking session validity');
    console.log('[BANK-AUTH] Session exists:', !!req.session);
    console.log('[BANK-AUTH] User in session:', !!req.session?.user);
    console.log('[BANK-AUTH] User authenticated:', req.session?.user?.authenticated);

    if (!req.session?.user?.authenticated) {
        console.log('[BANK-AUTH] Authentication required - no valid session found');
        return res.status(401).json({
            error: 'Unauthorized',
            message: 'Authentication required'
        });
    }

    // Check if tokens are expired
    const now = Date.now();
    if (req.session.user.tokenExpiresAt && req.session.user.tokenExpiresAt < now) {
        console.log('[BANK-AUTH] Session expired');
        req.session.destroy();
        return res.status(401).json({
            error: 'Session Expired',
            message: 'Please login again'
        });
    }

    console.log('[BANK-AUTH] Session valid, proceeding');
    next();
}

/**
 * Sanitize user input for safe logging
 * Prevents log injection attacks by removing control characters
 */
function sanitizeForLog(str) {
    if (typeof str !== 'string') return String(str);
    return str
        .replace(/[\r\n]/g, '') // Remove newlines
        .replace(/[\x00-\x1F\x7F-\x9F]/g, '') // Remove control characters
}


/**
 * Forward a request to an external service and handle the response
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {string} targetUrl - URL to forward the request to
 * @param {Object} options - Additional options for the request
 */
async function callDigitalCredsService(req, targetUrl, options = {}) {
    let result = {};
    result.headers = {};
    try {
        const isImageRequest = req.headers.accept && req.headers.accept.includes('image/');

        const fetchOptions = {
            method: req.method,
            headers: {
                ...req.headers,
                ...(options.headers || {}),
                host: new URL(targetUrl).host
            },
            redirect: options.followRedirects ? 'manual' : 'follow'
        };

        // Add body if present and method supports it
        if (req.body && req.method !== 'GET' && req.method !== 'HEAD') {
            if (req.body instanceof URLSearchParams) {
                fetchOptions.body = req.body;
            } else if (typeof req.body === 'string') {
                fetchOptions.body = req.body;
            } else {
                fetchOptions.body = JSON.stringify(req.body);
            }
        }

        const response = await reliableFetch(targetUrl, fetchOptions, {
            timeout: options.timeout || 10000,
            onRetry: (attempt, error) => {
                console.log(`[BANK-PROXY] Retrying request to ${targetUrl}, attempt ${attempt}. Error: ${error.message}`);
            }
        });

        // Forward response status and headers
        result.status = response.status;
        response.headers.forEach((value, key) => {
            // Skip transfer-encoding and content-encoding headers
            // content-encoding is handled by fetch automatically, so we shouldn't forward it
            // as the body is already decompressed
            if (key !== 'transfer-encoding' && key !== 'content-encoding') {
                result.headers[key] = value;
            }
        });

        // For authorization endpoint, check if we need to redirect
        if (options.followRedirects && response.headers.get('location')) {
            result.headers["location"] = response.headers.get('location');
            return result;
        }

        // Check content type to determine how to handle the response
        const contentType = response.headers.get('content-type') || '';

        // Send response data based on type
        if (options.jsonResponse || contentType.includes('application/json')) {
            result.json = await response.json();
        } else if (isImageRequest || contentType.includes('image/')) {
            // For image responses, send the binary data directly
            const arrayBuffer = await response.arrayBuffer();
            result.buffer = Buffer.from(arrayBuffer);
        } else {
            result.data = await response.text();
        }
    } catch (error) {
        result = handleRequestError(error, options);
    }

    return result;
}

/**
 * Handle errors from forwarded requests
 * @param {Error} error - Error object
 * @param {Object} res - Express response object
 * @param {Object} options - Additional options for error handling
 */
function handleRequestError(error, options = {}) {
    let result = {};
    result.headers = {};

    // For fetch errors, we don't have a response object
    result.status = 504;
    result.json = {
        error: 'Gateway Timeout',
        message: error.message || 'No response received from server'
    };

    return result;
}

// -- OIDC Setup --
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

export default function setupProxy(app) {
    // Trust proxy - required when behind a reverse proxy (like in production)
    // This ensures secure cookies work correctly with HTTPS termination at the proxy
    app.set('trust proxy', 1);

    // Add body parsing middleware
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
                        console.log(`[BANK-OIDC] Retrying OIDC token exchange, attempt ${attempt}. Error: ${error.message}`);
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
                            console.log(`[BANK-OIDC] Retrying userinfo request, attempt ${attempt}. Error: ${error.message}`);
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

    // Passkey FIDO2 routes
    // IBM Verify FIDO2 base path: /v2.0/factors/fido2/relyingparties/{rpId}
    const passkeyRouter = express.Router();

    // Initiate passkey registration — returns a WebAuthn PublicKeyCredentialCreationOptions challenge.
    passkeyRouter.post('/register/options', requireValidSession, async (req, res) => {
        try {
            if (!fido2RelyingPartyId) {
                return res.status(500).json({ error: 'FIDO2 relying party not configured (IBM_VERIFY_FIDO2_RELYING_PARTY_ID)' });
            }
            const userToken = req.session.user.tokens.access_token;
            const userId = req.session.user.userInfo?.sub;
            const displayName = req.session.user.userInfo?.name || req.session.user.userInfo?.email || 'Bank User';

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
            res.json(await response.json());
        } catch (err) {
            console.error('[BANK-PASSKEY] register/options error:', err);
            res.status(500).json({ error: 'Failed to get passkey registration options', details: err.message });
        }
    });

    // Complete passkey registration — verifies the authenticator's attestation with IBM Verify.
    // Body: { credential: RegistrationResponseJSON, nickname: string }
    passkeyRouter.post('/register/complete', requireValidSession, async (req, res) => {
        try {
            if (!fido2RelyingPartyId) {
                return res.status(500).json({ error: 'FIDO2 relying party not configured' });
            }
            const userToken = req.session.user.tokens.access_token;
            const { credential, nickname } = req.body;
            if (!credential) return res.status(400).json({ error: 'Missing credential in request body' });

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
            res.json({ success: true, result: await response.json() });
        } catch (err) {
            console.error('[BANK-PASSKEY] register/complete error:', err);
            res.status(500).json({ error: 'Failed to complete passkey registration', details: err.message });
        }
    });

    // Initiate passkey authentication — no session required, uses server-side admin token.
    passkeyRouter.post('/login/options', async (req, res) => {
        try {
            if (!fido2RelyingPartyId) {
                return res.status(500).json({ error: 'FIDO2 relying party not configured' });
            }
            const token = await getOrRefreshIbmVerifyToken();

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
            res.json(await response.json());
        } catch (err) {
            console.error('[BANK-PASSKEY] login/options error:', err);
            res.status(500).json({ error: 'Failed to get passkey authentication options', details: err.message });
        }
    });

    // Complete passkey authentication — IBM Verify verifies the signed challenge, establishes session.
    // Body: { credential: AuthenticationResponseJSON }
    passkeyRouter.post('/login/complete', async (req, res) => {
        try {
            if (!fido2RelyingPartyId) {
                return res.status(500).json({ error: 'FIDO2 relying party not configured' });
            }
            const token = await getOrRefreshIbmVerifyToken();
            const { credential } = req.body;
            if (!credential) return res.status(400).json({ error: 'Missing credential in request body' });

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

            // Look up the user via SCIM to get profile claims (FIDO2 JWT has none).
            let userInfo = { sub: result.userId };
            try {
                const adminToken = await getOrRefreshIbmVerifyToken();
                const scimRes = await reliableFetchGet(
                    `${ibmVerifyBaseUrl}/v2.0/Users/${result.userId}`,
                    { headers: { Authorization: `Bearer ${adminToken}`, Accept: 'application/scim+json' } },
                    { timeout: 10000 }
                );
                if (scimRes.ok) {
                    const scimUser = await scimRes.json();
                    userInfo = {
                        sub: scimUser.id || result.userId,
                        name: scimUser.name?.formatted,
                        given_name: scimUser.name?.givenName,
                        family_name: scimUser.name?.familyName,
                        email: scimUser.emails?.[0]?.value
                    };
                } else {
                    console.error('[BANK-PASSKEY] SCIM user lookup failed:', scimRes.status, await scimRes.text());
                }
            } catch (e) {
                console.error('[BANK-PASSKEY] SCIM lookup error:', e.message);
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
            console.error('[BANK-PASSKEY] login/complete error:', err);
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
            console.error('[BANK-PASSKEY] list error:', err);
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
            console.error('[BANK-PASSKEY] delete error:', err);
            res.status(500).json({ error: 'Failed to delete passkey', details: err.message });
        }
    });
    app.use('/auth/passkey', passkeyRouter);

    // Helper function to get a valid token or refresh if needed
    async function getOrRefreshBankToken() {
        try {
            // Check if we have a valid token that's not expired
            if (tokenStorage.accessToken && tokenStorage.expiresAt > Date.now()) {
                return tokenStorage.accessToken;
            }

            // Create URLSearchParams for the form body
            const formBody = new URLSearchParams({
                client_id: bankAgentClientId,
                client_secret: bankAgentPassword,
                grant_type: 'client_credentials'
            });

            // Make the token request directly from the server using reliable fetch
            const response = await reliableFetchPost(tokenUrl, formBody, {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Accept': 'application/json'
                }
            }, {
                timeout: 30000,
                onRetry: (attempt, error) => {
                    console.log(`[BANK-TOKEN] Retrying token request, attempt ${attempt}. Error: ${error.message}`);
                }
            });

            if (!response.ok) {
                throw new Error(`Token request failed: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();

            // Store the token and calculate expiry time (subtract 60 seconds for safety margin)
            tokenStorage.accessToken = data.access_token;
            tokenStorage.expiresAt = Date.now() + (data.expires_in * 1000) - 60000;

            return tokenStorage.accessToken;
        } catch (error) {
            console.error('Error getting bank token:', error.message);
            throw error;
        }
    }

    // Helper functions for IBM Verify API interactions
    function assertIbmVerifyConfig() {
        const missing = [];

        if (!ibmVerifyBaseUrl) missing.push('IBM_VERIFY_BASE_URL');
        if (!ibmVerifyClientId) missing.push('IBM_VERIFY_CLIENT_ID');
        if (!ibmVerifyClientSecret) missing.push('IBM_VERIFY_CLIENT_SECRET');

        if (missing.length > 0) {
            throw new Error(`IBM Verify signup is not configured. Missing: ${missing.join(', ')}`);
        }
    }

    async function getOrRefreshIbmVerifyToken() {
        assertIbmVerifyConfig();

        if (ibmVerifyTokenStorage.accessToken && ibmVerifyTokenStorage.expiresAt > Date.now()) {
            return ibmVerifyTokenStorage.accessToken;
        }

        const formBody = new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: ibmVerifyClientId,
            client_secret: ibmVerifyClientSecret
        });

        const response = await reliableFetchPost(ibmVerifyTokenUrl, formBody, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json'
            }
        }, {
            timeout: 30000,
            onRetry: (attempt, error) => {
                console.log(`[IBM-VERIFY] Retrying token request, attempt ${attempt}. Error: ${error.message}`);
            }
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`IBM Verify token request failed: ${response.status} ${errorText}`);
        }

        const data = await response.json();

        if (!data.access_token) {
            throw new Error('IBM Verify token response did not contain access_token');
        }

        ibmVerifyTokenStorage.accessToken = data.access_token;
        ibmVerifyTokenStorage.expiresAt = Date.now() + (data.expires_in * 1000) - 60000;

        return ibmVerifyTokenStorage.accessToken;
    }
    // Build the user object for IBM Verify API based on form data
    function buildIbmVerifyUser(formData) {
        let userName = formData.email;
        if (projectName !== "") {
            userName = `${formData.email.split('@')[0]}-${projectName}`;
        }
        return {
            schemas: [
                'urn:ietf:params:scim:schemas:core:2.0:User'
            ],
            userName,
            name: {
                givenName: formData.firstName,
                familyName: formData.lastName
            },
            emails: [
                {
                    value: formData.email,
                    type: 'work',
                    primary: true
                }
            ],
            phoneNumbers: formData.phone
                ? [
                    {
                        value: formData.phone,
                        type: 'mobile'
                    }
                ]
                : [],
            addresses: [
                {
                    streetAddress: formData.address,
                    locality: formData.city,
                    region: formData.state,
                    postalCode: formData.zipCode,
                    country: formData.country,
                    type: 'home'
                }
            ],
            active: true
        };
    }
    // Create a new user in IBM Verify using the API
    async function createIbmVerifyUser(formData) {
        const accessToken = await getOrRefreshIbmVerifyToken();
        const scimUser = buildIbmVerifyUser(formData);

        const response = await reliableFetch(`${ibmVerifyBaseUrl}/v2.0/Users`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/scim+json',
                'Accept': 'application/scim+json'
            },
            body: JSON.stringify(scimUser)
        }, {
            timeout: 30000,
            onRetry: (attempt, error) => {
                console.log(`[IBM-VERIFY] Retrying create user request, attempt ${attempt}. Error: ${error.message}`);
            }
        });

        const responseText = await response.text();

        if (!response.ok) {
            throw new Error(`IBM Verify create user failed: ${response.status} ${responseText}`);
        }

        try {
            return JSON.parse(responseText);
        } catch {
            return { raw: responseText };
        }
    }

    // Find an IBM Verify group by name, return the group object
    async function findIbmVerifyGroupByName(groupName) {
        const accessToken = await getOrRefreshIbmVerifyToken();
        const filter = encodeURIComponent(`displayName eq "${groupName}"`);
        const url = `${ibmVerifyBaseUrl}/v2.0/Groups?filter=${filter}&attributes=id,displayName`;

        const response = await reliableFetch(url, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Accept': 'application/scim+json'
            }
        }, {
            timeout: 30000,
            onRetry: (attempt, error) => {
                console.log(`[IBM-VERIFY] Retrying group lookup request, attempt ${attempt}. Error: ${error.message}`);
            }
        });

        const responseText = await response.text();

        if (!response.ok) {
            throw new Error(`IBM Verify group lookup failed: ${response.status} ${responseText}`);
        }

        const data = JSON.parse(responseText);
        const groups = data.Resources || data.resources || [];
        const group = groups.find((item) => item.displayName === groupName);

        if (!group?.id) {
            throw new Error(`IBM Verify group not found: ${groupName}`);
        }

        return group;
    }

    // Add a user to an IBM Verify group using the API
    async function addIbmVerifyUserToGroup(userId, groupName) {
        const accessToken = await getOrRefreshIbmVerifyToken();
        const group = await findIbmVerifyGroupByName(groupName);

        const patchBody = {
            schemas: [
                'urn:ietf:params:scim:api:messages:2.0:PatchOp'
            ],
            Operations: [
                {
                    op: 'add',
                    path: 'members',
                    value: [
                        {
                            type: 'user',
                            value: userId
                        }
                    ]
                },
                {
                    op: 'add',
                    path: 'urn:ietf:params:scim:schemas:extension:ibm:2.0:Notification:notifyType',
                    value: 'NONE'
                }
            ]
        };

        const response = await reliableFetch(`${ibmVerifyBaseUrl}/v2.0/Groups/${group.id}`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/scim+json',
                'Accept': 'application/scim+json'
            },
            body: JSON.stringify(patchBody)
        }, {
            timeout: 30000,
            onRetry: (attempt, error) => {
                console.log(`[IBM-VERIFY] Retrying add user to group request, attempt ${attempt}. Error: ${error.message}`);
            }
        });

        if (!response.ok) {
            const responseText = await response.text();
            throw new Error(`IBM Verify add user to group failed: ${response.status} ${responseText}`);
        }

        return group;
    }

    async function deleteIbmVerifyUser(userId) {
        const accessToken = await getOrRefreshIbmVerifyToken();
        const response = await reliableFetch(`${ibmVerifyBaseUrl}/v2.0/Users/${encodeURIComponent(userId)}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Accept': 'application/scim+json'
            }
        }, {
            timeout: 30000,
            onRetry: (attempt, error) => {
                console.log(`[IBM-VERIFY] Retrying delete user request, attempt ${attempt}. Error: ${error.message}`);
            }
        });

        if (response.status === 404) {
            return;
        }

        if (!response.ok) {
            const responseText = await response.text();
            throw new Error(`IBM Verify delete user failed: ${response.status} ${responseText}`);
        }
    }

    async function revokeRefreshToken(refreshToken) {
        const config = await loadOidcClient();
        await client.tokenRevocation(config, refreshToken);
    }

    function destroyBankSession(req, res) {
        return new Promise((resolve) => {
            req.session.destroy((error) => {
                if (error) {
                    console.error('[BANK-ACCOUNT] Session destruction error:', error);
                }

                res.clearCookie(sessionConfig.name, {
                    path: '/',
                    secure: sessionConfig.cookie.secure,
                    sameSite: sessionConfig.cookie.sameSite
                });
                resolve();
            });
        });
    }

    function regenerateBankSession(req) {
        return new Promise((resolve, reject) => {
            req.session.regenerate((error) => {
                if (error) reject(error);
                else resolve();
            });
        });
    }

    function saveBankSession(req) {
        return new Promise((resolve, reject) => {
            req.session.save((error) => {
                if (error) reject(error);
                else resolve();
            });
        });
    }

    // Helper function to forward authenticated requests to diagency
    async function preCallDigitalCredsService(req, res, path) {
        let result = {};
        try {
            const targetUrl = `${diagencyAccountUrl}${path}`;
            const options = { timeout: 30000 };

            // Get the server-side token
            const token = await getOrRefreshBankToken();

            // Always override any Authorization header with our server-side token
            const headers = {
                ...req.headers,
                'Content-Type': 'application/json'
            };
            headers.authorization = `Bearer ${token}`;
            options.headers = headers;

            result = callDigitalCredsService(req, targetUrl, options);
        } catch (error) {
            console.error('Error handling diagency request:', error.message);
            result.status = 500;
            result.json = { error: 'Failed to process request' };
        }
        return result;
    }

    async function sendDigitalCredsResult(res, result) {
        if (result.headers && result.headers["location"] !== undefined) {
            res.redirect(result.headers["location"]);
            return;
        }

        Object.entries(result.headers).forEach(([key, value]) => {
            res.set(key, value);
        });

        if (result.json) {
            res.status(result.status).json(result.json);
            return;
        }

        if (result.data) {
            res.status(result.status).send(result.data);
            return;
        }

        if (result.buffer) {
            res.status(result.status).send(result.buffer);
            return;
        }

        res.send();
        return;
    }

    // Diagency endpoint router with specific allowed paths
    const diagencyRouter = express.Router();

    // For api requests to bank app itself
    const bankApiRouter = express.Router();

    const presentationExchanges = {
        signup: ['dcRes', 'REACT_APP_EXCHANGE_TEMPLATE_ID'],
        employment: ['employmentDcRes', 'REACT_APP_HR_EXCHANGE_TEMPLATE_ID']
    };

    const getPresentationExchange = (req) => {
        const purpose = req.body?.purpose ?? req.query?.purpose ?? 'signup';
        const exchange = presentationExchanges[purpose];

        if (!exchange) {
            const error = new Error(`Unsupported presentation purpose: ${purpose}`);
            error.status = 400;
            throw error;
        }

        const [sessionKey, templateEnv] = exchange;
        return {
            sessionKey,
            templateEnv,
            templateId: process.env[templateEnv]
        };
    };

    const verifiedSignupFormData = async (req, res, formData) => {
        const exchangeId = req.session?.dcRes?.json?.id;
        const executionState = req.session?.dcRes?.json?.execution_state;

        if (!exchangeId || executionState !== 'success') {
            const error = new Error('A successful driver licence verification is required before signup.');
            error.status = 403;
            throw error;
        }

        const verification = await preCallDigitalCredsService(
            { method: 'GET', headers: { 'Content-Type': 'application/json' } },
            res,
            `/v1.0/diagency/verifications/${exchangeId}`
        );
        const attributes = verification.json?.oid4vp?.[0]?.decoded?.attributes;

        if (!Array.isArray(attributes)) {
            const error = new Error('The driver licence verification did not return identity attributes.');
            error.status = 422;
            throw error;
        }

        const claims = new Map(attributes.map((attribute) => [attribute.id, attribute.value]));
        const firstName = claims.get('given_name');
        const lastName = claims.get('family_name');

        if (!firstName || !lastName) {
            const error = new Error('The verified driver licence is missing the account holder name.');
            error.status = 422;
            throw error;
        }

        return {
            ...formData,
            firstName,
            lastName,
            address: claims.get('resident_address') || '',
            city: claims.get('resident_city') || '',
            state: claims.get('resident_state') || '',
            zipCode: claims.get('resident_postal_code') || '',
            country: claims.get('resident_country') || '',
            birthDate: claims.get('birth_date') || ''
        };
    };

    // POST /verifiable/presentation - Create or get exchange based on session state
    diagencyRouter.post('/verifiable/presentation', async (req, res) => {
        try {
            const exchange = getPresentationExchange(req);

            if (!exchange.templateId) {
                return res.status(500).json({
                    error: 'Configuration Error',
                    message: `Missing ${exchange.templateEnv}`
                });
            }

            const existingExchangeId = req.session[exchange.sessionKey]?.json?.id;
            if (existingExchangeId) {
                const deleteReq = {
                    method: 'DELETE',
                    headers: {
                        'Content-Type': 'application/json',
                    }
                };

                try {
                    await preCallDigitalCredsService(deleteReq, res, `/v1.0/oidvc/vp/exchange/${existingExchangeId}`);
                } catch (err) {
                    console.log(`Deleting existing exchange '${existingExchangeId}' failed`);
                    console.error(err);
                }
            }

            const dcReq = {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: {
                    template_id: exchange.templateId,
                    with_qr_code: req.body.with_qr_code === true,
                }
            };

            const dcRes = await preCallDigitalCredsService(dcReq, res, '/v1.0/oidvc/vp/exchange');
            req.session[exchange.sessionKey] = dcRes;
            sendDigitalCredsResult(res, dcRes);
        } catch (error) {
            console.error('Error in POST /verifiable/presentation:', error);
            res.status(error.status || 500).json({ error: 'Internal Server Error', message: error.message });
        }
    });

    // GET /verifiable/presentation - Get exchange by ID in session
    diagencyRouter.get('/verifiable/presentation', async (req, res) => {
        try {
            const exchange = getPresentationExchange(req);

            // Check if session has dcRes
            if (!req.session[exchange.sessionKey]) {
                return res.status(400).json({
                    error: 'Bad Request',
                    message: 'No active session or exchange not initialized'
                });
            }

            // Get exchange ID from session
            const exchangeId = req.session[exchange.sessionKey].json?.id;

            if (!exchangeId) {
                return res.status(400).json({
                    error: 'Bad Request',
                    message: 'Exchange ID not found in session'
                });
            }

            const dcReq = {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                }
            };

            const dcRes = await preCallDigitalCredsService(dcReq, res, `/v1.0/oidvc/vp/exchange/${exchangeId}`);

            // Update session with new response
            req.session[exchange.sessionKey] = dcRes;

            // Send response
            sendDigitalCredsResult(res, dcRes);
        } catch (error) {
            console.error('Error in GET /verifiable/presentation:', error);
            res.status(error.status || 500).json({ error: 'Internal Server Error', message: error.message });
        }
    });

    // GET /verifiable/presentation/vc - Get verification by ID in session
    diagencyRouter.get('/verifiable/presentation/vc', async (req, res) => {
        try {
            const exchange = getPresentationExchange(req);

            // Check if session has dcRes
            if (!req.session[exchange.sessionKey]) {
                return res.status(400).json({
                    error: 'Bad Request',
                    message: 'No active session or exchange not initialized'
                });
            }

            // Get exchange ID from session
            const exchangeId = req.session[exchange.sessionKey].json?.id;

            if (!exchangeId) {
                return res.status(400).json({
                    error: 'Bad Request',
                    message: 'Exchange ID not found in session'
                });
            }

            const dcReq = {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                }
            };


            const dcRes = await preCallDigitalCredsService(dcReq, res, `/v1.0/diagency/verifications/${exchangeId}`);

            const resultToSend = {
                status: dcRes.status,
                headers: dcRes.headers,
            }

            resultToSend.json = {
                attributes: dcRes.json?.oid4vp?.[0]?.decoded?.attributes,
            };

            // Send response (don't update session for vc endpoint)
            sendDigitalCredsResult(res, resultToSend);
        } catch (error) {
            console.error('Error in GET /verifiable/presentation/vc:', error);
            res.status(error.status || 500).json({ error: 'Internal Server Error', message: error.message });
        }
    });

    // POST /api/signup - Create a new user in IBM Verify and add to group
    bankApiRouter.post('/signup', async (req, res) => {
        try {
            const formData = req.body || {};

            if (!formData.email || !formData.firstName || !formData.lastName) {
                return res.status(400).json({
                    error: 'Bad Request',
                    message: 'Missing required signup fields'
                });
            }

            const verifiedFormData = await verifiedSignupFormData(req, res, formData);
            const createdUser = await createIbmVerifyUser(verifiedFormData);
            const group = await addIbmVerifyUserToGroup(createdUser.id, bankUsersGroupName);

            const userInfo = {
                sub: createdUser.id,
                name: [createdUser.name?.givenName, createdUser.name?.familyName].filter(Boolean).join(' '),
                given_name: createdUser.name?.givenName,
                family_name: createdUser.name?.familyName,
                email: createdUser.emails?.find((email) => email.primary)?.value
                    || createdUser.emails?.[0]?.value
                    || verifiedFormData.email,
                auth_method: 'verified-credential-signup'
            };

            // Rotate the anonymous verification session before granting Bank access.
            // The old session (including the presentation exchange) is discarded, making it single-use.
            await regenerateBankSession(req);
            req.session.user = {
                authenticated: true,
                userInfo,
                tokens: {
                    access_token: null,
                    id_token: null,
                    refresh_token: null
                },
                tokenExpiresAt: null,
                loginTime: Date.now(),
                authMethod: 'verified-credential-signup'
            };
            await saveBankSession(req);

            res.status(201).json({
                success: true,
                user: {
                    id: createdUser.id,
                    userName: createdUser.userName,
                    emails: createdUser.emails
                },
                userInfo,
                group: {
                    id: group.id,
                    displayName: group.displayName
                }
            });
        } catch (error) {
            console.error('Error creating IBM Verify user:', error.message);
            res.status(error.status || 500).json({
                error: 'Signup Failed',
                message: error.message
            });
        }
    });
    // Delete the authenticated user's Cloud Directory account and local Bank session.
    bankApiRouter.delete('/account', requireValidSession, async (req, res) => {
        try {
            const userId = req.session.user.userInfo?.sub;
            const refreshToken = req.session.user.tokens?.refresh_token;
            const idToken = req.session.user.tokens?.id_token;

            if (!userId) {
                return res.status(400).json({
                    error: 'Account Close Failed',
                    message: 'This session does not contain a user ID.'
                });
            }

            let logoutUrl = null;

            if (idToken) {
                const config = await loadOidcClient();
                const postLogoutRedirectUri = logoutRedirectUri || `${req.protocol}://${req.get('host')}/logoutcallback`;
                logoutUrl = client.buildEndSessionUrl(config, {
                    id_token_hint: idToken,
                    post_logout_redirect_uri: postLogoutRedirectUri
                }).href;
            }

            if (refreshToken) {
                await revokeRefreshToken(refreshToken);
            }

            await deleteIbmVerifyUser(userId);
            await destroyBankSession(req, res);

            res.json({ success: true, logoutUrl });
        } catch (error) {
            console.error('[BANK-ACCOUNT] Close account error:', error.message);
            res.status(500).json({
                error: 'Account Close Failed',
                message: error.message
            });
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
    app.use('/api', bankApiRouter);
}

// Made with Bob
