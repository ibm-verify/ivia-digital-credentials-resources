#!/bin/bash

#
# common_functions.sh — shared helper functions for deploy_openshift.sh and
# deploy_locally.sh.
#
# Source this file near the top of each script (after the shebang) with:
#   source "$(dirname "$0")/common_functions.sh"
#
# Tag convention: any code that is temporarily disabled due to a known platform
# limitation is marked with a TODO(IAG-LIMITATION) comment so it can be found
# and restored easily once the constraint is lifted.
#

[ -n "$_COMMON_FUNCTIONS_LOADED" ] && return 0
_COMMON_FUNCTIONS_LOADED=1

###############################################################################
# replace_string FILE FROM TO
#   In-place sed substitution; works on both macOS and Linux.

replace_string() {
    local file="$1"
    local from="$2"
    local to="$3"

    sed "s|$from|$to|g" "$file" > "$file.tmp"
    mv "$file.tmp" "$file"
}

###############################################################################
# switch_iag_to_oidc [CONFIG_FILE]
#   Toggle the IAG config from EAI to OIDC authentication.
#   Defaults to ./dc-agency/docker/iag_config/config.yaml if no argument given.

switch_iag_to_oidc() {
    local config_file="./dc-agency/docker/iag_config/config.yaml"
    if [ -f "$1" ]; then
        config_file="$1"
    fi

    if [ ! -f "$config_file" ]; then
        echo "Error: IAG config file not found at $config_file"
        return 1
    fi

    echo "Switching IAG authentication from EAI to OIDC..."

    # Create a backup
    cp "$config_file" "$config_file.bak"

    # Use awk to toggle between eai and oidc sections
    awk '
    /^  eai:/ { in_eai=1; print "#" $0; next }
    /^    triggers:/ && in_eai { print "#" $0; next }
    /^    - \/locallogin\*/ && in_eai { print "#" $0; in_eai=0; next }
    /^#  oidc:/ { in_oidc=1; sub(/^#  /, "  "); print; next }
    /^#    discovery_endpoint:/ && in_oidc { sub(/^#    /, "    "); print; next }
    /^#    client_id:/ && in_oidc { sub(/^#    /, "    "); print; next }
    /^#    client_secret:/ && in_oidc { sub(/^#    /, "    "); print; next }
    /^#    pkce:/ && in_oidc { sub(/^#    /, "    "); print; in_oidc=0; next }
    { print }
    ' "$config_file" > "$config_file.tmp"

    mv "$config_file.tmp" "$config_file"

    echo "IAG config updated: EAI commented out, OIDC enabled"
    return 0
}

###############################################################################
# prompt_for_verify_credentials
#   Interactive prompts for IBM Verify bootstrap credentials (deploy/up flow).
#   Populates: dmv_verify_base_url, dmv_verify_bootstrap_client_id,
#              dmv_verify_bootstrap_client_secret,
#              hr_verify_base_url, hr_verify_bootstrap_client_id,
#              hr_verify_bootstrap_client_secret,
#              bank_verify_base_url, bank_verify_bootstrap_client_id,
#              bank_verify_bootstrap_client_secret.

prompt_for_verify_credentials() {

    # ── DMV IBM Verify bootstrap ──────────────────────────────────────────────
    if [[ -z "$dmv_verify_base_url" ]]; then
        read -p "Enter DMV IBM Verify tenant base URL [https://demos.verify.ibm.com]: " dmv_verify_base_url
        dmv_verify_base_url="${dmv_verify_base_url:-https://demos.verify.ibm.com}"
    fi

    while [[ -z "$dmv_verify_bootstrap_client_id" ]]; do
        read -p "Enter DMV IBM Verify bootstrap client ID: " dmv_verify_bootstrap_client_id
        [[ -z "$dmv_verify_bootstrap_client_id" ]] && echo "Client ID cannot be blank."
    done

    while [[ -z "$dmv_verify_bootstrap_client_secret" ]]; do
        read -s -p "Enter DMV IBM Verify bootstrap client secret: " dmv_verify_bootstrap_client_secret
        echo
        [[ -z "$dmv_verify_bootstrap_client_secret" ]] && echo "Client secret cannot be blank."
    done

    # ── HR IBM Verify bootstrap ───────────────────────────────────────────────
    # Re-enable prompting for HR credentials when we have a deployment running multiple IAG instances.
    #
    #   if [[ -z "$hr_verify_base_url" ]]; then
    #       read -p "Enter HR IBM Verify tenant base URL [${dmv_verify_base_url}]: " hr_verify_base_url
    #       hr_verify_base_url="${hr_verify_base_url:-${dmv_verify_base_url}}"
    #   fi
    #   if [[ -z "$hr_verify_bootstrap_client_id" ]]; then
    #       read -p "Enter HR IBM Verify bootstrap client ID (leave blank to use DMV credentials): " hr_verify_bootstrap_client_id
    #   fi
    #   if [[ -n "$hr_verify_bootstrap_client_id" ]]; then
    #       while [[ -z "$hr_verify_bootstrap_client_secret" ]]; do
    #           read -s -p "Enter HR IBM Verify bootstrap client secret: " hr_verify_bootstrap_client_secret
    #           echo
    #           [[ -z "$hr_verify_bootstrap_client_secret" ]] && echo "Client secret cannot be blank."
    #       done
    #   fi
    #   if [[ -z "$hr_verify_bootstrap_client_id" ]]; then
    #       hr_verify_bootstrap_client_id="$dmv_verify_bootstrap_client_id"
    #       hr_verify_bootstrap_client_secret="$dmv_verify_bootstrap_client_secret"
    #   fi
    echo "NOTE: HR portal credentials will automatically utilise the DMV credentials."
    hr_verify_base_url="$dmv_verify_base_url"
    hr_verify_bootstrap_client_id="$dmv_verify_bootstrap_client_id"
    hr_verify_bootstrap_client_secret="$dmv_verify_bootstrap_client_secret"

    # ── Bank IBM Verify bootstrap ─────────────────────────────────────────────
    echo ""
    echo "⚠️  WARNING: Users and groups will be created in the Bank IBM Verify tenant during deployment and runtime."
    echo ""

    # Track whether the bank URL was explicitly supplied or inherited
    _bank_url_explicit=false
    if [[ -n "$bank_verify_base_url" ]]; then
        _bank_url_explicit=true
    fi

    if [[ -z "$bank_verify_base_url" ]]; then
        read -p "Enter Bank IBM Verify tenant base URL [${dmv_verify_base_url}]: " bank_verify_base_url
        if [[ -z "$bank_verify_base_url" ]]; then
            bank_verify_base_url="$dmv_verify_base_url"
        else
            _bank_url_explicit=true
        fi
    fi

    # If the bank URL is the same tenant as DMV, offer credential inheritance
    if [[ "$_bank_url_explicit" == false ]]; then
        if [[ -z "$bank_verify_bootstrap_client_id" ]]; then
            read -p "Enter Bank IBM Verify bootstrap client ID (leave blank to use DMV credentials): " bank_verify_bootstrap_client_id
        fi
        if [[ -n "$bank_verify_bootstrap_client_id" ]]; then
            while [[ -z "$bank_verify_bootstrap_client_secret" ]]; do
                read -s -p "Enter Bank IBM Verify bootstrap client secret: " bank_verify_bootstrap_client_secret
                echo
                [[ -z "$bank_verify_bootstrap_client_secret" ]] && echo "Client secret cannot be blank."
            done
        fi
        if [[ -z "$bank_verify_bootstrap_client_id" ]]; then
            bank_verify_bootstrap_client_id="$dmv_verify_bootstrap_client_id"
            bank_verify_bootstrap_client_secret="$dmv_verify_bootstrap_client_secret"
        fi
    else
        # Different tenant — credentials are mandatory
        while [[ -z "$bank_verify_bootstrap_client_id" ]]; do
            read -p "Enter Bank IBM Verify bootstrap client ID: " bank_verify_bootstrap_client_id
            [[ -z "$bank_verify_bootstrap_client_id" ]] && echo "Client ID cannot be blank."
        done
        while [[ -z "$bank_verify_bootstrap_client_secret" ]]; do
            read -s -p "Enter Bank IBM Verify bootstrap client secret: " bank_verify_bootstrap_client_secret
            echo
            [[ -z "$bank_verify_bootstrap_client_secret" ]] && echo "Client secret cannot be blank."
        done
    fi

    # Validate mandatory bootstrap credentials (HR excluded — always inherited from DMV)
    missing_verify_vars=()
    [[ -z "$dmv_verify_base_url" ]]               && missing_verify_vars+=("--dmv-verify-base-url")
    [[ -z "$dmv_verify_bootstrap_client_id" ]]    && missing_verify_vars+=("--dmv-verify-bootstrap-client-id")
    [[ -z "$dmv_verify_bootstrap_client_secret" ]] && missing_verify_vars+=("--dmv-verify-bootstrap-client-secret")
    [[ -z "$bank_verify_base_url" ]]              && missing_verify_vars+=("--bank-verify-base-url")
    [[ -z "$bank_verify_bootstrap_client_id" ]]   && missing_verify_vars+=("--bank-verify-bootstrap-client-id")
    [[ -z "$bank_verify_bootstrap_client_secret" ]] && missing_verify_vars+=("--bank-verify-bootstrap-client-secret")
    if [[ ${#missing_verify_vars[@]} -gt 0 ]]; then
        echo "Error: The following IBM Verify bootstrap parameters are required: ${missing_verify_vars[*]}"
        exit 1
    fi

    # Strip trailing slashes from all tenant base URLs
    dmv_verify_base_url="${dmv_verify_base_url%/}"
    hr_verify_base_url="${hr_verify_base_url%/}"
    bank_verify_base_url="${bank_verify_base_url%/}"
}

###############################################################################
# prompt_for_undeploy_verify_credentials
#   Interactive prompts for IBM Verify bootstrap credentials (undeploy/down flow).
#   Same DMV → HR (inherit) → Bank (inherit/explicit) pattern as deploy.

prompt_for_undeploy_verify_credentials() {

    # ── DMV ───────────────────────────────────────────────────────────────────
    if [[ -z "$dmv_verify_base_url" ]]; then
        read -p "Enter DMV IBM Verify tenant base URL [https://demos.verify.ibm.com]: " dmv_verify_base_url
        dmv_verify_base_url="${dmv_verify_base_url:-https://demos.verify.ibm.com}"
    fi
    dmv_verify_base_url="${dmv_verify_base_url%/}"

    while [[ -z "$dmv_verify_bootstrap_client_id" ]]; do
        read -p "Enter DMV IBM Verify bootstrap client ID: " dmv_verify_bootstrap_client_id
        [[ -z "$dmv_verify_bootstrap_client_id" ]] && echo "Client ID cannot be blank."
    done

    while [[ -z "$dmv_verify_bootstrap_client_secret" ]]; do
        read -s -p "Enter DMV IBM Verify bootstrap client secret: " dmv_verify_bootstrap_client_secret
        echo
        [[ -z "$dmv_verify_bootstrap_client_secret" ]] && echo "Client secret cannot be blank."
    done

    # ── HR (always inherits DMV) ───────────────────────────────────────────────
    # Re-enable prompting for HR credentials when we have a deployment running multiple IAG instances.
    #
    #   if [[ -z "$hr_verify_base_url" ]]; then
    #       read -p "Enter HR IBM Verify tenant base URL [${dmv_verify_base_url}]: " hr_verify_base_url
    #       hr_verify_base_url="${hr_verify_base_url:-${dmv_verify_base_url}}"
    #   fi
    #   hr_verify_base_url="${hr_verify_base_url%/}"
    #   if [[ -z "$hr_verify_bootstrap_client_id" ]]; then
    #       read -p "Enter HR IBM Verify bootstrap client ID (leave blank to use DMV credentials): " hr_verify_bootstrap_client_id
    #   fi
    #   if [[ -n "$hr_verify_bootstrap_client_id" ]]; then
    #       while [[ -z "$hr_verify_bootstrap_client_secret" ]]; do
    #           read -s -p "Enter HR IBM Verify bootstrap client secret: " hr_verify_bootstrap_client_secret
    #           echo
    #           [[ -z "$hr_verify_bootstrap_client_secret" ]] && echo "Client secret cannot be blank."
    #       done
    #   fi
    #   if [[ -z "$hr_verify_bootstrap_client_id" ]]; then
    #       hr_verify_bootstrap_client_id="$dmv_verify_bootstrap_client_id"
    #       hr_verify_bootstrap_client_secret="$dmv_verify_bootstrap_client_secret"
    #   fi
    echo "NOTE: HR portal credentials will automatically utilise the DMV credentials."
    hr_verify_base_url="$dmv_verify_base_url"
    hr_verify_bootstrap_client_id="$dmv_verify_bootstrap_client_id"
    hr_verify_bootstrap_client_secret="$dmv_verify_bootstrap_client_secret"

    # ── Bank (defaults to DMV) ─────────────────────────────────────────────────
    if [[ -z "$bank_verify_base_url" ]]; then
        read -p "Enter Bank IBM Verify tenant base URL [${dmv_verify_base_url}]: " bank_verify_base_url
        bank_verify_base_url="${bank_verify_base_url:-${dmv_verify_base_url}}"
    fi
    bank_verify_base_url="${bank_verify_base_url%/}"

    _bank_url_explicit=false
    [[ "$bank_verify_base_url" != "$dmv_verify_base_url" ]] && _bank_url_explicit=true

    if [[ "$_bank_url_explicit" == false ]]; then
        if [[ -z "$bank_verify_bootstrap_client_id" ]]; then
            read -p "Enter Bank IBM Verify bootstrap client ID (leave blank to use DMV credentials): " bank_verify_bootstrap_client_id
        fi
        if [[ -n "$bank_verify_bootstrap_client_id" ]]; then
            while [[ -z "$bank_verify_bootstrap_client_secret" ]]; do
                read -s -p "Enter Bank IBM Verify bootstrap client secret: " bank_verify_bootstrap_client_secret
                echo
                [[ -z "$bank_verify_bootstrap_client_secret" ]] && echo "Client secret cannot be blank."
            done
        fi
        if [[ -z "$bank_verify_bootstrap_client_id" ]]; then
            bank_verify_bootstrap_client_id="$dmv_verify_bootstrap_client_id"
            bank_verify_bootstrap_client_secret="$dmv_verify_bootstrap_client_secret"
        fi
    else
        while [[ -z "$bank_verify_bootstrap_client_id" ]]; do
            read -p "Enter Bank IBM Verify bootstrap client ID: " bank_verify_bootstrap_client_id
            [[ -z "$bank_verify_bootstrap_client_id" ]] && echo "Client ID cannot be blank."
        done
        while [[ -z "$bank_verify_bootstrap_client_secret" ]]; do
            read -s -p "Enter Bank IBM Verify bootstrap client secret: " bank_verify_bootstrap_client_secret
            echo
            [[ -z "$bank_verify_bootstrap_client_secret" ]] && echo "Client secret cannot be blank."
        done
    fi
}

###############################################################################
# teardown_verify_objects
#   Call verify_setup.py --teardown with all current IBM Verify credential vars.
#   An optional PROJECT_NAME env var is forwarded when set (OpenShift only).

teardown_verify_objects() {
    echo "Tearing down IBM Verify provisioned objects..."
    DMV_IBM_VERIFY_BASE_URL="$dmv_verify_base_url" \
    DMV_IBM_VERIFY_BOOTSTRAP_CLIENT_ID="$dmv_verify_bootstrap_client_id" \
    DMV_IBM_VERIFY_BOOTSTRAP_CLIENT_SECRET="$dmv_verify_bootstrap_client_secret" \
    HR_IBM_VERIFY_BASE_URL="$hr_verify_base_url" \
    HR_IBM_VERIFY_BOOTSTRAP_CLIENT_ID="$hr_verify_bootstrap_client_id" \
    HR_IBM_VERIFY_BOOTSTRAP_CLIENT_SECRET="$hr_verify_bootstrap_client_secret" \
    BANK_IBM_VERIFY_BASE_URL="$bank_verify_base_url" \
    BANK_IBM_VERIFY_BOOTSTRAP_CLIENT_ID="$bank_verify_bootstrap_client_id" \
    BANK_IBM_VERIFY_BOOTSTRAP_CLIENT_SECRET="$bank_verify_bootstrap_client_secret" \
    PROJECT_NAME="${project_name:-local}" \
    python3 verify_setup.py --teardown
}

###############################################################################
# check_env_files_exist
#   Verify that init.py produced all three per-app env files.

check_env_files_exist() {
    for env_file in .env.bank .env.dmv .env.hr; do
        if [ ! -f "$env_file" ]; then
            echo "Error: $env_file not found. Please check init.py output above."
            exit 1
        fi
    done
}

###############################################################################
# run_init_py
#   Invoke init.py with the full set of shared environment variables, capture
#   its output, and abort with a clear error on any failure.
#
#   init.py signals failure in two ways:
#     1. A non-zero exit code  (sys.exit(1) on every fatal path)
#     2. An "Error> ..." line printed to stdout before sys.exit(1)
#   Both are checked here so neither deploy script needs its own post-call
#   error handling — failure behaviour is identical for local and OpenShift.
#
#   All variables must already be set in the caller's scope before calling.
#
#   Shared variables (both local and OpenShift):
#     dmv_app_url / DMV_HOST       — DMV app host URL
#     bank_app_url / BANK_HOST     — Bank app host URL
#     hr_app_url / HR_HOST         — HR app host URL
#     agency_url                   — Agency base URL
#     vical_url                    — VICAL base URL (local) or agency_url (OpenShift)
#     oidc_token_endpoint          — OIDC token endpoint
#     dmv_verify_base_url          — DMV IBM Verify tenant base URL
#     dmv_verify_bootstrap_client_id / _secret
#     hr_verify_base_url / hr_verify_bootstrap_client_id / _secret
#     bank_verify_base_url / bank_verify_bootstrap_client_id / _secret
#     is_app_prod_deploy           — "true" for OpenShift, "false" for local
#     verify_setup_debug           — "true" to enable debug output
#     CUSTOM_CA_PATH               — (local only) path to CA bundle for self-signed certs
#
#   OpenShift-only extras (set in deploy_openshift.sh before calling):
#     VERIFY_CREDS_FILE, PROJECT_NAME, ADMIN_NAME, ADMIN_PASSWORD
#   These are already exported in the caller's environment and are automatically
#   inherited by the python3 subprocess — no special handling required here.

run_init_py() {
    local _init_log
    _init_log=$(mktemp /tmp/init_py_output.XXXXXX)

    DMV_HOST="${DMV_HOST:-$dmv_app_url}" \
    BANK_HOST="${BANK_HOST:-$bank_app_url}" \
    HR_HOST="${HR_HOST:-$hr_app_url}" \
    AGENCY_URL="$agency_url" \
    VICAL_BASE_URL="${vical_url:-$agency_url}" \
    OIDC_TOKEN_ENDPOINT="$oidc_token_endpoint" \
    DMV_IBM_VERIFY_BASE_URL="$dmv_verify_base_url" \
    DMV_IBM_VERIFY_BOOTSTRAP_CLIENT_ID="$dmv_verify_bootstrap_client_id" \
    DMV_IBM_VERIFY_BOOTSTRAP_CLIENT_SECRET="$dmv_verify_bootstrap_client_secret" \
    HR_IBM_VERIFY_BASE_URL="$hr_verify_base_url" \
    HR_IBM_VERIFY_BOOTSTRAP_CLIENT_ID="$hr_verify_bootstrap_client_id" \
    HR_IBM_VERIFY_BOOTSTRAP_CLIENT_SECRET="$hr_verify_bootstrap_client_secret" \
    BANK_IBM_VERIFY_BASE_URL="$bank_verify_base_url" \
    BANK_IBM_VERIFY_BOOTSTRAP_CLIENT_ID="$bank_verify_bootstrap_client_id" \
    BANK_IBM_VERIFY_BOOTSTRAP_CLIENT_SECRET="$bank_verify_bootstrap_client_secret" \
    IS_APP_PROD_DEPLOY="${is_app_prod_deploy:-false}" \
    VERIFY_SETUP_DEBUG="$verify_setup_debug" \
    CUSTOM_CA_PATH="${CUSTOM_CA_PATH:-}" \
    python3 -u init.py ${verify_setup_debug:+--debug} 2>&1 | tee "$_init_log"
    local _init_exit_code=${PIPESTATUS[0]}

    # Scan the captured log for any "Error> ..." line emitted by init.py.
    # Every such line is immediately followed by sys.exit(1), so the exit code
    # check below would also catch it — but grepping first gives a more precise
    # "Deployment aborted: <reason>" message rather than a bare exit-code failure.
    local _error_line
    _error_line=$(grep -m1 "^Error>" "$_init_log" || true)
    rm -f "$_init_log"

    if [[ -n "$_error_line" ]]; then
        echo "Deployment aborted: $_error_line"
        exit 1
    fi

    if [[ $_init_exit_code -ne 0 ]]; then
        echo "Deployment aborted: init.py failed with exit code $_init_exit_code"
        exit 1
    fi
}
