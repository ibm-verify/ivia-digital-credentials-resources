# Bypass QR Flow

`tests/scripts/bypassqr.py` automates the complete DMV, Bank, and HR scenario
without requiring a mobile device. It issues and verifies the DMV credential,
creates the bank directory account, issues the HR employment credential, and
verifies that credential before completing the Bank loan form state.

## Authentication model

The script uses two isolated Playwright browser contexts:

1. The **issuer-app context** signs in to the DMV and HR apps so it can create
   credential offers through their protected APIs.
2. The **holder context** signs in during the OID4VCI authorization-code flow
   and captures the code returned to `openid-credential-offer://`.

This intentionally exercises the real OAuth redirects, cookies, PKCE exchange,
and identity-provider policy. It does not use the OAuth password grant or rely
on the local `ropc.js` mapping rule.

At startup, the script prompts once for a dedicated non-production OAuth
username and password. They are not written to `.env`, the session artifact, or
the console. The browser is visible by default. If the provider requires MFA,
consent, or another interactive step, complete it in that browser; the script
will continue when the provider redirects. Use `--headless` only when the flow
is known not to need operator interaction.

## Prerequisites

- Deploy the local or OpenShift stack and ensure the root `.env` contains the
  generated DMV, HR, Bank, and dc-agency settings, including the HR credential
  definition and Bank employment exchange template IDs.
- Create a non-production identity that is permitted to sign in to the
  configured OAuth provider.
- Install Python dependencies and Chromium once in the active environment:

```bash
python3 -m pip install -r requirements.txt
python3 -m playwright install chromium
```

For a local deployment, build the web images before deploying:

```bash
./build.sh
./deploy_locally.sh deploy
```

## Run

```bash
python3 tests/scripts/bypassqr.py --bank-email new-bank-user@example.test
```

For an unattended environment with no MFA or consent screen:

```bash
python3 tests/scripts/bypassqr.py --headless --bank-email new-bank-user@example.test
```

For a guided browser demonstration of every sample app:

```bash
python3 tests/scripts/bypassqr.py --visual --bank-email new-bank-user@example.test
```

Visual mode drives the real DMV, Bank, and HR pages while the same in-memory
Python wallet handles the QR/deep-link protocol exchanges in the background.
The browser visibly shows the issuer profiles, QR dialogs, credential-added
alerts, verified Bank forms, account-created page, employment verification, and
loan-submission confirmation. Use `--visual-step-delay 3` to keep each important
state on screen longer; the default delay is 1.5 seconds.

`--visual` cannot be combined with `--headless`. Each app uses an isolated
browser context so its server session cookie cannot overwrite another app's
session. OAuth credentials are still prompted once and are not persisted.

`--bank-email` is required because the Bank verification template requests the
licence name and address claims, but not an email claim. The script does not
invent or copy an email from the DMV demo profile.

The script writes a sanitised run record to
`tests/artifacts/holder-session.json`. It records offer, exchange, credential,
and verification status for diagnosis, but never browser cookies, OAuth
passwords, or access tokens.

## Protocol flow

1. Start an authenticated DMV app session and create a credential offer.
2. Open the offer's authorization URL in the holder context and complete OAuth.
3. Exchange the captured authorization code with PKCE, fetch a nonce, and issue
   the credential using a newly generated wallet P-256 key.
4. Start the Bank `purpose=signup` OpenID4VP exchange, selectively disclose
   only the mdoc elements requested by its DCQL query, construct the signed
   `DeviceResponse`, and send it to the verifier's `response_uri`.
5. Poll the same signup exchange, read its verified licence attributes, and
   create the bank customer through `/api/signup`.
6. Sign in to the HR portal, create an employment credential offer, and redeem
   it into the same in-memory wallet.
7. Start the Bank `purpose=employment` OpenID4VP exchange, selectively disclose
   `given_name`, `family_name`, and `annual_income` from the HR credential, and
   verify the presentation through the Bank app.
8. Populate the same loan fields used by `LoanApplicationCard` and record its
   successful `applicationSubmitted` state.
9. Return the final wallet, signup, employment-verification, and loan state in
   `tests/artifacts/holder-session.json`.

In `--visual` mode, the app pages themselves create the issuer and verifier
exchanges. The runner reads the wallet links exposed by their QR dialogs,
completes each handoff, and shares only the corresponding app's session cookies
with the HTTP polling client. The Bank account is submitted through the visible
signup form, and the final loan confirmation is produced by the visible Bank
profile page.

The bank signup API is deliberately not used to authenticate OAuth users. It
creates a SCIM profile after verification; it is not an end-user login API.

The current Bank UI does not POST loan applications to a backend. Its submit
handler validates that employment verification succeeded and then sets local
React state. The bypass script mirrors that final state transition and marks it
as `client_side_only`; all credential issuance and verification steps still use
the real app and dc-agency APIs.
