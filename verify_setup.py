#!/usr/bin/env python3
"""
IBM Verify SaaS automated provisioning for the OID4VC demo environment.

Called by init.py to create (and tear down) all IBM Verify objects needed
by each web app:
  - OIDC application (with embedded API client)
  - FIDO2 relying party
  - Cloud Directory group (bank only)

All functions raise RuntimeError on failure rather than calling sys.exit(),
so init.py can handle errors in context.
"""

import json
import os
from typing import Optional
import requests

# ── Constants ─────────────────────────────────────────────────────────────────

ACCEPT_JSON  = "application/json"
CONTENT_JSON = "application/json"
CONTENT_SCIM = "application/scim+json"

# Fixed additionalConfig block — identical across all three apps (confirmed from existing apps)
_ADDITIONAL_CONFIG = {
    "requestObjectMaxExpFromNbf": 1800,
    "authorizeRspSigningAlg": "RS256",
    "allowedClientAssertionVerificationKeys": [],
    "clientAuthMethod": "default",
    "validateDPoPProofJti": False,
    "subjectTokenTypes": ["urn:ietf:params:oauth:token-type:access_token"],
    "certificateBoundAccessTokens": False,
    "skipDefaultMayActValidation": False,
    "requestObjectSigningAlg": "RS256",
    "requestedTokenTypes": ["urn:ietf:params:oauth:token-type:access_token"],
    "restrictAuthDetailTypes": True,
    "actorTokenRequired": False,
    "responseModes": ["query", "fragment", "form_post", "query.jwt", "fragment.jwt", "form_post.jwt"],
    "requestObjectParametersOnly": False,
    "responseTypes": ["none", "code"],
    "logoutOption": "none",
    "tctxMapping": "",
    "ignoreUnknownAuthDetailTypes": True,
    "exchangeForSSOSessionOption": "default",
    "useUserDefaultEntitlements": False,
    "dpopBoundAccessTokens": False,
    "oidcv3": True,
    "requestObjectRequireExp": True,
    "authorizeRspEncryptionEnc": "none",
    "dpopProofSigningAlg": "RS256",
    "authorizeRspEncryptionAlg": "none",
    "requirePushAuthorize": False,
    "actorTokenTypes": ["urn:ietf:params:oauth:token-type:access_token"],
}

# Entitlements for the API client embedded in every app
_BASE_API_CLIENT_ENTITLEMENTS = [
    "manageMFAMethods",
    "manageEnrollMFAMethodAnyUser",
    "manageUsersInStandardGroups",
    "manageUserStandardGroups",
    "authnAnyUser",
]

# Extra entitlement needed by bank to look up the Bank Users group
_BANK_EXTRA_ENTITLEMENTS = ["readStandardGroupMembers"]

# Fixed FIDO2 RP configuration — all fields except rpId/origins/name are identical across apps
_FIDO2_RP_FIXED = {
    "metadataConfig": {
        "enforcement": False,
        "includeAll": True,
        "includedMetadata": [],
        "includedMetadataServices": [],
    },
    "allowedAttestationFormats": ["ANDROID_KEY", "TPM", "ANDROID_SAFETYNET", "PACKED", "FIDO_U2F", "APPLE", "NONE"],
    "allowedAttestationTypes": ["BASIC", "SELF", "NONE", "ATTCA", "ANONCA"],
    "enabled": True,
    "webAuthn": True,
    "attestationCredProtect": "userVerificationOptional",
    "pubKeyCredParams": [
        {"alg": -7,   "type": "public-key"},
        {"alg": -257, "type": "public-key"},
        {"alg": -8,   "type": "public-key"},
    ],
}
VERIFY_SETUP_DEBUG = os.environ.get("VERIFY_SETUP_DEBUG", "").lower() in ("1", "true", "yes", "on")

# ── Helpers ───────────────────────────────────────────────────────────────────


def _debug_dump(label: str, payload) -> None:
    if VERIFY_SETUP_DEBUG:
        print(f"  [verify_setup][debug] {label}: {json.dumps(payload, indent=2)}")


def _json_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}", "Accept": ACCEPT_JSON, "Content-Type": CONTENT_JSON}

def _scim_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}", "Accept": CONTENT_SCIM, "Content-Type": CONTENT_SCIM}

def _scim_get_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}", "Accept": CONTENT_SCIM}


def _enable_birthright_entitlements(tenant: str, token: str, app_id: str) -> None:
    url = f"{tenant}/v1.0/owner/applications/{app_id}/entitlements"
    payload = {
        "birthRightAccess": True,
        "requestAccess": False,
        "additions": [],
        "deletions": [],
    }
    _debug_dump(f"POST {url} request body", payload)
    resp = requests.post(url, headers=_json_headers(token), json=payload)
    try:
        body = resp.json()
    except ValueError:
        body = resp.text
    _debug_dump(f"POST {url} response body", body)
    if resp.status_code not in (200, 201):
        raise RuntimeError(f"Failed to enable birthright entitlements for application '{app_id}' ({resp.status_code}): {resp.text}")


def _build_app_payload(app_name: str, app_url: str, redirect_uri: str,
                       logout_uri: str, extra_entitlements: list,
                       restrict_entitlements: bool,
                       extra_redirect_uris: Optional[list] = None) -> dict:
    """Build the full POST /v1.0/applications payload for a given app."""
    redirect_uris = [redirect_uri]
    if extra_redirect_uris:
        redirect_uris.extend(extra_redirect_uris)
    return {
        "name": app_name,
        "templateId": "998",
        "providers": {
            "saml": {
                "properties": {"companyName": app_name},
                "justInTimeProvisioning": "false",
            },
            "sso": {"userOptions": "oidc"},
            "oidc": {
                "applicationUrl": app_url,
                "properties": {
                    "grantTypes": {
                        "authorizationCode": "true",
                        "implicit": "false",
                        "deviceFlow": "false",
                        "ropc": "false",
                        "jwtBearer": "false",
                        "policyAuth": "false",
                        "clientCredentials": "false",
                        "tokenExchange": "false",
                        "preAuthorizedCode": "false",
                    },
                    "redirectUris": redirect_uris,
                    "idTokenSigningAlg": "RS256",
                    "accessTokenExpiry": 3600,
                    "refreshTokenExpiry": 86400,
                    "doNotGenerateClientSecret": "false",
                    "generateRefreshToken": "false",
                    "consentType": "dpcm",
                    "renewRefreshToken": "true",
                    "additionalConfig": {
                        **_ADDITIONAL_CONFIG,
                        "logoutRedirectURIs": [logout_uri],
                    },
                    "idTokenEncryptAlg": "none",
                    "idTokenEncryptEnc": "none",
                },
                "scopes": [],
                "entitlements": ["manageEnrollMFAMethod"],
                "restrictEntitlements": restrict_entitlements,
                "grantProperties": {"generateDeviceFlowQRCode": "false"},
                "token": {"accessTokenType": "default"},
                "consentAction": "never_prompt",
                "requirePkceVerification": "true",
            },
        },
        "apiAccessClients": [
            {
                "clientName": "User and passkey management",
                "enabled": True,
                "defaultEntitlements": _BASE_API_CLIENT_ENTITLEMENTS + extra_entitlements,
                "accessTokenType": "default",
                "jwtSigningAlg": "RS256",
                "accessTokenLifetime": 7200,
                "restrictScopes": False,
                "scopes": [],
                "additionalConfig": {
                    "logoutOption": "none",
                    "clientAuthMethod": "default",
                    "oidcv3": True,
                    "exchangeForSSOSessionOption": "default",
                    "responseModes": ["query", "fragment", "form_post"],
                },
            }
        ],
    }


# ── Public API ────────────────────────────────────────────────────────────────

def get_access_token(tenant: str, client_id: str, client_secret: str) -> str:
    """Obtain a client_credentials access token from the tenant."""
    url = f"{tenant}/v1.0/endpoint/default/token"
    resp = requests.post(
        url,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        data={"grant_type": "client_credentials", "client_id": client_id, "client_secret": client_secret},
    )
    if resp.status_code != 200:
        raise RuntimeError(f"Token request failed ({resp.status_code}): {resp.text}")
    token = resp.json().get("access_token")
    if not token:
        raise RuntimeError(f"No access_token in token response: {resp.text}")
    return token


def provision_app(tenant: str, token: str, app_name: str, app_url: str,
                  redirect_uri: str, logout_uri: str, extra_entitlements: list = None,
                  extra_redirect_uris: Optional[list] = None) -> dict:
    """
    Create an OIDC application with an embedded API client.

    Returns:
        {
            "app_id": str,
            "oidc_client_id": str,
            "oidc_client_secret": str,
            "api_client_id": str,
            "api_client_secret": str,
        }
    """
    if extra_entitlements is None:
        extra_entitlements = []

    payload = _build_app_payload(
        app_name,
        app_url,
        redirect_uri,
        logout_uri,
        extra_entitlements,
        restrict_entitlements=False,
        extra_redirect_uris=extra_redirect_uris,
    )

    url = f"{tenant}/v1.0/applications"
    _debug_dump(f"POST {url} request body", payload)
    resp = requests.post(url, headers=_json_headers(token), json=payload)
    try:
        post_body = resp.json()
    except ValueError:
        post_body = resp.text
    _debug_dump(f"POST {url} response body", post_body)
    if resp.status_code not in (200, 201):
        raise RuntimeError(
            f"Failed to create application '{app_name}' ({resp.status_code})\n"
            f"  POST {url}\n"
            f"  Request body: {json.dumps(payload, indent=2)}\n"
            f"  Response body: {resp.text}"
        )

    # POST returns only _links — extract ID from href
    href = resp.json().get("_links", {}).get("self", {}).get("href", "")
    app_id = href.rstrip("/").split("/")[-1] if href else None
    if not app_id:
        raise RuntimeError(f"Could not extract app ID from POST response: {resp.text}")

    # GET to retrieve credentials (not returned in POST response)
    get_url = f"{tenant}/v1.0/applications/{app_id}"
    get_resp = requests.get(
        get_url,
        headers={"Authorization": f"Bearer {token}", "Accept": ACCEPT_JSON},
    )
    try:
        get_body = get_resp.json()
    except ValueError:
        get_body = get_resp.text
    _debug_dump(f"GET {get_url} response body", get_body)
    if get_resp.status_code != 200:
        raise RuntimeError(f"Failed to GET application '{app_id}' ({get_resp.status_code}): {get_resp.text}")

    body = get_resp.json()
    update_payload = {
        "name": body.get("name"),
        "templateId": body.get("templateId"),
        "applicationRefId": body.get("applicationRefId", ""),
        "providers": body.get("providers", {}),
        "applicationState": True,
        "approvalRequired": body.get("approvalRequired", False),
        "signonState": body.get("signonState", True),
        "provisioningMode": body.get("provisioningMode", ""),
        "identitySources": body.get("identitySources", []),
        "visibleOnLaunchpad": body.get("visibleOnLaunchpad", True),
        "provisioning": {
            **body.get("provisioning", {}),
            "policies": {
                **body.get("provisioning", {}).get("policies", {}),
                "deProvAction": "delete",
            },
        },
        "apiAccessClients": body.get("apiAccessClients", []),
        "adaptiveAuthentication": body.get("adaptiveAuthentication", {}),
        "customIcon": body.get("customIcon", ""),
        "customization": body.get("customization", {"themeId": "default"}),
        "attributeMappings": body.get("attributeMappings", []),
    }
    _debug_dump(f"PUT {get_url} request body", update_payload)
    put_resp = requests.put(get_url, headers=_json_headers(token), json=update_payload)
    try:
        put_body = put_resp.json()
    except ValueError:
        put_body = put_resp.text
    _debug_dump(f"PUT {get_url} response body", put_body)
    if put_resp.status_code not in (200, 201):
        raise RuntimeError(f"Failed to enable application '{app_id}' ({put_resp.status_code}): {put_resp.text}")

    body = put_resp.json() if isinstance(put_body, dict) else update_payload
    oidc_props = body.get("providers", {}).get("oidc", {}).get("properties", {})
    clients = body.get("apiAccessClients", [])

    if not clients:
        raise RuntimeError(f"No apiAccessClients found in GET response for app '{app_id}'")

    _enable_birthright_entitlements(tenant, token, app_id)

    return {
        "app_id": app_id,
        "oidc_client_id": oidc_props.get("clientId"),
        "oidc_client_secret": oidc_props.get("clientSecret"),
        "api_client_id": clients[0].get("clientId"),
        "api_client_secret": clients[0].get("clientSecret"),
    }


def provision_fido2_rp(tenant: str, token: str, rp_id: str, origins: list, name: str) -> str:
    """
    Create a FIDO2 relying party.

    Args:
        rp_id:    The relying party ID (typically the app hostname, no scheme)
        origins:  List of allowed origin URLs (e.g. ["https://hostname:8090"]).
                  For local deployments a single RP can cover multiple app origins.
        name:     Display name for the RP

    Returns:
        The RP UUID (used as IBM_VERIFY_FIDO2_RELYING_PARTY_ID)
    """
    payload = {
        "rpId": rp_id,
        "origins": origins,
        "name": name,
        **_FIDO2_RP_FIXED,
    }
    url = f"{tenant}/config/v2.0/factors/fido2/relyingparties"
    resp = requests.post(url, headers=_json_headers(token), json=payload)
    if resp.status_code not in (200, 201):
        raise RuntimeError(
            f"Failed to create FIDO2 RP '{name}' ({resp.status_code})\n"
            f"  POST {url}\n"
            f"  Request body: {json.dumps(payload, indent=2)}\n"
            f"  Response body: {resp.text}"
        )

    rp_uuid = resp.json().get("id")
    if not rp_uuid:
        raise RuntimeError(f"No id in FIDO2 RP POST response: {resp.text}")
    return rp_uuid


def provision_group(tenant: str, token: str, group_name: str) -> str:
    """
    Create a Cloud Directory group.

    Returns:
        The group id (SCIM id string)
    """
    payload = {
        "schemas": [
            "urn:ietf:params:scim:schemas:core:2.0:Group",
            "urn:ietf:params:scim:schemas:extension:ibm:2.0:Notification",
        ],
        "displayName": group_name,
        "urn:ietf:params:scim:schemas:extension:ibm:2.0:Notification": {"notifyType": "NONE"},
    }
    url = f"{tenant}/v2.0/Groups"
    resp = requests.post(url, headers=_scim_headers(token), json=payload)
    if resp.status_code not in (200, 201):
        raise RuntimeError(
            f"Failed to create group '{group_name}' ({resp.status_code})\n"
            f"  POST {url}\n"
            f"  Request body: {json.dumps(payload, indent=2)}\n"
            f"  Response body: {resp.text}"
        )

    group_id = resp.json().get("id")
    if not group_id:
        raise RuntimeError(f"No id in group POST response: {resp.text}")
    return group_id


def teardown_app(tenant: str, token: str, project_name: str) -> None:
    """Delete all OIDC applications whose name contains '(<project_name>)'."""
    resp = requests.get(
        f"{tenant}/v1.0/applications",
        headers={"Authorization": f"Bearer {token}", "Accept": ACCEPT_JSON},
    )
    if resp.status_code != 200:
        print(f"  [teardown] WARNING: could not list applications ({resp.status_code}): {resp.text[:200]}")
        return

    apps = resp.json().get("_embedded", {}).get("applications", [])
    marker = f"({project_name})"
    for app in apps:
        name = app.get("name", "")
        if marker not in name:
            continue
        href = app.get("_links", {}).get("self", {}).get("href", "")
        app_id = href.rstrip("/").split("/")[-1] if href else None
        if not app_id:
            continue
        del_resp = requests.delete(
            f"{tenant}/v1.0/applications/{app_id}",
            headers={"Authorization": f"Bearer {token}", "Accept": ACCEPT_JSON},
        )
        print(f"  [teardown] DELETE application '{name}' ({app_id}) -> {del_resp.status_code}")


def teardown_fido2_rps(tenant: str, token: str, project_name: str) -> None:
    """Delete all FIDO2 relying parties whose name contains '(<project_name>)'."""
    resp = requests.get(
        f"{tenant}/config/v2.0/factors/fido2/relyingparties",
        headers={"Authorization": f"Bearer {token}", "Accept": ACCEPT_JSON},
    )
    if resp.status_code != 200:
        print(f"  [teardown] WARNING: could not list FIDO2 RPs ({resp.status_code}): {resp.text[:200]}")
        return

    body = resp.json()
    # IBM Verify may return a bare list or wrap the list under various keys
    if isinstance(body, list):
        rps = body
    else:
        rps = None
        for key in ("relyingParties", "relyingparties", "items", "data"):
            if isinstance(body.get(key), list):
                rps = body[key]
                break
        if rps is None:
            # Last-resort: look inside _embedded
            embedded = body.get("_embedded", {})
            for key in ("relyingParties", "relyingparties", "items"):
                if isinstance(embedded.get(key), list):
                    rps = embedded[key]
                    break
        if rps is None:
            print(f"  [teardown] WARNING: unrecognised FIDO2 RP list shape — keys: {list(body.keys())}")
            print(f"  [teardown]   full body: {json.dumps(body)[:500]}")
            return

    marker = f"({project_name})"
    found = 0
    for rp in rps:
        if marker not in rp.get("name", ""):
            continue
        found += 1
        rp_id = rp.get("id")
        if not rp_id:
            print(f"  [teardown] WARNING: FIDO2 RP '{rp.get('name')}' has no id — skipping")
            continue
        del_resp = requests.delete(
            f"{tenant}/config/v2.0/factors/fido2/relyingparties/{rp_id}",
            headers={"Authorization": f"Bearer {token}", "Accept": ACCEPT_JSON},
        )
        print(f"  [teardown] DELETE FIDO2 RP '{rp.get('name')}' ({rp_id}) -> {del_resp.status_code}")
        if del_resp.status_code not in (200, 204):
            print(f"  [teardown] WARNING: unexpected status deleting FIDO2 RP: {del_resp.text[:200]}")
    if found == 0:
        print(f"  [teardown] No FIDO2 RPs matching '{marker}' found on {tenant}")


def teardown_group(tenant: str, token: str, group_name: str) -> None:
    """Delete the Cloud Directory group with the given display name if it exists."""
    resp = requests.get(
        f"{tenant}/v2.0/Groups",
        headers=_scim_get_headers(token),
        params={"filter": f'displayName eq "{group_name}"'},
    )
    if resp.status_code != 200:
        print(f"  [teardown] WARNING: could not search for group '{group_name}' ({resp.status_code}): {resp.text[:200]}")
        return

    resources = resp.json().get("Resources", [])
    if not resources:
        return

    group_id = resources[0].get("id")
    if not group_id:
        return

    del_resp = requests.delete(
        f"{tenant}/v2.0/Groups/{group_id}",
        headers=_scim_get_headers(token),
    )
    print(f"  [teardown] DELETE group '{group_name}' ({group_id}) -> {del_resp.status_code}")


def provision_app_suite(config: dict) -> dict:
    """
    Provision all IBM Verify objects for one app.

    config keys:
        tenant            str   — tenant base URL
        bootstrap_id      str   — bootstrap API client ID
        bootstrap_secret  str   — bootstrap API client secret
        app_name          str   — e.g. "DMV (local)"
        app_url           str   — e.g. "https://dmv-dc-alpha.securitypoc.com"
        redirect_uri      str
        logout_uri        str
        rp_hostname       str   — hostname used as rpId (no scheme, no port)
        rp_origin         str   — full origin URL for FIDO2
        is_bank           bool  — if True, also creates Bank Users group
        project_name      str   — used for group name derivation
        bank_group_name   str   — (bank only) full group display name
        skip_fido2_rp     bool  — if True, skip per-app RP creation (caller manages RP externally)

    Returns dict with all provisioned credentials.
    """
    tenant           = config["tenant"]
    bootstrap_id     = config["bootstrap_id"]
    bootstrap_secret = config["bootstrap_secret"]
    app_name         = config["app_name"]
    app_url          = config["app_url"]
    redirect_uri     = config["redirect_uri"]
    logout_uri       = config["logout_uri"]
    rp_hostname      = config["rp_hostname"]
    rp_origin        = config["rp_origin"]
    is_bank          = config.get("is_bank", False)
    project_name     = config.get("project_name", "local")
    bank_group_name  = config.get("bank_group_name", f"Bank Users ({project_name})")
    skip_fido2_rp    = config.get("skip_fido2_rp", False)

    print(f"  [verify_setup] Provisioning IBM Verify objects for: {app_name}")

    token = get_access_token(tenant, bootstrap_id, bootstrap_secret)

    extra_entitlements = _BANK_EXTRA_ENTITLEMENTS if is_bank else []
    extra_redirect_uris = config.get("extra_redirect_uris")
    app_creds = provision_app(
        tenant,
        token,
        app_name,
        app_url,
        redirect_uri,
        logout_uri,
        extra_entitlements,
        extra_redirect_uris,
    )
    print(f"  [verify_setup] Created application: {app_name} (id={app_creds['app_id']})")

    fido2_rp_id = ""
    if not skip_fido2_rp:
        fido2_rp_id = provision_fido2_rp(tenant, token, rp_hostname, [rp_origin], app_name)
        print(f"  [verify_setup] Created FIDO2 RP: {app_name} (uuid={fido2_rp_id})")

    group_id = None
    if is_bank:
        group_id = provision_group(tenant, token, bank_group_name)
        print(f"  [verify_setup] Created group: {bank_group_name} (id={group_id})")

    return {
        "tenant":              tenant,
        "oidc_client_id":      app_creds["oidc_client_id"],
        "oidc_client_secret":  app_creds["oidc_client_secret"],
        "api_client_id":       app_creds["api_client_id"],
        "api_client_secret":   app_creds["api_client_secret"],
        "fido2_rp_id":         rp_hostname,
        "fido2_rp_uuid":       fido2_rp_id,  # overridden by caller when skip_fido2_rp=True
        "bank_group_name":     bank_group_name if is_bank else "",
        "group_id":            group_id,
    }


def teardown_app_suite(config: dict) -> None:
    """
    Tear down all IBM Verify objects for one app, identified by project_name.
    Best-effort: logs API-level failures but does not raise for those.
    Authentication failures are fatal and always re-raised.

    config keys: tenant, bootstrap_id, bootstrap_secret, project_name,
                 is_bank (bool), bank_group_name (str, bank only)
    """
    tenant           = config["tenant"]
    bootstrap_id     = config["bootstrap_id"]
    bootstrap_secret = config["bootstrap_secret"]
    app_label        = config.get("app_label", "unknown app")
    project_name     = config.get("project_name", "local")
    is_bank          = config.get("is_bank", False)
    bank_group_name  = config.get("bank_group_name", f"Bank Users ({project_name})")

    print(f"  [teardown] {app_label} ({tenant}) — project: {project_name}")

    # Authentication failure is a hard error — wrong credentials mean nothing
    # below this point can succeed, so abort immediately rather than silently
    # skipping teardown and leaving Verify objects behind.
    token = get_access_token(tenant, bootstrap_id, bootstrap_secret)

    teardown_app(tenant, token, project_name)
    teardown_fido2_rps(tenant, token, project_name)
    if is_bank:
        teardown_group(tenant, token, bank_group_name)


# ── CLI entry point ───────────────────────────────────────────────────────────

if __name__ == "__main__":
    import sys
    import os

    if len(sys.argv) < 2 or sys.argv[1] != "--teardown":
        print("Usage: python3 verify_setup.py --teardown")
        print("  Reads bootstrap credentials from environment variables and tears down")
        print("  all IBM Verify objects provisioned for the current project.")
        sys.exit(1)

    project = os.environ.get("PROJECT_NAME", "local")
    bank_group = f"Bank Users ({project})"

    configs = [
        {
            "tenant":           os.environ.get("DMV_IBM_VERIFY_BASE_URL", ""),
            "bootstrap_id":     os.environ.get("DMV_IBM_VERIFY_BOOTSTRAP_CLIENT_ID", ""),
            "bootstrap_secret": os.environ.get("DMV_IBM_VERIFY_BOOTSTRAP_CLIENT_SECRET", ""),
            "app_label":        "DMV",
            "project_name":     project,
            "is_bank":          False,
        },
        {
            "tenant":           os.environ.get("HR_IBM_VERIFY_BASE_URL", ""),
            "bootstrap_id":     os.environ.get("HR_IBM_VERIFY_BOOTSTRAP_CLIENT_ID", ""),
            "bootstrap_secret": os.environ.get("HR_IBM_VERIFY_BOOTSTRAP_CLIENT_SECRET", ""),
            "app_label":        "HR Portal",
            "project_name":     project,
            "is_bank":          False,
        },
        {
            "tenant":           os.environ.get("BANK_IBM_VERIFY_BASE_URL", ""),
            "bootstrap_id":     os.environ.get("BANK_IBM_VERIFY_BOOTSTRAP_CLIENT_ID", ""),
            "bootstrap_secret": os.environ.get("BANK_IBM_VERIFY_BOOTSTRAP_CLIENT_SECRET", ""),
            "app_label":        "Bank",
            "project_name":     project,
            "is_bank":          True,
            "bank_group_name":  bank_group,
        },
    ]

    any_error = False
    for cfg in configs:
        if not cfg["tenant"] or not cfg["bootstrap_id"]:
            print(f"  [teardown] Skipping tenant '{cfg['tenant']}' — missing credentials.")
            continue
        try:
            teardown_app_suite(cfg)
        except Exception as exc:
            print(f"  [teardown] ERROR: {exc}")
            any_error = True

    sys.exit(1 if any_error else 0)
