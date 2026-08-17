#!/bin/bash

#
# This script is used to deploy the OID4VC sample apps and dc-agency services locally
# using Docker Compose.
#

# Load shared helper functions
# shellcheck source=common_functions.sh
source "$(dirname "$0")/common_functions.sh"

###############################################################################
# Constants.

instructions="This script is used to deploy the OID4VC sample apps (bank-app, dmv-app and hr-portal)
and dc-agency services locally using Docker Compose.

Usage:
  $0 [command] [options]

Commands:
  deploy               Deploy services (default)
  undeploy             Undeploy services

Options:
  --web-apps-only      Deploy/undeploy only the web apps
  --dc-agency-only     Deploy/undeploy only the dc-agency services
  --debug              Print full IBM Verify app provisioning request/response payloads

  IBM Verify bootstrap credentials (mandatory for web-app 'deploy'):
  --dmv-verify-base-url VALUE               DMV IBM Verify tenant base URL
                                            (default: https://demos.verify.ibm.com)
  --dmv-verify-bootstrap-client-id VALUE    DMV bootstrap API client ID (mandatory)
  --dmv-verify-bootstrap-client-secret VALUE DMV bootstrap API client secret (mandatory)

  --hr-verify-base-url VALUE                HR IBM Verify tenant base URL
                                            (currently always inherited from DMV — IAG limitation)
  --hr-verify-bootstrap-client-id VALUE     HR bootstrap API client ID
                                            (currently always inherited from DMV — IAG limitation)
  --hr-verify-bootstrap-client-secret VALUE HR bootstrap API client secret
                                            (currently always inherited from DMV — IAG limitation)

  --bank-verify-base-url VALUE              Bank IBM Verify tenant base URL (mandatory)
  --bank-verify-bootstrap-client-id VALUE   Bank bootstrap API client ID (mandatory)
  --bank-verify-bootstrap-client-secret VALUE Bank bootstrap API client secret (mandatory)

Notes:
  - Web-app images must be built before deploying. Run './build.sh' first.
  - If not provided, IBM Verify credentials will be prompted interactively
  - Bootstrap credentials are used once to provision OIDC apps, API clients, and FIDO2 RPs
    in each IBM Verify tenant; provisioned credentials are written into each app's .env file
  - HR bootstrap credentials always inherit DMV's values (IAG limitation — see common_functions.sh)
  - ⚠️  Bank: users and groups will be created in the bank IBM Verify tenant during deployment
  - Each app's .env file is created separately: .env.bank, .env.dmv, .env.hr
  - On 'undeploy', the provisioned IBM Verify objects (apps, FIDO2 RPs, bank group) are deleted

Examples:
  $0                   # Deploy both dc-agency and web-apps
  $0 deploy            # Same as above
  $0 deploy --web-apps-only     # Deploy only web-apps
  $0 deploy --dc-agency-only    # Deploy only dc-agency services
  $0 undeploy                   # Stop all services (also tears down IBM Verify objects)
  $0 undeploy --web-apps-only   # Stop only web-apps (also tears down IBM Verify objects)
  $0 undeploy --dc-agency-only  # Stop only dc-agency
  $0 deploy \\
      --dmv-verify-base-url https://demos.verify.ibm.com \\
      --dmv-verify-bootstrap-client-id abc \\
      --dmv-verify-bootstrap-client-secret xyz \\
      --bank-verify-base-url https://bank.verify.ibm.com \\
      --bank-verify-bootstrap-client-id bk123 \\
      --bank-verify-bootstrap-client-secret bksecret
"

###############################################################################
# Usage.

usage()
{
    echo "$instructions"
    exit 1
}

###############################################################################
# Save / load deployment state (structural flags only — no credentials).

state_file()
{
    echo ".deploy-state.local"
}

save_state()
{
    local file
    file=$(state_file)
    cat > "$file" <<EOF
# Local deployment state — do not edit manually.
# Re-generated on each successful deploy.
EOF
    chmod 600 "$file"
    echo "Deployment state saved to $file"
}

load_state()
{
    local file
    file=$(state_file)
    if [ ! -f "$file" ]; then
        return 0  # No state file yet — not an error for local deployments
    fi
    # shellcheck source=/dev/null
    source "$file"
}

###############################################################################
# Helper functions.
# Note: replace_string(), switch_iag_to_oidc(), prompt_for_verify_credentials(),
#       prompt_for_undeploy_verify_credentials(), teardown_verify_objects(), and
#       check_env_files_exist() are defined in common_functions.sh.

# Function to check if a container is running
is_container_running() {
    local container_name=$1
    local status=$(docker ps --filter "name=$container_name" --format "{{.Status}}" 2>/dev/null)
    if [[ -n "$status" ]]; then
        return 0  # Container is running
    else
        return 1  # Container is not running
    fi
}

# Function to wait for a container to be ready
wait_for_container() {
    local container_name=$1
    local max_attempts=30
    local attempt=1

    echo "Waiting for $container_name to be ready..."

    while ! is_container_running "$container_name"; do
        if [[ $attempt -ge $max_attempts ]]; then
            echo "Error: $container_name did not start within the expected time."
            return 1
        fi

        echo "Waiting for $container_name to start... (attempt $attempt/$max_attempts)"
        sleep 2
        ((attempt++))
    done

    echo "$container_name is running."
    return 0
}

# Function to check if DC agency services are fully functional using Docker health checks
check_dc_agency_services() {
    local max_attempts=$1

    if [ -z "$max_attempts" ]; then
        max_attempts=60  # Default to 60 attempts (5 minutes with 5-second intervals)
    fi

    local attempt=1

    echo "Checking if DC agency services are fully up and functional..."
    echo "Waiting for iviadc health check to pass..."
    # Note: iviadcop does not define a Docker HEALTHCHECK — we rely solely on iviadc.
    # iviadc is healthy only after it has successfully connected to both the database
    # (iviadcdb) and the OIDC provider (iviadcop), so its health implicitly covers
    # the readiness of the full dc-agency stack.

    while [ $attempt -le $max_attempts ]; do
        echo "Attempt $attempt/$max_attempts: Checking DC agency health status"

        local iviadc_status=$(docker inspect --format='{{.State.Health.Status}}' iviadc 2>/dev/null)

        if [ "$iviadc_status" = "healthy" ]; then
            echo "✅ iviadc is healthy! DC agency services are fully up and functional."
            return 0
        else
            echo "❌ iviadc: $iviadc_status (waiting for 'healthy')"
            echo "Waiting for 5 seconds before next check..."
            sleep 5
            ((attempt++))
        fi
    done

    echo "❌ DC agency services did not become fully healthy after $max_attempts attempts."
    return 1
}

# Ensure the user has performed the required pre-req (step 2) for dcagency config.yaml
check_dc_agency_config() {
    echo "Checking dc-agency config.yaml..."
    if [ ! -f dc-agency/docker/config/config.yaml ]; then
        echo "Error: dc-agency config.yaml not found. Please check the pre-requisite setup instructions."
        exit 1
    fi

    # Check if the config file contains LICENSE_PLACEHOLDER
    if grep -q "LICENSE_PLACEHOLDER" dc-agency/docker/config/config.yaml; then
        echo "Error: dc-agency config.yaml still contains LICENSE_PLACEHOLDER. Please replace it with your actual license key."
        exit 1
    fi
}

# Function to prompt for missing values
prompt_for_missing_values() {
    if [[ "$command" == "deploy" ]]; then
        # IBM Verify bootstrap credentials (shared logic in common_functions.sh)
        prompt_for_verify_credentials
    elif [[ "$command" == "undeploy" && "$dc_agency_only" != true ]]; then
        # Verify credentials are needed on undeploy to tear down provisioned objects
        prompt_for_undeploy_verify_credentials
    fi
}

# Function to deploy dc-agency services
deploy_dc_agency() {

    check_dc_agency_config

    local action=$1
    echo "Deploying dc-agency services ($action)..."

    if [[ "$action" == "up" ]]; then
        # Run setup.sh to generate certificates before starting services
        echo "Running setup.sh to generate certificates..."
        pushd dc-agency/docker > /dev/null
        ./setup.sh > /dev/null 2>&1
        if [ $? -ne 0 ]; then
            echo "Error: Failed to generate certificates. Aborting deployment."
            popd > /dev/null
            exit 1
        fi

        # NOTE: IAG external IDP wiring is currently unused.
        # The IAG runs in local EAI mode (hardcoded user_1) for all deployments.
        # The web apps authenticate directly against IBM Verify SaaS via their own
        # provisioned OIDC apps — the IAG login flow is not in their path at all.
        # To re-enable external IDP login for the dc-agency admin UI, restore the
        # block below and re-introduce the --dmv-idp-url / --dmv-idp-client-id /
        # --dmv-idp-client-secret parameters.
        #
        # # Temporarily modify IAG config with client credentials
        # echo "Temporarily updating IAG config with client credentials..."
        # cp iag_config/config.yaml iag_config/config.yaml.bak
        # cp oidc_provider_config/provider.yml oidc_provider_config/provider.yml.bak
        #
        # if [[ -n "$idp_client_id" ]]; then
        #     replace_string "iag_config/config.yaml" \
        #                 "client_id: \"client_id\"" "client_id: \"$idp_client_id\""
        # fi
        # if [[ -n "$idp_client_secret" ]]; then
        #     replace_string "iag_config/config.yaml" \
        #                 "client_secret: \"client_secret\"" "client_secret: \"$idp_client_secret\""
        # fi
        # if [[ "$idp_url" != "$default_idp_url" ]]; then
        #     echo "Custom IDP URL provided, updating to use oidc in IAG config..."
        #     switch_iag_to_oidc "iag_config/config.yaml"
        #     replace_string "iag_config/config.yaml" \
        #                 "discovery_endpoint: \"https://example.idp/oauth2/.well-known/openid-configuration\"" \
        #                 "discovery_endpoint: \"$idp_url/oauth2/.well-known/openid-configuration\""
        #     replace_string "oidc_provider_config/provider.yml" \
        #                 "endpoint: \"/locallogin\"" \
        #                 "endpoint: \"/oauth2/login\""
        # fi

        # Start the services
        docker-compose up -d

        popd > /dev/null

        # Wait for essential services to be ready
        wait_for_container "iviadcgw"
        wait_for_container "iviadcop"
        wait_for_container "iviadc"

        echo "DC Agency service containers are now running."
        echo "Checking if DC agency services are fully up and functional..."

        # Check if DC agency services are fully up and functional using Docker health check
        check_dc_agency_services 60  # Try for up to 5 minutes (60 attempts with 5-second intervals)
        local services_status=$?

        if [ $services_status -eq 0 ]; then
            echo "DC Agency services are fully up and functional!"
        else
            echo "Warning: DC Agency services may not be fully functional yet."
            echo "Continuing with deployment, but applications might not work correctly."
        fi

    else
        pushd dc-agency/docker > /dev/null
        docker-compose down
        popd > /dev/null
        echo "DC Agency services have been stopped."

        # Add warning about web apps needing redeployment only when undeploying dc-agency only
        if [[ "$dc_agency_only" == "true" ]]; then
            echo ""
            echo "⚠️  WARNING: If you have web applications (bank-app, dmv-app, hr-portal) currently deployed,"
            echo "   you will need to redeploy them to ensure they are properly configured"
            echo "   with the new DC agency services when you start them again."
            echo ""
        fi
    fi
}

# Function to initialize environment for web-apps
initialize_environment() {
    echo "Initializing environment for web-apps..."

    # Install required Python dependencies
    echo "Installing required Python dependencies..."
    pip install -r requirements.txt

    # Run init.py with local development values
    echo "Running init.py to initialize the environment..."

    # Set CUSTOM_CA_PATH for localhost deployment with self-signed certificates
    # Use the CA bundle which includes both the server cert and CA cert for proper chain validation
    local ca_bundle_path="$(pwd)/dc-agency/docker/ca-bundle.pem"
    local ca_cert_path="$(pwd)/dc-agency/docker/iviadc-ca.pem"

    if [ -f "$ca_bundle_path" ]; then
        echo "Setting CUSTOM_CA_PATH to trust self-signed certificates: $ca_bundle_path"
        export CUSTOM_CA_PATH="$ca_bundle_path"
    elif [ -f "$ca_cert_path" ]; then
        echo "Warning: Using CA certificate only (ca-bundle.pem not found): $ca_cert_path"
        echo "For better compatibility, run './dc-agency/docker/setup.sh' to regenerate certificates."
        export CUSTOM_CA_PATH="$ca_cert_path"
    else
        echo "Warning: CA certificate not found at $ca_cert_path"
        echo "Certificate validation may fail. Run './dc-agency/docker/setup.sh' to generate certificates."
    fi

    run_init_py

    # Check if per-app .env files were created successfully
    check_env_files_exist
}

# Function to deploy web-apps
deploy_web_apps() {
    local action=$1
    echo "Deploying web-apps ($action)..."

    if [[ "$action" == "up" ]]; then
        # Check if DC agency services are running when deploying only web-apps
        if ! is_container_running "iviadcgw" || ! is_container_running "iviadcop" || ! is_container_running "iviadc"; then
            echo "Error: DC Agency services are not running. Please start them first with:"
            echo "  $0 deploy --dc-agency-only"
            exit 1
        fi

        # Check if DC agency services are fully functional before initializing environment
        echo "Checking if DC agency services are fully functional before initializing web apps..."
        check_dc_agency_services 12
        local services_status=$?

        if [ $services_status -ne 0 ]; then
            echo "Warning: DC Agency services are not fully functional yet."
            echo "Do you want to continue anyway? (y/n)"
            read -r response
            if [[ "$response" != "y" ]]; then
                echo "Deployment aborted."
                exit 1
            fi
            echo "Continuing with deployment despite potential issues..."
        else
            echo "DC Agency services are fully functional. Proceeding with web apps deployment."
        fi

        # Initialize environment before starting web-apps
        initialize_environment

        # ── Pre-flight: verify canonical local images exist ───────────────────
        local missing_images=()
        for img in bank-app dmv-app hr-portal; do
            if ! docker image inspect "localhost/${img}:latest" &>/dev/null; then
                missing_images+=("localhost/${img}:latest")
            fi
        done
        if [[ ${#missing_images[@]} -gt 0 ]]; then
            echo "❌ Error: The following required images are not available locally:"
            for img in "${missing_images[@]}"; do
                echo "     $img"
            done
            echo "Please run './build.sh' first to build the images."
            exit 1
        fi

        # Start the services using pre-built images
        docker-compose -f docker-compose-webapps.yml up -d

        # Wait for web apps to be ready
        wait_for_container "bank-app"
        wait_for_container "dmv-app"
        wait_for_container "hr-portal"

        echo "Web apps are now starting, it can take a few minutes before the webpages are accessible:"
        echo "Bank App URL: https://localhost:8091"
        echo "DMV App URL: https://localhost:8090"
        echo "HR App URL: https://localhost:8092"
        echo "(Note: your browser will show a certificate warning — the cert is self-signed by the local CA.)"
        echo "To trust it permanently, import dc-agency/docker/iviadc-ca.pem into your browser/OS trust store."

        save_state

    else
        # Tear down IBM Verify provisioned objects before stopping containers.
        # Credentials are always available here — prompt_for_missing_values guaranteed
        # they were collected (or passed as flags) before we reached this point.
        # Authentication failure is fatal — abort rather than tearing down containers
        # with Verify objects still provisioned.
        if ! teardown_verify_objects; then
            echo "Error: IBM Verify teardown failed. Aborting undeploy."
            echo "Fix the credentials and retry, or clean up IBM Verify objects manually."
            return 1
        fi

        docker-compose -f docker-compose-webapps.yml down
        echo "Web apps have been stopped."
    fi
}

###############################################################################
# Main line.

# Default values
command="deploy"
web_apps_only=false
dc_agency_only=false

# Local development values
dmv_app_url="https://localhost:8090"
bank_app_url="https://localhost:8091"
hr_app_url="https://localhost:8092"
agency_url="https://localhost:8443/diagency"
vical_url="https://iviadcgw:8443/diagency"
oidc_token_endpoint="https://localhost:8443/oauth2/token"
is_app_prod_deploy="false"

# IBM Verify bootstrap credentials
dmv_verify_base_url=""
dmv_verify_bootstrap_client_id=""
dmv_verify_bootstrap_client_secret=""
hr_verify_base_url=""
hr_verify_bootstrap_client_id=""
hr_verify_bootstrap_client_secret=""
bank_verify_base_url=""
bank_verify_bootstrap_client_id=""
bank_verify_bootstrap_client_secret=""
verify_setup_debug="false"

# Parse command
if [[ $# -ge 1 ]]; then
    if [[ "$1" == "deploy" || "$1" == "undeploy" ]]; then
        command="$1"
        shift
    fi
fi

# Parse options
while [[ $# -gt 0 ]]; do
    case "$1" in
        --web-apps-only)
            web_apps_only=true
            shift
            ;;
        --dc-agency-only)
            dc_agency_only=true
            shift
            ;;
        --debug)
            verify_setup_debug="true"
            shift
            ;;
        --dmv-verify-base-url)
            dmv_verify_base_url="$2"
            shift 2
            ;;
        --dmv-verify-bootstrap-client-id)
            dmv_verify_bootstrap_client_id="$2"
            shift 2
            ;;
        --dmv-verify-bootstrap-client-secret)
            dmv_verify_bootstrap_client_secret="$2"
            shift 2
            ;;
        --hr-verify-base-url)
            hr_verify_base_url="$2"
            shift 2
            ;;
        --hr-verify-bootstrap-client-id)
            hr_verify_bootstrap_client_id="$2"
            shift 2
            ;;
        --hr-verify-bootstrap-client-secret)
            hr_verify_bootstrap_client_secret="$2"
            shift 2
            ;;
        --bank-verify-base-url)
            bank_verify_base_url="$2"
            shift 2
            ;;
        --bank-verify-bootstrap-client-id)
            bank_verify_bootstrap_client_id="$2"
            shift 2
            ;;
        --bank-verify-bootstrap-client-secret)
            bank_verify_bootstrap_client_secret="$2"
            shift 2
            ;;
        --*)
            echo "Unknown option: $1"
            usage
            ;;
        *)
            echo "Unexpected argument: $1"
            usage
            ;;
    esac
done

# Validate options
if [[ "$web_apps_only" == true && "$dc_agency_only" == true ]]; then
    echo "Error: Cannot specify both --web-apps-only and --dc-agency-only"
    usage
fi

# Execute command
case "$command" in
    "deploy")
        # Prompt for credentials before doing any work
        prompt_for_missing_values
        if [[ "$dc_agency_only" == true ]]; then
            deploy_dc_agency "up"
        elif [[ "$web_apps_only" == true ]]; then
            deploy_web_apps "up"
        else
            # Deploy both, dc-agency first
            deploy_dc_agency "up"
            deploy_web_apps "up"
        fi
        ;;
    "undeploy")
        # Confirm first, then prompt for credentials — mirrors the OpenShift flow
        if [[ "$dc_agency_only" == true ]]; then
            read -p "Are you sure you want to undeploy dc-agency services? (y/n): " confirm
        elif [[ "$web_apps_only" == true ]]; then
            read -p "Are you sure you want to undeploy web apps? (y/n): " confirm
        else
            read -p "Are you sure you want to undeploy ALL local services? (y/n): " confirm
        fi

        if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
            echo "Undeploy operation cancelled."
            exit 0
        fi

        # Credentials are only needed when web-apps are being undeployed
        prompt_for_missing_values

        # Proceed with undeployment
        if [[ "$dc_agency_only" == true ]]; then
            deploy_dc_agency "down"
        elif [[ "$web_apps_only" == true ]]; then
            deploy_web_apps "down" || exit 1
        else
            # Undeploy both, web-apps first (abort if Verify teardown fails)
            deploy_web_apps "down" || exit 1
            deploy_dc_agency "down"
        fi
        ;;
    *)
        usage
        ;;
esac

echo "Operation completed successfully."
