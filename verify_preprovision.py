#!/usr/bin/env python3
import json
import os
import sys
from urllib.parse import urlparse

import verify_setup as vs


def _require(name: str) -> str:
    value = os.environ.get(name, "")
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def _rp_info(app_url: str) -> tuple:
    parsed = urlparse(app_url)
    hostname = parsed.hostname
    origin = f"{parsed.scheme}://{parsed.hostname}"
    if parsed.port and not (parsed.scheme == "https" and parsed.port == 443):
        origin += f":{parsed.port}"
    return hostname, origin


def main() -> int:
    project_name = os.environ.get("PROJECT_NAME", "local") or "local"
    output_file = _require("VERIFY_CREDS_FILE")
    gateway_host = os.environ.get("GATEWAY_HOST", "")

    dmv_app_url = _require("DMV_HOST")
    bank_app_url = _require("BANK_HOST")
    hr_app_url = _require("HR_HOST")

    dmv_verify_base_url = _require("DMV_IBM_VERIFY_BASE_URL")
    dmv_bootstrap_client_id = _require("DMV_IBM_VERIFY_BOOTSTRAP_CLIENT_ID")
    dmv_bootstrap_client_secret = _require("DMV_IBM_VERIFY_BOOTSTRAP_CLIENT_SECRET")

    hr_verify_base_url = _require("HR_IBM_VERIFY_BASE_URL")
    hr_bootstrap_client_id = _require("HR_IBM_VERIFY_BOOTSTRAP_CLIENT_ID")
    hr_bootstrap_client_secret = _require("HR_IBM_VERIFY_BOOTSTRAP_CLIENT_SECRET")

    bank_verify_base_url = _require("BANK_IBM_VERIFY_BASE_URL")
    bank_bootstrap_client_id = _require("BANK_IBM_VERIFY_BOOTSTRAP_CLIENT_ID")
    bank_bootstrap_client_secret = _require("BANK_IBM_VERIFY_BOOTSTRAP_CLIENT_SECRET")

    dmv_rp_hostname, dmv_rp_origin = _rp_info(dmv_app_url)
    bank_rp_hostname, bank_rp_origin = _rp_info(bank_app_url)
    hr_rp_hostname, hr_rp_origin = _rp_info(hr_app_url)

    bank_group_name = f"Bank Users ({project_name})"
    dmv_extra_redirect_uris = [f"https://{gateway_host}/pkmsoidc"] if gateway_host else []

    print("Pre-provisioning IBM Verify objects (teardown then provision)...")
    vs.teardown_app_suite({"tenant": dmv_verify_base_url, "bootstrap_id": dmv_bootstrap_client_id,
                           "bootstrap_secret": dmv_bootstrap_client_secret, "app_label": "DMV",
                           "project_name": project_name, "is_bank": False})
    vs.teardown_app_suite({"tenant": hr_verify_base_url, "bootstrap_id": hr_bootstrap_client_id,
                           "bootstrap_secret": hr_bootstrap_client_secret, "app_label": "HR Portal",
                           "project_name": project_name, "is_bank": False})
    vs.teardown_app_suite({"tenant": bank_verify_base_url, "bootstrap_id": bank_bootstrap_client_id,
                           "bootstrap_secret": bank_bootstrap_client_secret, "app_label": "Bank",
                           "project_name": project_name, "is_bank": True, "bank_group_name": bank_group_name})

    dmv_creds = vs.provision_app_suite({
        "tenant": dmv_verify_base_url,
        "bootstrap_id": dmv_bootstrap_client_id,
        "bootstrap_secret": dmv_bootstrap_client_secret,
        "app_name": f"DMV ({project_name})",
        "app_url": dmv_app_url,
        "redirect_uri": f"{dmv_app_url}/logincallback",
        "logout_uri": f"{dmv_app_url}/logoutcallback",
        "rp_hostname": dmv_rp_hostname,
        "rp_origin": dmv_rp_origin,
        "is_bank": False,
        "project_name": project_name,
        "extra_redirect_uris": dmv_extra_redirect_uris,
    })
    hr_creds = vs.provision_app_suite({
        "tenant": hr_verify_base_url,
        "bootstrap_id": hr_bootstrap_client_id,
        "bootstrap_secret": hr_bootstrap_client_secret,
        "app_name": f"HR Portal ({project_name})",
        "app_url": hr_app_url,
        "redirect_uri": f"{hr_app_url}/logincallback",
        "logout_uri": f"{hr_app_url}/logoutcallback",
        "rp_hostname": hr_rp_hostname,
        "rp_origin": hr_rp_origin,
        "is_bank": False,
        "project_name": project_name,
    })
    bank_creds = vs.provision_app_suite({
        "tenant": bank_verify_base_url,
        "bootstrap_id": bank_bootstrap_client_id,
        "bootstrap_secret": bank_bootstrap_client_secret,
        "app_name": f"Bank ({project_name})",
        "app_url": bank_app_url,
        "redirect_uri": f"{bank_app_url}/logincallback",
        "logout_uri": f"{bank_app_url}/logoutcallback",
        "rp_hostname": bank_rp_hostname,
        "rp_origin": bank_rp_origin,
        "is_bank": True,
        "project_name": project_name,
        "bank_group_name": bank_group_name,
    })

    with open(output_file, "w") as f:
        json.dump({"dmv": dmv_creds, "hr": hr_creds, "bank": bank_creds}, f)

    print(f"Saved Verify credentials to {output_file}")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:
        print(f"Error: {exc}")
        sys.exit(1)
