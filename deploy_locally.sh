#!/bin/bash

#
# This script is used to deploy the OID4VC sample apps and dc-agency services locally
# using Docker Compose.
#

###############################################################################
# Constants.

instructions="This script is used to deploy the OID4VC sample apps (bank-app and dmv-app)
and dc-agency services locally using Docker Compose.

Usage:
  $0 [all|web-apps|dc-agency] [up|down] [options]

Options:
  all                Deploy both dc-agency services and web-apps (default)
  web-apps           Deploy only the web-apps (bank-app and dmv-app)
  dc-agency          Deploy only the dc-agency services
  up                 Start the services (default)
  down               Stop the services
  --idp-client-id VALUE    Specify the IDP client ID
  --idp-client-secret VALUE Specify the IDP client secret
  --idp-url VALUE          Specify the IDP URL

Notes:
  - The IDP options are required for all 'up' actions
  - If not provided, you will be prompted to enter them interactively

Examples:
  $0                  # Deploy both dc-agency and web-apps
  $0 all up           # Same as above
  $0 web-apps         # Deploy only web-apps 
  $0 dc-agency        # Deploy only dc-agency services 
  $0 all down         # Stop all services
  $0 web-apps down    # Stop only web-apps
  $0 dc-agency down   # Stop only dc-agency services
  $0 all up --idp-client-id abc --idp-client-secret xyz --idp-url https://example.com
"

###############################################################################
# Usage.

usage()
{
    echo "$instructions"
    exit 1
}

###############################################################################
# Helper functions.

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

# Function to check if DC agency services are fully functional using Docker health check
check_dc_agency_services() {
    local max_attempts=$1
    
    if [ -z "$max_attempts" ]; then
        max_attempts=20  # Default to 20 attempts (5 minutes with 15-second intervals)
    fi
    
    local attempt=1
    
    echo "Checking if DC agency services are fully up and functional..."
    echo "Waiting for iviadc health check to pass..."
    
    while [ $attempt -le $max_attempts ]; do
        echo "Attempt $attempt/$max_attempts: Checking iviadc health status"
        
        # Get the health status of the iviadc container
        local health_status=$(docker inspect --format='{{.State.Health.Status}}' iviadc 2>/dev/null)
        
        if [ "$health_status" = "healthy" ]; then
            echo "✅ iviadc is healthy! DC agency services are fully up and functional."
            return 0
        else
            echo "❌ iviadc health status: $health_status (waiting for 'healthy')"
            echo "Waiting for 15 seconds before next check..."
            sleep 15
            ((attempt++))
        fi
    done
    
    echo "❌ DC agency services did not become fully healthy after $max_attempts attempts."
    return 1
}

# Function to replace string in a file
replace_string() {
    local file=$1
    local from=$2
    local to=$3

    sed "s|$from|$to|g" "$file" > "$file.tmp"
    mv "$file.tmp" "$file"
}

# Function to parse named options
parse_named_options() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --idp-client-id)
                idp_client_id="$2"
                shift 2
                ;;
            --idp-client-secret)
                idp_client_secret="$2"
                shift 2
                ;;
            --idp-url)
                idp_url="$2"
                shift 2
                ;;
            *)
                # Unknown option, skip it
                shift
                ;;
        esac
    done
}

# Function to prompt for missing values
prompt_for_missing_values() {
    if [[ "$action" == "up" ]]; then
        if [[ -z "$idp_client_id" ]]; then
            read -p "Enter IDP client ID (hit enter for default): " idp_client_id
        fi
        
        if [[ -z "$idp_client_secret" ]]; then
            read -p "Enter IDP client secret (hit enter for default): " idp_client_secret
        fi
        
        if [[ -z "$idp_url" ]]; then
            read -p "Enter IDP URL (hit enter for default): " idp_url
        fi

        # set defaults if needed
        if [[ -z "$idp_client_id" ]]; then
            idp_client_id="$default_idp_client_id"
        fi
        
        if [[ -z "$idp_client_secret" ]]; then
            idp_client_secret="$default_idp_client_secret"
        fi
        
        if [[ -z "$idp_url" ]]; then
            idp_url="$default_idp_url"
        fi

    fi
}

# Ensure the user has performed the required pre-req (step 2) for dcagency config.yaml
# cp config/config.template config/config.yaml
# sed -i.bak 's#LICENSE_PLACEHOLDER#<insert-license-key-string-here>#' config/config.yaml
# rm -f config/config.yaml.bak
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

switch_iag_to_oidc()
{
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
    
    # Replace original file with modified version
    mv "$config_file.tmp" "$config_file"
    
    echo "IAG config updated: EAI commented out, OIDC enabled"
    return 0
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
        
        # Temporarily modify IAG config with client credentials
        echo "Temporarily updating IAG config with client credentials..."
        # Create a backup of the original config
        cp iag_config/config.yaml iag_config/config.yaml.bak
        
        # Update idp_client_id, idp_client_secret, and discovery_endpoint in the config
        if [[ -n "$idp_client_id" ]]; then
            replace_string "iag_config/config.yaml" \
                        "client_id: \"client_id\"" "client_id: \"$idp_client_id\""
        fi

        if [[ -n "$idp_client_secret" ]]; then
            replace_string "iag_config/config.yaml" \
                        "client_secret: \"client_secret\"" "client_secret: \"$idp_client_secret\""
        fi

        if [[ -n "$idp_url" ]]; then
            switch_iag_to_oidc "iag_config/config.yaml"

            replace_string "iag_config/config.yaml" \
                        "discovery_endpoint: \"https://example.idp/oauth2/.well-known/openid-configuration\"" \
                        "discovery_endpoint: \"$idp_url/oauth2/.well-known/openid-configuration\""
        fi
        
        # Start the services
        docker-compose $action -d
        
        # Restore the original config file
        echo "Restoring original IAG config..."
        mv iag_config/config.yaml.bak iag_config/config.yaml
        
        popd > /dev/null

        # Wait for essential services to be ready
        wait_for_container "iviadcgw"
        wait_for_container "iviadcop"
        wait_for_container "iviadc"

        echo "DC Agency service containers are now running."
        echo "Checking if DC agency services are fully up and functional..."
        
        # Check if DC agency services are fully up and functional using Docker health check
        check_dc_agency_services 20  # Try for up to 5 minutes (20 attempts with 15-second intervals)
        local services_status=$?
        
        if [ $services_status -eq 0 ]; then
            echo "DC Agency services are fully up and functional!"
        else
            echo "Warning: DC Agency services may not be fully functional yet."
            echo "Continuing with deployment, but applications might not work correctly."
        fi
    else
        pushd dc-agency/docker > /dev/null
        docker-compose $action
        popd > /dev/null
        echo "DC Agency services have been stopped."
        
        # Add warning about web apps needing redeployment only when undeploying dc-agency only
        if [[ "$deploy_target" == "dc-agency" ]]; then
            echo ""
            echo "⚠️  WARNING: If you have web applications (bank-app, dmv-app) currently deployed,"
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
    
    DMV_HOST=$dmv_app_url \
    BANK_HOST=$bank_app_url \
    AGENCY_URL=$agency_url \
    VICAL_BASE_URL=$vical_url \
    OIDC_TOKEN_ENDPOINT=$oidc_token_endpoint \
    IDP_URL=$idp_url \
    IDP_CLIENT_ID=$idp_client_id \
    IDP_CLIENT_SECRET=$idp_client_secret \
    IS_APP_PROD_DEPLOY=$is_app_prod_deploy \
    CUSTOM_CA_PATH="$CUSTOM_CA_PATH" \
    python3 init.py
    
    # Check if .env file was created successfully
    if [ ! -f .env ]; then
        echo "Error: .env file not found. init.py failed."
        exit 1
    fi
    
    echo "Environment initialized successfully."
}

# Function to deploy web-apps
deploy_web_apps() {
    local action=$1
    echo "Deploying web-apps ($action)..."
    
    if [[ "$action" == "up" ]]; then
        # Check if DC agency services are running when deploying only web-apps
        if ! is_container_running "iviadcgw" || ! is_container_running "iviadcop" || ! is_container_running "iviadc"; then
            echo "Error: DC Agency services are not running. Please start them first with:"
            echo "  $0 dc-agency up"
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
        
        # Build images first and check for failures
        echo "Building web app images..."
        docker-compose -f docker-compose-webapps.yml build
        build_status=$?
        if [ $build_status -ne 0 ]; then
            echo "❌ Error: Failed to build web app images. Build exited with status $build_status."
            echo "Please check the build output above for errors."
            exit 1
        fi
        echo "✅ Web app images built successfully."
        
        # Start the services after successful build
        docker-compose -f docker-compose-webapps.yml $action -d
        
        # Wait for web apps to be ready
        wait_for_container "bank-app"
        wait_for_container "dmv-app"
        
        echo "Web apps are now starting, it can take a few minutes before the webpages are accessible:"
        echo "Bank App URL: http://localhost:8091"
        echo "DMV App URL: http://localhost:8090"
    else
        docker-compose -f docker-compose-webapps.yml $action
        echo "Web apps have been stopped."
    fi
}

###############################################################################
# Main line.

# Parse arguments
deploy_target="all"
action="up"

# Local development values
dmv_app_url="http://localhost:8090"
bank_app_url="http://localhost:8091"
agency_url="https://localhost:8443/diagency"
vical_url="https://iviadcgw:8443/diagency"
oidc_token_endpoint="https://localhost:8443/oauth2/token"
is_app_prod_deploy="false"

# Initialize IDP variables
idp_url=""
idp_client_id=""
idp_client_secret=""

default_idp_url="https://iviadcgw:8443"
default_idp_client_id="localdeploy_dmv_client"
default_idp_client_secret="localdeploy_dmv_client_secret"

# Parse deploy target and action
if [[ $# -ge 1 ]]; then
    if [[ "$1" == "all" || "$1" == "web-apps" || "$1" == "dc-agency" ]]; then
        deploy_target="$1"
        shift
    elif [[ "$1" == "--idp-client-id" || "$1" == "--idp-client-secret" || "$1" == "--idp-url" ]]; then
        # It's a named option, don't shift yet
        :
    else
        usage
    fi
fi

if [[ $# -ge 1 ]]; then
    if [[ "$1" == "up" || "$1" == "down" ]]; then
        action="$1"
        shift
    elif [[ "$1" == "--idp-client-id" || "$1" == "--idp-client-secret" || "$1" == "--idp-url" ]]; then
        # It's a named option, don't shift yet
        :
    else
        usage
    fi
fi

# Parse named options
parse_named_options "$@"

# Prompt for missing values if needed
prompt_for_missing_values

# Execute deployment based on target
case "$deploy_target" in
    "all")
        if [[ "$action" == "up" ]]; then
            # For "up" action, deploy dc-agency first, then web-apps
            deploy_dc_agency "up"
            deploy_web_apps "up"
        else
            # For "down" action, stop web-apps first, then dc-agency
            deploy_web_apps "down"
            deploy_dc_agency "down"
        fi
        ;;
    "dc-agency")
        deploy_dc_agency "$action"
        ;;
    "web-apps")
        deploy_web_apps "$action"
        ;;
    *)
        usage
        ;;
esac

echo "Deployment completed successfully."

# Made with Bob
