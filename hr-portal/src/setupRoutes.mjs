/**
 * setupRoutes.mjs
 * Development proxy handling external requests + OIDC auth (IBM Verify) using openid-client v6+
 */

import express from 'express';
import bodyParser from 'body-parser';
import * as client from 'openid-client';
import session from 'express-session';
import crypto from 'crypto';
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
const w3Root = process.env.REACT_APP_HR_W3_ROOT || '';

const hrAgentClientId = process.env.REACT_APP_HR_AGENT_CLIENT_ID || '';
const hrAgentPassword = process.env.REACT_APP_HR_AGENT_PASSWORD || '';

const clientId = process.env.REACT_APP_HR_CLIENT_ID || '';
const clientSecret = process.env.REACT_APP_HR_CLIENT_SECRET || '';
const redirectUri = process.env.REACT_APP_HR_REDIRECT_URL || '';
const logoutRedirectUri = process.env.REACT_APP_HR_LOGOUT_REDIRECT_URL || process.env.HR_LOGOUT_REDIRECT_URL || '';

// --- Token storage ---
const tokenStorage = { accessToken: '', expiresAt: 0 };

// --- Session configuration ---
const isProduction = (process.env.NODE_ENV === undefined || process.env.NODE_ENV === 'production');
const sessionConfig = {
    secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: isProduction,
        httpOnly: true,
        sameSite: isProduction ? 'strict' : 'lax',
        maxAge: 24 * 60 * 60 * 1000
    },
    name: 'hr.session.id'
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
    console.log('[HR-AUTH] Checking session validity');
    console.log('[HR-AUTH] Session exists:', !!req.session);
    console.log('[HR-AUTH] User in session:', !!req.session?.user);
    console.log('[HR-AUTH] User authenticated:', req.session?.user?.authenticated);

    if (!req.session?.user?.authenticated) {
        console.log('[HR-AUTH] Authentication required - no valid session found');
        return res.status(401).json({
            error: 'Unauthorized',
            message: 'Authentication required'
        });
    }

    const now = Date.now();
    if (req.session.user.tokenExpiresAt && req.session.user.tokenExpiresAt < now) {
        console.log('[HR-AUTH] Session expired');
        req.session.destroy();
        return res.status(401).json({
            error: 'Session Expired',
            message: 'Please login again'
        });
    }

    console.log('[HR-AUTH] Session valid, proceeding');
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
        console.log(`[HR-DIAGENCY] Fetching offer image from Diagency`);
        const response = await reliableFetch(url, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'image/png',
            },
        }, { timeout: 30000 });

        if (!response.ok) {
            console.error(`[HR-DIAGENCY] Offer image fetch failed: ${response.status}`);
            return res.status(response.status).json({ error: 'Failed to fetch offer image' });
        }

        const arrayBuffer = await response.arrayBuffer();
        console.log(`[HR-DIAGENCY] Sending offer image, size: ${arrayBuffer.byteLength} bytes`);
        res.setHeader('Content-Type', 'image/png');
        return res.send(Buffer.from(arrayBuffer));
    } catch (error) {
        console.error(`[HR-DIAGENCY] Error fetching offer image:`, error);
        return res.status(504).json({ error: 'Gateway Timeout', message: error.message });
    }
}

// --- HR Token Helper ---
async function getOrRefreshHrToken() {
    if (tokenStorage.accessToken && tokenStorage.expiresAt > Date.now()) return tokenStorage.accessToken;

    const formBody = new URLSearchParams({
        client_id: hrAgentClientId,
        client_secret: hrAgentPassword,
        grant_type: 'client_credentials'
    });

    const response = await reliableFetchPost(tokenUrl, formBody, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }
    }, {
        timeout: 30000,
        onRetry: (attempt, error) => {
            console.log(`[HR-TOKEN] Retrying token request, attempt ${attempt}. Error: ${error.message}`);
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
            const issuerUrl = new URL(w3Root + '/oauth2');
            const configUrl = new URL(w3Root + '/oauth2/.well-known/openid-configuration');
            console.log(`Attempting to discover OIDC configuration from: ${configUrl.href}`);

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

// --- HR Profile Defaults (server-side constants for credential issuance) ---
const HR_PROFILE_DEFAULTS = {
    id: 'employee-10017',
    firstName: 'Mia',
    lastName: 'Kerr',
    email: 'mia.kerr@examplecorp.test',
    employeeId: 'EMP-48217',
    documentNumber: 'POE-2026-48217',
    employerName: 'International Business Machines',
    employerEntityId: 'ABN 12 345 678 901',
    jobTitle: 'Technical Specialist',
    department: 'Engineering',
    employmentStatus: 'Active',
    employmentType: 'Full-time, permanent',
    startDate: '2021-07-12',
    annualIncome: 'AUD 98,400',
    payFrequency: 'Fortnightly',
    workLocation: 'Brisbane, QLD',
    managerName: 'Elena Park',
    issuingAuthority: 'HR Portal Credential Services',
};

// --- Main Export ---
export default function setupRoutes(app) {
    app.set('trust proxy', 1);

    app.use(bodyParser.json());
    app.use(bodyParser.urlencoded({ extended: true }));

    app.use(session(sessionConfig));

    const authRouter = express.Router();

    authRouter.get('/login', async (req, res) => {
        try {
            const config = await loadOidcClient();

            const code_verifier = client.randomPKCECodeVerifier();
            const code_challenge = await client.calculatePKCECodeChallenge(code_verifier);
            const state = client.randomState();

            authParams.set(state, { code_verifier, createdAt: Date.now() });

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
            await loadOidcClient();
            const { code, state } = req.body;
            if (!code || !state) return res.status(400).json({ error: 'Missing code or state' });

            const params = authParams.get(state);
            if (!params) return res.status(400).json({ error: 'Invalid or expired state' });

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
                    console.log(`[HR-OIDC] Retrying OIDC token exchange, attempt ${attempt}. Error: ${error.message}`);
                }
            });

            if (!tokenResponse.ok) {
                throw new Error(`Token exchange failed: ${tokenResponse.status} ${tokenResponse.statusText}`);
            }

            const tokens = await tokenResponse.json();

            authParams.delete(state);

            let userInfo = {};
            try {
                const userInfoEndpoint = new URL(`${w3Root}/oauth2/userinfo`);

                const userInfoResponse = await reliableFetchGet(userInfoEndpoint.href, {
                    headers: {
                        'Authorization': `Bearer ${tokens.access_token}`
                    }
                }, {
                    onRetry: (attempt, error) => {
                        console.log(`[HR-OIDC] Retrying userinfo request, attempt ${attempt}. Error: ${error.message}`);
                    }
                });

                if (userInfoResponse.ok) {
                    userInfo = await userInfoResponse.json();
                } else {
                    throw new Error(`Userinfo request failed: ${userInfoResponse.status}`);
                }
            } catch (error) {
                console.error('Userinfo error:', error);
            }

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

    authRouter.get('/profile', requireValidSession, (req, res) => {
        const userInfo = req.session.user.userInfo || {};
        const profile = {
            ...HR_PROFILE_DEFAULTS,
            id: userInfo.sub || HR_PROFILE_DEFAULTS.id,
            firstName: userInfo.given_name || HR_PROFILE_DEFAULTS.firstName,
            lastName: userInfo.family_name || HR_PROFILE_DEFAULTS.lastName,
            email: userInfo.email || HR_PROFILE_DEFAULTS.email,
        };
        return res.json(profile);
    });

    authRouter.post('/logout', async (req, res) => {
        try {
            let logoutUrl = null;
            const postLogoutRedirectUri = logoutRedirectUri || `${req.protocol}://${req.get('host')}/logoutcallback`;

            if (req.session?.user?.tokens?.id_token) {
                const oidcConfig = await loadOidcClient();
                logoutUrl = client.buildEndSessionUrl(oidcConfig, {
                    id_token_hint: req.session.user.tokens.id_token,
                    post_logout_redirect_uri: postLogoutRedirectUri
                }).href;
            }

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

    const diagencyRouter = express.Router();

    diagencyRouter.use(requireValidSession);

    // POST /v1.0/oidvc/vci/offers - Create credential offers
    // Credential data is assembled server-side from the session and HR_PROFILE_DEFAULTS.
    // The client POST body is ignored — the credential values cannot be supplied by the client.
    // The offer ID returned by diagency is stored in the server session so it
    // never needs to be echoed back as a user-controlled URL parameter.
    diagencyRouter.post('/offers', async (req, res) => {
        console.log('[HR-DIAGENCY] POST /credentials/offers called — assembling credential_data server-side');
        try {
            const userInfo = req.session.user?.userInfo || {};
            const p = {
                ...HR_PROFILE_DEFAULTS,
                id:        userInfo.sub         || HR_PROFILE_DEFAULTS.id,
                firstName: userInfo.given_name  || HR_PROFILE_DEFAULTS.firstName,
                lastName:  userInfo.family_name || HR_PROFILE_DEFAULTS.lastName,
                email:     userInfo.email       || HR_PROFILE_DEFAULTS.email,
            };

            const NS = 'com.example.hr.portal.1:';
            const credential_data = {
                [`${NS}employee_id`]:       p.employeeId,
                [`${NS}document_number`]:   p.documentNumber,
                [`${NS}given_name`]:        p.firstName,
                [`${NS}family_name`]:       p.lastName,
                [`${NS}email`]:             p.email,
                [`${NS}employer_name`]:     p.employerName,
                [`${NS}employer_entity_id`]: p.employerEntityId,
                [`${NS}job_title`]:         p.jobTitle,
                [`${NS}department`]:        p.department,
                [`${NS}employment_status`]: p.employmentStatus,
                [`${NS}employment_type`]:   p.employmentType,
                [`${NS}start_date`]:        p.startDate,
                [`${NS}annual_income`]:     p.annualIncome,
                [`${NS}pay_frequency`]:     p.payFrequency,
                [`${NS}work_location`]:     p.workLocation,
                [`${NS}manager_name`]:      p.managerName,
                [`${NS}issuing_authority`]: p.issuingAuthority,
            };

            const payload = {
                credential_configuration_ids: [process.env.REACT_APP_HR_CREDENTIAL_DEFINITION_ID],
                credential_data,
            };

            const token = await getOrRefreshHrToken();
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
                console.error(`[HR-DIAGENCY] Diagency POST /offers failed: ${response.status} ${responseText}`);
                return res.status(response.status).json({ error: 'Failed to create credential offer', message: responseText });
            }

            const data = JSON.parse(responseText);
            if (data?.id) {
                req.session.currentOfferId = data.id;
                await new Promise((resolve, reject) =>
                    req.session.save(err => err ? reject(err) : resolve())
                );
                console.log(`[HR-DIAGENCY] Stored offer ID in session: ${sanitizeForLog(data.id)}`);
            }
            return res.json(data);
        } catch (err) {
            console.error('[HR-DIAGENCY] Error creating credential offer:', err.message);
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
            console.warn('[HR-DIAGENCY] GET /offers called but no offer ID in session');
            return res.status(400).json({ error: 'No active offer', message: 'No credential offer found for this session' });
        }
        console.log(`[HR-DIAGENCY] GET /credentials/offers called, using session offer ID: ${sanitizeForLog(id)}`);

        // Image requests: fetch from Diagency using server-controlled parameters only.
        // No client headers or query parameters are forwarded.
        if (req.headers.accept?.includes('image/')) {
            const token = await getOrRefreshHrToken();
            const imageUrl = `${diagencyAccountUrl}/v1.0/oidvc/vci/offers/${id}`;
            return fetchOfferImage(res, token, imageUrl);
        }

        try {
            const token = await getOrRefreshHrToken();
            const offerUrl = `${diagencyAccountUrl}/v1.0/oidvc/vci/offers/${id}`;
            const offerRes = await reliableFetch(offerUrl, {
                headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
            }, {
                timeout: 30000,
                onRetry: (attempt, error) => {
                    console.log(`[HR-DIAGENCY] Retrying offer state check, attempt ${attempt}. Error: ${error.message}`);
                },
            });

            if (offerRes.status === 404) {
                // Offer no longer exists — confirm issuance via the credentials endpoint.
                console.log(`[HR-DIAGENCY] Offer ${sanitizeForLog(id)} returned 404 — checking credentials endpoint`);
                const credUrl = `${diagencyAccountUrl}/v1.0/diagency/credentials?filter=${encodeURIComponent(JSON.stringify({ oid4vci_offer_id: id }))}`;
                const credRes = await reliableFetch(credUrl, {
                    headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
                }, {
                    timeout: 30000,
                    onRetry: (attempt, error) => {
                        console.log(`[HR-DIAGENCY] Retrying credentials lookup, attempt ${attempt}. Error: ${error.message}`);
                    },
                });

                if (!credRes.ok) {
                    console.error(`[HR-DIAGENCY] Credentials lookup failed: ${credRes.status}`);
                    return res.status(200).json({ state: 'Error' });
                }

                const credData = await credRes.json();
                if (credData.count > 0 && credData.items?.length > 0) {
                    console.log(`[HR-DIAGENCY] Credential confirmed issued for offer ${sanitizeForLog(id)}`);
                    return res.status(200).json({ state: 'Completed' });
                } else {
                    console.warn(`[HR-DIAGENCY] Offer 404 but no credentials found for offer ${sanitizeForLog(id)}`);
                    return res.status(200).json({ state: 'Error' });
                }
            }

            if (!offerRes.ok) {
                const errText = await offerRes.text();
                console.error(`[HR-DIAGENCY] Offer status check failed: ${offerRes.status} ${errText}`);
                return res.status(offerRes.status).json({ error: 'Offer request failed', message: errText });
            }

            const data = await offerRes.json();
            return res.status(200).json(data);
        } catch (err) {
            console.error('[HR-DIAGENCY] Error checking offer state:', err.message);
            return res.status(500).json({ error: 'Failed to check offer state', details: err.message });
        }
    });

    diagencyRouter.use((req, res) => {
        console.warn(`Blocked unauthorized ${sanitizeForLog(req.method)} request to ${sanitizeForLog(req.url)}`);
        res.status(403).json({
            error: 'Forbidden',
            message: 'Access to this endpoint is forbidden'
        });
    });

    app.use('/credentials', diagencyRouter);
}