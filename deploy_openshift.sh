#!/bin/bash

#
# This script is used to manage the deployment of the OID4VC sample apps
# (bank-app, dmv-app and hr-portal) and dc-agency services in OpenShift.
#

# Load shared helper functions
# shellcheck source=common_functions.sh
source "$(dirname "$0")/common_functions.sh"

###############################################################################
# Constants.

# Web apps constants
bank_app_name="bank-app"
dmv_app_name="dmv-app"
hr_app_name="hr-portal"
bank_config_map_name="oid4vc-config-bank"
dmv_config_map_name="oid4vc-config-dmv"
hr_config_map_name="oid4vc-config-hr"
vc_repo_secret="isva-vc-repo-dal" # pragma: allowlist secret

# DC Agency constants
pg_configmap="isva-vc-iviadcdb"
op_configmap="isva-vc-iviadcop"
vc_configmap="isva-vc-iviadcvc"
gw_configmap="isva-vc-iviadcgw"
ca_configmap="isva-vc-iviadc-ca"
vc_accountname="isva-vc"
route=iviadcgw

instructions="This script is used to deploy the OID4VC sample apps (bank-app, dmv-app and hr-portal)
and dc-agency services to an OpenShift cluster.

Usage:
  $0 [command] [options] <oc-project-name>

Commands:
  build                Build Docker images for the web apps
  push                 Push Docker images to the registry
  deploy               Deploy services to OpenShift (default)
  undeploy             Undeploy services from OpenShift
  create-secret        Create repository secret (for dc-agency services)

Required Parameters:
  For build, push, deploy:
  --registry <url>           Container registry URL
  --registry-namespace <ns>  Registry namespace

  For deploy only (in addition to the two arguments above):
  --apps-domain <domain>     Domain for app routes (optional; omit for OpenShift auto-generated routes)

  IBM Verify bootstrap credentials (mandatory for web-app deployment):
  --dmv-verify-base-url <url>              DMV IBM Verify tenant base URL
                                           (default: https://demos.verify.ibm.com)
  --dmv-verify-bootstrap-client-id <id>   DMV IBM Verify bootstrap API client ID (mandatory)
  --dmv-verify-bootstrap-client-secret <s> DMV IBM Verify bootstrap API client secret (mandatory)

  --hr-verify-base-url <url>               HR IBM Verify tenant base URL
                                           (currently always inherited from DMV — IAG limitation)
  --hr-verify-bootstrap-client-id <id>    HR IBM Verify bootstrap API client ID
                                           (currently always inherited from DMV — IAG limitation)
  --hr-verify-bootstrap-client-secret <s> HR IBM Verify bootstrap API client secret
                                           (currently always inherited from DMV — IAG limitation)

  --bank-verify-base-url <url>             Bank IBM Verify tenant base URL (mandatory)
  --bank-verify-bootstrap-client-id <id>  Bank IBM Verify bootstrap API client ID (mandatory)
  --bank-verify-bootstrap-client-secret <s> Bank IBM Verify bootstrap API client secret (mandatory)

  For create-secret:
  --registry <url>           Container registry URL
  --docker-username <user>   Docker registry username
  --docker-password <pwd>    Docker registry password/API key

Options:
  --web-apps-only            Deploy only the web apps
  --dc-agency-only           Deploy only the dc-agency services
  --debug                    Print full IBM Verify app provisioning request/response payloads

Notes:
  - If required parameters are not provided, you will be prompted to enter them interactively
  - During deployment, you will be prompted for four secrets:
    * Postgres password (for database authentication)
    * Deployment Admin secret (client_id: admin)
    * Tenant0 Admin secret (client_id: 00000000-0000-4000-8000-000000000000)
    * Tenant1 Admin secret (client_id: 11111111-1111-4111-8111-111111111111)
  - You will also be prompted to select which tenant (0 or 1) to use for initialization
  - If any of the four secrets are left blank, a password is automatically generated and used
  - Admin secrets must NOT be 'secret' for security reasons
  - Bootstrap credentials are used once to provision OIDC apps, API clients, and FIDO2 RPs
    in each IBM Verify tenant; the provisioned credentials are written into each app's ConfigMap
  - HR bootstrap credentials always inherit DMV's values (IAG limitation — see common_functions.sh)
  - ⚠️  Bank: users and groups will be created in the bank IBM Verify tenant during deployment
  - Each app's ConfigMap is created separately: oid4vc-config-bank, oid4vc-config-dmv, oid4vc-config-hr
  - On undeploy, the provisioned IBM Verify objects (apps, FIDO2 RPs, bank group) are deleted

Examples:
  $0 build --registry icr.io --registry-namespace myorg/myrepo my-project
  $0 push --registry icr.io --registry-namespace myorg/myrepo my-project
  $0 create-secret --registry icr.io --docker-username iamapikey --docker-password <apikey>

  # Deploy both dc-agency and web-apps
  $0 deploy --registry icr.io --registry-namespace myorg/myrepo --apps-domain example.com \\
      --dmv-verify-base-url https://demos.verify.ibm.com \\
      --dmv-verify-bootstrap-client-id abc123 --dmv-verify-bootstrap-client-secret xyz789 \\
      --bank-verify-base-url https://bank.verify.ibm.com \\
      --bank-verify-bootstrap-client-id bk123 --bank-verify-bootstrap-client-secret bksecret \\
      my-project

  # Undeploy services (also tears down IBM Verify objects)
  $0 undeploy my-project
  $0 undeploy --web-apps-only my-project
  $0 undeploy --dc-agency-only my-project

Note: <oc-project-name> is mandatory for all commands.
Note: When deploying both services, dc-agency services are deployed first, followed by web-apps.
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
# Note: replace_string(), switch_iag_to_oidc(), prompt_for_verify_credentials(),
#       prompt_for_undeploy_verify_credentials(), teardown_verify_objects(), and
#       check_env_files_exist() are defined in common_functions.sh.

get_host()
{
    host=`kubectl get route $1 -o json | jq '.spec.host' | sed "s|\"||g"`

    if [ -z "$host" ] ; then
        echo "Warning> could not determine host for $1. Using default OpenShift generated host." 1>&2
        # Try to get the host from the route status instead (OpenShift auto-generated)
        host=`kubectl get route $1 -o json | jq '.status.ingress[0].host' | sed "s|\"||g"`
        
        if [ -z "$host" ] ; then
            echo "Error> could not determine a host for $1." 1>&2
            exit 1
        fi
    fi

    echo "$host"
}

# Function to check if a project exists
project_exists()
{
    local project_name=$1
    if oc get project "$project_name" &>/dev/null; then
        return 0  # Project exists
    else
        return 1  # Project does not exist
    fi
}

# Function to switch to a project
switch_to_project()
{
    local target_project=$1
    local current_project=$(oc project -q)
    
    if [ -z "$current_project" ]; then
        current_project="default"
    fi
    
    if [ "$target_project" = "$current_project" ]; then
        # Already in the correct project
        return 0
    fi
    
    echo "Switching context from $current_project to project $target_project..."
    oc project "$target_project" || {
        echo "Error: Failed to switch to project '$target_project'."
        return 1
    }
    
    return 0
}

# Function to switch back to original project
switch_back_to_original_project()
{
    local original_project=$1
    local current_project=$(oc project -q)
    
    if [ -z "$current_project" ] || [ "$original_project" = "$current_project" ]; then
        # Already in the original project or no current project
        return 0
    fi
    
    if project_exists "$original_project"; then
        echo "Switching context from $current_project back to project $original_project..."
        oc project "$original_project" || echo "Failed to switch back to project $original_project."
    else
        echo "Original project $original_project no longer exists. Staying in current context."
    fi
    
    return 0
}

# Function to create a project if it doesn't exist
create_project_if_not_exists()
{
    local project_name=$1
    
    if ! project_exists "$project_name"; then
        echo "Project $project_name does not exist. Creating it..."
        oc new-project "$project_name" || {
            echo "Error: Failed to create project '$project_name'."
            return 1
        }
        return 0
    fi
    
    # Project already exists
    return 0
}

# Function to check if a pod is running
is_pod_running() {
    local pod_name=$1
    local status=$(kubectl get pods -l app=$pod_name -o jsonpath='{.items[0].status.phase}' 2>/dev/null)
    if [[ "$status" == "Running" ]]; then
        return 0  # Pod is running
    else
        return 1  # Pod is not running
    fi
}

# Function to wait for a pod to be ready
wait_for_pod() {
    local pod_name=$1
    local max_attempts=30
    local attempt=1
    
    echo "Waiting for $pod_name to be ready..."
    
    while ! is_pod_running "$pod_name"; do
        if [[ $attempt -ge $max_attempts ]]; then
            echo "Error: $pod_name did not start within the expected time."
            return 1
        fi
        
        echo "Waiting for $pod_name to start... (attempt $attempt/$max_attempts)"
        sleep 5
        ((attempt++))
    done
    
    echo "$pod_name is running."
    return 0
}

# Function to check if a specific DC agency service is healthy
check_service_health() {
    local service_name=$1
    local max_attempts=$2
    
    if [ -z "$max_attempts" ]; then
        max_attempts=60  # Default to 60 attempts (5 minutes with 5-second intervals)
    fi
    
    local attempt=1
    
    echo "Checking if $service_name service is healthy..."
    
    while [ $attempt -le $max_attempts ]; do
        echo "Attempt $attempt/$max_attempts: Checking $service_name health status"
        
        # Get the health status of the pod
        local health_status=$(kubectl get pods -l app=$service_name -o jsonpath='{.items[0].status.conditions[?(@.type=="Ready")].status}' 2>/dev/null)
        
        if [ "$health_status" = "True" ]; then
            echo "✅ $service_name is healthy!"
            return 0
        else
            echo "❌ $service_name health status: $health_status (waiting for 'True')"
        fi
        
        echo "Waiting for 5 seconds before next check..."
        sleep 5
        ((attempt++))
    done
    
    echo "❌ $service_name service did not become healthy after $max_attempts attempts."
    return 1
}

# Function to check if DC agency services are fully functional
check_dc_agency_services() {
    local max_attempts=$1
    
    if [ -z "$max_attempts" ]; then
        max_attempts=60  # Default to 60 attempts (5 minutes with 5-second intervals)
    fi
    
    echo "Checking if DC agency services are fully up and functional..."
    
    # Check iviadc service health
    check_service_health "iviadc" $max_attempts
    local iviadc_status=$?
    
    # Check iviadcop service health
    check_service_health "iviadcop" $max_attempts
    local iviadcop_status=$?
    
    if [ $iviadc_status -eq 0 ] && [ $iviadcop_status -eq 0 ]; then
        echo "✅ All required DC agency services are healthy!"
        return 0
    else
        echo "❌ Some DC agency services are not healthy."
        return 1
    fi
}

# Function to prompt for missing values
prompt_for_missing_values() {
    # For build, push, deploy commands
    if [[ "$command" == "build" || "$command" == "push" || "$command" == "deploy" ]]; then
        if [[ -z "$registry_url" ]]; then
            read -p "Enter container registry URL: " registry_url
        fi

        if [[ -z "$registry_namespace" ]]; then
            read -p "Enter registry namespace: " registry_namespace
        fi
    fi

    # For create-secret command
    if [[ "$command" == "create-secret" ]]; then
        if [[ -z "$registry_url" ]]; then
            read -p "Enter container registry URL: " registry_url
        fi

        if [[ -z "$docker_username" ]]; then
            read -p "Enter Docker registry username: " docker_username
        fi

        if [[ -z "$docker_password" ]]; then
            read -s -p "Enter Docker registry password/API key: " docker_password
            echo
        fi
    fi

    # For deploy command
    if [[ "$command" == "deploy" ]]; then

        # IBM Verify bootstrap credentials (shared logic in common_functions.sh)
        prompt_for_verify_credentials

        # Prompt for Postgres password
        if [[ -z "$postgres_password" ]]; then
            read -s -p "Enter Postgres password (leave blank to auto-generate): " postgres_password
            echo
        fi
        if [[ -z "$postgres_password" ]]; then
            postgres_password=$(uuidgen | tr '[:upper:]' '[:lower:]')
            echo "Auto-generated Postgres password: $postgres_password"
        fi

        # Prompt for admin secrets
        if [[ -z "$deployment_admin_secret" ]]; then
            read -s -p "Enter secret for Deployment Admin (leave blank to auto-generate, DO NOT USE '${illegal_admin_password}'): " deployment_admin_secret
            echo
        fi
        if [[ -z "$deployment_admin_secret" ]]; then
            deployment_admin_secret=$(uuidgen | tr '[:upper:]' '[:lower:]')
            echo "Auto-generated Deployment Admin secret: $deployment_admin_secret"
        fi

        if [ "$deployment_admin_secret" == "$illegal_admin_password" ]; then
            echo "Invalid deployment admin secret. Please do not use '${illegal_admin_password}'."
            exit 1
        fi

        if [[ -z "$tenant0_admin_secret" ]]; then
            read -s -p "Enter secret for Tenant0 Admin (leave blank to auto-generate, DO NOT USE '${illegal_admin_password}'): " tenant0_admin_secret
            echo
        fi
        if [[ -z "$tenant0_admin_secret" ]]; then
            tenant0_admin_secret=$(uuidgen | tr '[:upper:]' '[:lower:]')
            echo "Auto-generated Tenant0 Admin secret: $tenant0_admin_secret"
        fi

        if [ "$tenant0_admin_secret" == "$illegal_admin_password" ]; then
            echo "Invalid tenant0 admin secret. Please do not use '${illegal_admin_password}'."
            exit 1
        fi

        if [[ -z "$tenant1_admin_secret" ]]; then
            read -s -p "Enter secret for Tenant1 Admin (leave blank to auto-generate, DO NOT USE '${illegal_admin_password}'): " tenant1_admin_secret
            echo
        fi
        if [[ -z "$tenant1_admin_secret" ]]; then
            tenant1_admin_secret=$(uuidgen | tr '[:upper:]' '[:lower:]')
            echo "Auto-generated Tenant1 Admin secret: $tenant1_admin_secret"
        fi

        if [ "$tenant1_admin_secret" == "$illegal_admin_password" ]; then
            echo "Invalid tenant1 admin secret. Please do not use '${illegal_admin_password}'."
            exit 1
        fi
        
        # Prompt for which tenant to use
        if [[ -z "$tenant" ]]; then
            read -p "Enter tenant to use for initialization (0 or 1, default 0): " tenant
        fi
        
        # Default to tenant 0 if not specified
        if [[ -z "$tenant" ]]; then
            tenant="0"
        fi
        
        # Validate tenant value
        if [[ "$tenant" != "0" && "$tenant" != "1" ]]; then
            echo "Invalid tenant value. Must be 0 or 1."
            exit 1
        fi
        
        # apps_domain is now optional
        if [[ -z "$apps_domain" ]]; then
            read -p "Enter apps domain (leave blank to omit host specification): " apps_domain
        fi
    fi
}

###############################################################################
# Save / load deployment state (structural flags only — no credentials).

state_file()
{
    local proj="${project_name:-default}"
    echo ".deploy-state.${proj}"
}

save_state()
{
    local file
    file=$(state_file)
    cat > "$file" <<EOF
registry_url='${registry_url}'
registry_namespace='${registry_namespace}'
apps_domain='${apps_domain}'
project_name='${project_name}'
EOF
    chmod 600 "$file"
    echo "Deployment state saved to $file"
}

load_state()
{
    local file
    file=$(state_file)
    if [ ! -f "$file" ]; then
        echo "Error: No saved state found at $file."
        echo "Run a full 'deploy' first, or pass --registry / --registry-namespace / --apps-domain explicitly."
        exit 1
    fi
    # shellcheck source=/dev/null
    source "$file"
    echo "Loaded deployment state from $file"
}

# prompt_for_undeploy_verify_credentials is defined in common_functions.sh.

###############################################################################
# Build Docker images for the apps.
# Delegates entirely to build.sh — the canonical single build entry point.

build()
{
    "$(dirname "$0")/build.sh"
}

###############################################################################
# Push Docker images to the registry.
# Requires canonical local images (bank-app:latest etc.) to have been built
# first via ./build.sh.  Re-tags them for the target registry, then pushes.

push()
{
    # Check whether we received a project name and should use the name as a suffix on the images
    if [[ -n "$1" ]]; then
        suffix="-$1"
    else
        suffix=""
    fi

    # ── Pre-flight: verify canonical local images exist ───────────────────────
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

    # ── Re-tag canonical images for the target registry ───────────────────────
    echo "Re-tagging images for registry: $registry_url/$registry_namespace"
    docker tag localhost/bank-app:latest  $registry_url/$registry_namespace/bank-app$suffix:latest
    docker tag localhost/dmv-app:latest   $registry_url/$registry_namespace/dmv-app$suffix:latest
    docker tag localhost/hr-portal:latest $registry_url/$registry_namespace/hr-portal$suffix:latest

    # ── Push ──────────────────────────────────────────────────────────────────
    echo "Pushing Docker images to registry: $registry_url/$registry_namespace"

    echo "Pushing bank-app$suffix image..."
    docker push $registry_url/$registry_namespace/bank-app$suffix:latest

    echo "Pushing dmv-app$suffix image..."
    docker push $registry_url/$registry_namespace/dmv-app$suffix:latest

    echo "Pushing hr-portal$suffix image..."
    docker push $registry_url/$registry_namespace/hr-portal$suffix:latest

    echo "✅ Docker images pushed successfully."
}

###############################################################################
# Deploy web-apps to OpenShift.

deploy_web_apps()
{
    echo "Deploying OID4VC sample web-apps to OpenShift..."

    # Create temp directory to edit config files on the fly
    temp=/tmp/dcdeploy/config
    mkdir -p $temp

    # Check whether we received a project name or whether we will deploy to the current oc project
    local original_project_name=""
    
    if [[ -n "$project_name" ]]; then
        # Project name was specified; omit suffix for "prod" so hostnames are undecorated
        if [[ "$project_name" == "prod" ]]; then
            suffix=""
        else
            suffix="-$project_name"
        fi
        
        # Get the current project name
        original_project_name=$(oc project -q)
        if [ -z "$original_project_name" ]; then
            original_project_name="default"
        fi
        
        # Create project if it doesn't exist and switch to it
        create_project_if_not_exists "$project_name" || exit 1
        switch_to_project "$project_name" || exit 1
    else
        suffix=""
    fi

    # Apply the network policy to allow egress traffic to the verify tenant from DMV
    echo "Applying network policy..."
    kubectl apply -f ./openshift/network-policy.yaml

    # Update the routes with the project name and domain
    cp ./openshift/routes.yaml $temp/
    
    if [[ -n "$apps_domain" ]]; then
        # If apps_domain is provided, update the host entries
        replace_string $temp/routes.yaml \
                    "host: dmv-dc.example.com" "host: dmv-dc$suffix.$apps_domain"
        replace_string $temp/routes.yaml \
                    "host: bank-dc.example.com" "host: bank-dc$suffix.$apps_domain"
        replace_string $temp/routes.yaml \
                    "host: hr-dc.example.com" "host: hr-dc$suffix.$apps_domain"
    else
        # If apps_domain is not provided, remove the host lines
        # Use a more compatible sed syntax that works on both macOS and Linux
        sed '/host:/d' $temp/routes.yaml > $temp/routes.yaml.tmp
        mv $temp/routes.yaml.tmp $temp/routes.yaml
    fi

    # Deploy the routes first
    echo "Deploying routes..."
    kubectl apply -f $temp/routes.yaml
    rm -rf $temp/*

    # Determine hostnames from routes
    set -e; BANK_HOST=`get_host $bank_app_name "BANK_HOST"`; set +e
    set -e; DMV_HOST=`get_host $dmv_app_name "DMV_HOST"`; set +e
    set -e; HR_HOST=`get_host $hr_app_name "HR_HOST"`; set +e

    # Get the gateway host for agency URL and token endpoint
    set -e; GATEWAY_HOST=`get_host $route "GATEWAY_HOST"`; set +e
    agency_url="https://$GATEWAY_HOST/diagency"
    oidc_token_endpoint="https://$GATEWAY_HOST/oauth2/token"

    # Run init.py NOW — before waiting for dc-agency pods to be healthy.
    # IBM Verify provisioning (apps, FIDO2 RPs, group) is a pure SaaS API operation
    # that does not depend on dc-agency being ready.  dc-agency agent creation does
    # require the OIDC token endpoint (via the gateway route resolved above), but
    # not healthy pod readiness.  Running init.py here means:
    #   - any provisioning failure aborts before we waste time waiting for pods
    #   - ConfigMaps are ready to mount the moment we deploy the web-app pods
    echo "Running init.py to initialize the environment..."
    echo "(This step creates dc-agency agents, provisions IBM Verify objects, and writes ConfigMap env files.)"
    echo "(Expect several API calls — it may take 30–90 seconds to complete.)"

    # Set ADMIN_NAME and ADMIN_PASSWORD based on selected tenant
    if [[ "$tenant" == "0" ]]; then
        admin_name="00000000-0000-4000-8000-000000000000"
        admin_password="$tenant0_admin_secret"
    else
        admin_name="11111111-1111-4111-8111-111111111111"
        admin_password="$tenant1_admin_secret"
    fi

    # OpenShift-only extras are exported into the environment so run_init_py
    # inherits them automatically via the python3 subprocess.
    # DMV_HOST / BANK_HOST / HR_HOST are bare hostnames from the route; prefix https://.
    # Use local variables so re-running deploy_web_apps (or running it after
    # deploy_dc_agency) never double-prefixes an already-https:// value.
    local _dmv_host_url _bank_host_url _hr_host_url
    if [[ "$DMV_HOST"  != https://* ]]; then _dmv_host_url="https://$DMV_HOST";   else _dmv_host_url="$DMV_HOST";  fi
    if [[ "$BANK_HOST" != https://* ]]; then _bank_host_url="https://$BANK_HOST"; else _bank_host_url="$BANK_HOST"; fi
    if [[ "$HR_HOST"   != https://* ]]; then _hr_host_url="https://$HR_HOST";     else _hr_host_url="$HR_HOST";    fi
    export DMV_HOST="$_dmv_host_url"
    export BANK_HOST="$_bank_host_url"
    export HR_HOST="$_hr_host_url"
    export VERIFY_CREDS_FILE="$(pwd)/.verify-creds.json"
    export PROJECT_NAME="$project_name"
    export ADMIN_NAME="$admin_name"
    export ADMIN_PASSWORD="$admin_password"
    export is_app_prod_deploy="true"

    # run_init_py handles log capture, Error> grep, and exit-code checking internally.
    # It will call exit 1 on any failure — no post-call checks needed here.
    run_init_py

    # Check if per-app .env files were created successfully
    check_env_files_exist

    echo "Creating web-app TLS Secret..."
    kubectl create secret tls oid4vc-webapps-tls \
        --cert=./dc-agency/docker/webapps.crt \
        --key=./dc-agency/docker/webapps.key \
        --dry-run=client -o yaml | kubectl apply -f -

    echo "Creating per-app ConfigMaps..."
    kubectl create configmap $bank_config_map_name --from-env-file=.env.bank --dry-run=client -o yaml | kubectl apply -f -
    kubectl create configmap $dmv_config_map_name  --from-env-file=.env.dmv  --dry-run=client -o yaml | kubectl apply -f -
    kubectl create configmap $hr_config_map_name   --from-env-file=.env.hr   --dry-run=client -o yaml | kubectl apply -f -

    # ConfigMaps are ready — now wait for dc-agency pods before launching web-app pods
    # that depend on them at startup.
    if [[ "$dc_agency_only" != "true" ]]; then
        echo "Checking if DC agency services are healthy before deploying web-app pods..."
        check_service_health "iviadcop" 12
        local iviadcop_status=$?
        check_service_health "iviadc" 12
        local iviadc_status=$?
        if [ $iviadcop_status -ne 0 ] || [ $iviadc_status -ne 0 ]; then
            echo "Warning: DC Agency services are not fully healthy yet."
            read -r -p "Continue deploying web-app pods anyway? (y/n): " response
            if [[ "$response" != "y" ]]; then
                echo "Deployment aborted."
                exit 1
            fi
            echo "Continuing despite unhealthy DC Agency services..."
        else
            echo "DC Agency services are healthy. Deploying web-app pods..."
        fi
    fi

    # Update the deployment YAML files with the registry information
    echo "Updating deployment YAML files with registry information..."
    cp ./openshift/*.yaml $temp/
    replace_string $temp/bank-app.yaml \
                "image: bank-app:latest" "image: $registry_url/$registry_namespace/bank-app$suffix:latest"
    replace_string $temp/dmv-app.yaml \
                "image: dmv-app:latest" "image: $registry_url/$registry_namespace/dmv-app$suffix:latest"
    replace_string $temp/hr-portal.yaml \
                "image: hr-portal:latest" "image: $registry_url/$registry_namespace/hr-portal$suffix:latest"

    # Deploy the apps
    echo "Deploying bank-app, dmv-app and hr-portal..."
    kubectl apply -f $temp/bank-app.yaml
    kubectl apply -f $temp/dmv-app.yaml
    kubectl apply -f $temp/hr-portal.yaml
    rm -rf $temp/*

    # Switch back to original project if needed
    if [[ -n "$project_name" && -n "$original_project_name" ]]; then
        switch_back_to_original_project "$original_project_name"
    fi

    echo "Web apps deployment completed successfully. It can take a few minutes before the webpages are accessible:"
    echo ""
    echo "Bank App URL: $BANK_HOST"
    echo "DMV App URL: $DMV_HOST"
    echo "HR Portal URL: $HR_HOST"

    save_state
}

###############################################################################
# Undeploy web-apps from OpenShift.

undeploy_web_apps()
{
    echo "Undeploying OID4VC sample web-apps from OpenShift..."

    # ── Step 1: IBM Verify teardown (always runs — independent of cluster state) ──
    # Provisioned apps, FIDO2 RPs, and the bank group live in the Verify SaaS tenant,
    # not in OpenShift.  We must clean them up even if the OC project is already gone.
    echo ""
    echo "IBM Verify bootstrap credentials are required to clean up provisioned objects"
    echo "(applications, FIDO2 relying parties, and bank group)."
    prompt_for_undeploy_verify_credentials

    teardown_verify_objects
    local teardown_exit=$?
    if [[ $teardown_exit -ne 0 ]]; then
        echo "Error: IBM Verify teardown failed (exit $teardown_exit). Aborting undeploy."
        echo "Fix the teardown errors and retry, or clean up IBM Verify objects manually."
        return 1
    fi

    # ── Step 2: OpenShift resource deletion (skipped gracefully if project gone) ──
    local original_project_name=""
    local skip_kube=false

    if [[ -n "$project_name" ]]; then
        original_project_name=$(oc project -q)
        if [ -z "$original_project_name" ]; then
            original_project_name="default"
        fi

        if ! project_exists "$project_name"; then
            echo "Note: OpenShift project '$project_name' no longer exists — skipping kubectl deletions."
            skip_kube=true
        else
            switch_to_project "$project_name" || return 1
        fi
    fi

    if [[ "$skip_kube" == false ]]; then
        # Delete the custom network policy
        echo "Deleting network policy..."
        kubectl delete -f ./openshift/network-policy.yaml || echo "Network policy not found or could not be deleted."

        # Delete the apps
        echo "Deleting bank-app, dmv-app and hr-portal..."
        kubectl delete -f ./openshift/bank-app.yaml || echo "Bank app not found or could not be deleted."
        kubectl delete -f ./openshift/dmv-app.yaml || echo "DMV app not found or could not be deleted."
        kubectl delete -f ./openshift/hr-portal.yaml || echo "HR portal not found or could not be deleted."

        # Delete the routes
        echo "Deleting routes..."
        kubectl delete -f ./openshift/routes.yaml || echo "Routes not found or could not be deleted."

        # Delete per-app ConfigMaps
        echo "Deleting web-app TLS Secret..."
        kubectl delete secret oid4vc-webapps-tls || echo "Secret oid4vc-webapps-tls not found or could not be deleted."

        echo "Deleting per-app ConfigMaps..."
        kubectl delete configmap $bank_config_map_name || echo "ConfigMap $bank_config_map_name not found or could not be deleted."
        kubectl delete configmap $dmv_config_map_name  || echo "ConfigMap $dmv_config_map_name not found or could not be deleted."
        kubectl delete configmap $hr_config_map_name   || echo "ConfigMap $hr_config_map_name not found or could not be deleted."

        # Switch back to original project if needed
        if [[ -n "$project_name" && -n "$original_project_name" ]]; then
            switch_back_to_original_project "$original_project_name"
        fi
    fi

    echo "Web apps undeployment completed."
}

###############################################################################
# Deploy dc-agency to OpenShift.

deploy_dc_agency()
{
    echo "Deploying dc-agency services to OpenShift..."

    # Create temp directory to edit config files on the fly
    temp=/tmp/dcdeploy/config
    mkdir -p $temp

    # Check whether we received a project name or whether we will deploy to the current oc project
    local original_project_name=""
    
    if [[ -n "$project_name" ]]; then
        # Project name was specified; omit suffix for "prod" so hostnames are undecorated
        if [[ "$project_name" == "prod" ]]; then
            suffix=""
        else
            suffix="-$project_name"
        fi
        
        # Get the current project name
        original_project_name=$(oc project -q)
        if [ -z "$original_project_name" ]; then
            original_project_name="default"
        fi
        
        echo "Original project name: $original_project_name"
        echo "Creating project name: $project_name"
        
        # Create project if it doesn't exist
        if ! project_exists "$project_name"; then
            echo "Creating new OpenShift project..."
            oc adm new-project "$project_name" || {
                echo "Error: Failed to create project '$project_name'."
                exit 1
            }
            
            # Create service account
            echo "Creating service account $vc_accountname in project $project_name..."
            kubectl create serviceaccount "$vc_accountname" -n "$project_name" || {
                echo "Error: Failed to create service account in project '$project_name'."
                exit 1
            }
            
            # Grant privileged SCC to service account
            echo "Granting privileged SCC to service account $vc_accountname..."
            oc adm policy add-scc-to-user privileged "system:serviceaccount:$project_name:$vc_accountname" || {
                echo "Error: Failed to grant privileges to service account."
                exit 1
            }
        fi
        
        # Switch to the specified project
        switch_to_project "$project_name" || exit 1
        
        # Copying secret from the original_project_name to the new project
        kubectl get secret $vc_repo_secret -n "$original_project_name" -o yaml | sed '/namespace:/d' | kubectl apply -n "$project_name" -f -
    else
        # Create service account
        echo "Creating service account $vc_accountname..."
        kubectl create serviceaccount "$vc_accountname" || echo "Service account may already exist."
        
        suffix=""
    fi

    # Update the routes with the project name and domain
    cp ./dc-agency/openshift/routes.yaml $temp/
    
    if [[ -n "$apps_domain" ]]; then
        # If apps_domain is provided, update the host entries
        replace_string $temp/routes.yaml "host: gateway-dc.example.com" "host: gateway-dc$suffix.$apps_domain"
    else
        # If apps_domain is not provided, remove the host lines
        # Use a more compatible sed syntax that works on both macOS and Linux
        sed '/host:/d' $temp/routes.yaml > $temp/routes.yaml.tmp
        mv $temp/routes.yaml.tmp $temp/routes.yaml
    fi

    # Deploy the routes.
    kubectl apply -f $temp/routes.yaml
    rm -rf $temp/*

    # Work out the hostname from the route.
    echo "Determining the hostname..."
    if [ -z "$host" ] ; then
        set -e; host=`get_host $route "host"`; set +e
    fi

    cp ./openshift/routes.yaml $temp/
    if [[ -n "$apps_domain" ]]; then
        replace_string $temp/routes.yaml "host: dmv-dc.example.com" "host: dmv-dc$suffix.$apps_domain"
        replace_string $temp/routes.yaml "host: bank-dc.example.com" "host: bank-dc$suffix.$apps_domain"
        replace_string $temp/routes.yaml "host: hr-dc.example.com" "host: hr-dc$suffix.$apps_domain"
    else
        sed '/host:/d' $temp/routes.yaml > $temp/routes.yaml.tmp
        mv $temp/routes.yaml.tmp $temp/routes.yaml
    fi
    kubectl apply -f $temp/routes.yaml
    rm -rf $temp/*

    set -e; dmv_route_host=`get_host $dmv_app_name`; set +e
    set -e; bank_route_host=`get_host $bank_app_name`; set +e
    set -e; hr_route_host=`get_host $hr_app_name`; set +e

    echo "Pre-provisioning IBM Verify apps for gateway OIDC..."
    DMV_HOST="https://$dmv_route_host" \
    BANK_HOST="https://$bank_route_host" \
    HR_HOST="https://$hr_route_host" \
    GATEWAY_HOST="$host" \
    VERIFY_CREDS_FILE="$(pwd)/.verify-creds.json" \
    DMV_IBM_VERIFY_BASE_URL="$dmv_verify_base_url" \
    DMV_IBM_VERIFY_BOOTSTRAP_CLIENT_ID="$dmv_verify_bootstrap_client_id" \
    DMV_IBM_VERIFY_BOOTSTRAP_CLIENT_SECRET="$dmv_verify_bootstrap_client_secret" \
    HR_IBM_VERIFY_BASE_URL="$hr_verify_base_url" \
    HR_IBM_VERIFY_BOOTSTRAP_CLIENT_ID="$hr_verify_bootstrap_client_id" \
    HR_IBM_VERIFY_BOOTSTRAP_CLIENT_SECRET="$hr_verify_bootstrap_client_secret" \
    BANK_IBM_VERIFY_BASE_URL="$bank_verify_base_url" \
    BANK_IBM_VERIFY_BOOTSTRAP_CLIENT_ID="$bank_verify_bootstrap_client_id" \
    BANK_IBM_VERIFY_BOOTSTRAP_CLIENT_SECRET="$bank_verify_bootstrap_client_secret" \
    PROJECT_NAME="$project_name" \
    VERIFY_SETUP_DEBUG="$verify_setup_debug" \
    python3 -u verify_preprovision.py || exit 1

    # Update gateway certificate config using the hostname and
    # regenerate new certificates
    echo "Generating service certificates..."
    pushd ./dc-agency/docker/ > /dev/null
    source ./setup.sh "$host" > /dev/null 2>&1
    popd > /dev/null

    # Create the ConfigMaps.  We need to massage the configuration for
    # some of the configuration files.
    echo "Creating the ConfigMap's...."

    cp ./dc-agency/docker/iviadc-ca.pem $temp/
    cp ./dc-agency/docker/iag_config/verify_intermediate_pub.crt $temp/
    cp ./dc-agency/docker/iag_config/verify_root_pub.crt $temp/
    kubectl create configmap $ca_configmap --from-file=$temp/
    rm -rf $temp/*

    cp -r ./dc-agency/docker/postgres_config/* $temp/
    cp ./dc-agency/docker/iviadc-ca.pem $temp/
    rm -f $temp/certs.sh $temp/req.conf
    kubectl create configmap $pg_configmap --from-file=$temp/
    rm -rf $temp/*

    cp ./dc-agency/docker/oidc_provider_config/* $temp/
    cp ./dc-agency/docker/iviadc-ca.pem $temp/
    rm -f $temp/certs.sh $temp/req.conf
    replace_string $temp/provider.yml \
                "https://iviadcop:8436" "https://$host"
    replace_string $temp/provider.yml \
                "base_url: https://iviadcgw:8443" "base_url: https://$host"
    replace_string $temp/provider.yml \
                "issuer: https://isvaop.ibm.com" "issuer: https://$host/oauth2"
    replace_string $temp/provider.yml \
                "issuer: https://iviadcgw:8443/oauth2" "issuer: https://$host/oauth2"
    replace_string $temp/provider.yml \
                "endpoint: \"/locallogin\"" "endpoint: \"/oauth2/auth\""
    replace_string $temp/provider.yml \
                "endpoint: \"/locallogout\"" "endpoint: \"/oauth2/logout\""
    # Replace hard-coded Postgres password in provider.yml
    replace_string $temp/provider.yml \
                "password: passw0rd" "password: $postgres_password"
    # Update the three admin client secrets in provider.yml
    # Use awk to update each admin client secret individually
    awk -v deployment_secret="$deployment_admin_secret" -v tenant0_secret="$tenant0_admin_secret" -v tenant1_secret="$tenant1_admin_secret" '
    /client_id: admin$/ { in_deployment_admin=1 }
    /client_id: 00000000-0000-4000-8000-000000000000$/ { in_tenant0_admin=1 }
    /client_id: 11111111-1111-4111-8111-111111111111$/ { in_tenant1_admin=1 }
    /client_secret:/ {
        if (in_deployment_admin) {
            print "    client_secret: " deployment_secret
            in_deployment_admin=0
            next
        } else if (in_tenant0_admin) {
            print "    client_secret: " tenant0_secret
            in_tenant0_admin=0
            next
        } else if (in_tenant1_admin) {
            print "    client_secret: " tenant1_secret
            in_tenant1_admin=0
            next
        }
    }
    { print }
    ' $temp/provider.yml > $temp/provider.yml.tmp && mv $temp/provider.yml.tmp $temp/provider.yml
    kubectl create configmap $op_configmap --from-file=$temp/
    rm -rf $temp/*
    
    cp -r ./dc-agency/docker/config/* $temp/
    cp ./dc-agency/docker/iviadc-ca.pem $temp/
    rm -f $temp/config.template $temp/certs.sh $temp/req.conf
    replace_string $temp/config.yaml "      - https://iviadcgw:8443/*" "      - https://$host:8443/*"
    replace_string $temp/config.yaml "url: \"https://iviadcgw:8443\"" "url: \"https://$host\""
    replace_string $temp/config.yaml "            endpoint: \"https://iviadcgw:8443/oauth2\"" "            endpoint: \"https://$host/oauth2\""
    replace_string $temp/config.yaml "        client_secret: \"secret\"" "        client_secret: \"$deployment_admin_secret\""
    replace_string $temp/config.yaml "              client_secret: \"secret\"" "              client_secret: \"$deployment_admin_secret\""
    # Replace hard-coded Postgres password in config.yaml
    replace_string $temp/config.yaml "    password: \"passw0rd\"" "    password: \"$postgres_password\""
    kubectl create configmap $vc_configmap --from-file=$temp/
    rm -rf $temp/*

    cp -r ./dc-agency/docker/iag_config/* $temp/
    cp ./dc-agency/docker/iviadc-ca.pem $temp/
    rm -f $temp/certs.sh $temp/req.conf $temp/ivjwt_req.conf
    if [[ -f .verify-creds.json ]]; then
        dmv_oidc_client_id=$(python3 -c 'import json; import sys; print(json.load(open(".verify-creds.json"))["dmv"]["oidc_client_id"])')
        dmv_oidc_client_secret=$(python3 -c 'import json; import sys; print(json.load(open(".verify-creds.json"))["dmv"]["oidc_client_secret"])')
        switch_iag_to_oidc $temp/config.yaml
        replace_string $temp/config.yaml "discovery_endpoint: \"https://example.idp/oauth2/.well-known/openid-configuration\"" "discovery_endpoint: \"$dmv_verify_base_url/oauth2/.well-known/openid-configuration\""
        replace_string $temp/config.yaml "client_id: \"client_id\"" "client_id: \"$dmv_oidc_client_id\""
        replace_string $temp/config.yaml "client_secret: \"client_secret\"" "client_secret: \"$dmv_oidc_client_secret\""
    fi
    kubectl create configmap $gw_configmap --from-file=$temp/
    rm -rf $temp/*

    # Deploy our containers.
    echo "Deploying the pods...."
    cp -r ./dc-agency/openshift/* $temp/
    rm -f $temp/routes.yaml
    
    # Replace hard-coded Postgres password in YAML files
    echo "Updating Postgres password in deployment files..."
    replace_string $temp/iviadcdb.yaml \
                "value: passw0rd" "value: $postgres_password"
    
    kubectl apply -f $temp
    rm -rf $temp

    # Wait for essential services to be ready
    echo "Waiting for essential DC Agency services to be ready..."
    wait_for_pod "iviadcgw"
    wait_for_pod "iviadcop"
    wait_for_pod "iviadc"

    echo "DC Agency service pods are now running."
    echo "Checking if DC agency services are fully healthy..."
    
    # Check if DC agency services are fully healthy
    check_dc_agency_services 60  # Try for up to 5 minutes (60 attempts with 5-second intervals)
    local services_status=$?
    
    if [ $services_status -eq 0 ]; then
        echo "DC Agency services are fully healthy!"
    else
        echo "Warning: DC Agency services are not fully healthy yet."
        echo "Continuing with deployment, but applications might not work correctly."
        echo "You may need to wait a few more minutes for all services to initialize completely."
    fi

    # Switch back to original project if needed
    if [[ -n "$project_name" && -n "$original_project_name" ]]; then
        switch_back_to_original_project "$original_project_name"
    fi

    echo "DC Agency services deployment completed successfully."
}

###############################################################################
# Undeploy dc-agency from OpenShift.

undeploy_dc_agency()
{
    echo "Undeploying dc-agency services from OpenShift..."
    echo ""
    echo "You need to be logged in to OC for this command to succeed!"
    echo ""

    local original_project_name=""
    local skip_kube=false

    if [[ -n "$project_name" ]]; then
        original_project_name=$(oc project -q)
        if [ -z "$original_project_name" ]; then
            original_project_name="default"
        fi

        if ! project_exists "$project_name"; then
            echo "Note: OpenShift project '$project_name' no longer exists — skipping kubectl deletions."
            skip_kube=true
        else
            switch_to_project "$project_name" || return 1
        fi
    fi

    if [[ "$skip_kube" == false ]]; then
        echo "Checking for dc-agency resources..."

        # Delete the pods
        echo "Deleting the pods...."
        kubectl delete -f dc-agency/openshift/ || echo "DC agency pods not found or could not be deleted."

        # Delete the ConfigMaps
        echo "Deleting the ConfigMap's...."
        kubectl delete configmap $pg_configmap || echo "ConfigMap $pg_configmap not found or could not be deleted."
        kubectl delete configmap $op_configmap || echo "ConfigMap $op_configmap not found or could not be deleted."
        kubectl delete configmap $vc_configmap || echo "ConfigMap $vc_configmap not found or could not be deleted."
        kubectl delete configmap $gw_configmap || echo "ConfigMap $gw_configmap not found or could not be deleted."
        kubectl delete configmap $ca_configmap || echo "ConfigMap $ca_configmap not found or could not be deleted."

        # Delete the service account
        echo "Deleting the service account: $vc_accountname...."
        kubectl delete serviceaccount $vc_accountname || echo "Service account $vc_accountname not found or could not be deleted."

        # Switch back to original project if needed
        if [[ -n "$project_name" && -n "$original_project_name" ]]; then
            switch_back_to_original_project "$original_project_name"
        fi
    fi

    echo "DC Agency services undeployment completed."
    
    # Add warning about web apps needing redeployment only when undeploying dc-agency only
    if [[ "$dc_agency_only" == "true" ]]; then
        echo ""
        echo "⚠️  WARNING: If you have web applications (bank-app, dmv-app, hr-portal) currently deployed,"
        echo "   you will need to redeploy them to ensure they are properly configured"
        echo "   with the new DC agency services when you start them again."
        echo ""
    fi
}

###############################################################################
# Creating the repository secret.

create_secret()
{
    # Intentionally don't change openshift projects here - we will copy the secret from
    # the current context project into our newly created project when we deploy.
    # This avoids making the user recreate the secret every time they undeploy
    # and their project is deleted.

    # Add https:// prefix to registry_url if it doesn't already have it
    local docker_server="$registry_url"
    if [[ ! "$docker_server" =~ ^https?:// ]]; then
        docker_server="https://$docker_server"
    fi

    echo "Creating the repository secret: $vc_repo_secret..."
    kubectl create secret docker-registry $vc_repo_secret \
        --docker-server=$docker_server \
        --docker-username=$docker_username \
        --docker-password=$docker_password \
        --docker-email=$docker_username
}

###############################################################################
# Main line.

# Default values
command="deploy"
web_apps_only=false
dc_agency_only=false
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
apps_domain=""
project_name=""
registry_url=""
registry_namespace=""
docker_username=""
docker_password=""
deployment_admin_secret=""
tenant0_admin_secret=""
tenant1_admin_secret=""
tenant="0"

illegal_admin_password="secret"

# Parse command
if [[ $# -ge 1 ]]; then
    if [[ "$1" == "build" || "$1" == "push" || "$1" == "deploy" || "$1" == "undeploy" || "$1" == "create-secret" ]]; then
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
        --tenant)
            tenant="$2"
            shift 2
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
        --apps-domain)
            apps_domain="$2"
            shift 2
            ;;
        --registry)
            registry_url="$2"
            shift 2
            ;;
        --registry-namespace)
            registry_namespace="$2"
            shift 2
            ;;
        --docker-username)
            docker_username="$2"
            shift 2
            ;;
        --docker-password)
            docker_password="$2"
            shift 2
            ;;
        *)
            # Assume this is the project name
            project_name="$1"
            shift
            ;;
    esac
done

# Enforce mandatory project name for all commands
if [[ -z "$project_name" ]]; then
    echo "Error: <oc-project-name> is required."
    usage
fi

# Validate options
if [[ "$web_apps_only" == true && "$dc_agency_only" == true ]]; then
    echo "Error: Cannot specify both --web-apps-only and --dc-agency-only"
    usage
fi

# Check OpenShift login status before prompting for any details.
# build and push are pure Docker operations and do not need a cluster connection.
if [[ "$command" != "build" && "$command" != "push" ]]; then
    if ! oc whoami &>/dev/null; then
        echo "Error: You are not logged in to OpenShift. Please run 'oc login' first."
        exit 1
    fi
fi

# Validate registry parameters for build, push, deploy, and create-secret commands
prompt_for_missing_values

original_project_name=""
if [[ "$command" != "build" && "$command" != "push" && "$command" != "create-secret" ]]; then
    # Get the current project name or default if not set
    original_project_name=$(oc project -q)
    if [ -z "$original_project_name" ]; then
        original_project_name="default"
    fi
fi

# Execute command
case "$command" in
    "build")
        build "$project_name"
        ;;
    "push")
        push "$project_name"
        ;;
    "deploy")
        if [[ "$dc_agency_only" == true ]]; then
            deploy_dc_agency
        elif [[ "$web_apps_only" == true ]]; then
            deploy_web_apps
        else
            # Deploy both, dc-agency first
            deploy_dc_agency
            deploy_web_apps
        fi
        ;;
    "undeploy")
        # Ask for confirmation before proceeding with any undeploy operation
        if [[ -n "$project_name" ]]; then
            if [[ "$dc_agency_only" == true ]]; then
                read -p "Are you sure you want to undeploy dc-agency services from project '$project_name'? (y/n): " confirm
            elif [[ "$web_apps_only" == true ]]; then
                read -p "Are you sure you want to undeploy web apps from project '$project_name'? (y/n): " confirm
            else
                read -p "Are you sure you want to undeploy ALL services from project '$project_name'? (y/n): " confirm
            fi
        else
            if [[ "$dc_agency_only" == true ]]; then
                read -p "Are you sure you want to undeploy dc-agency services from the current project? **WARNING: this will act against your current openshift project context** (y/n): " confirm
            elif [[ "$web_apps_only" == true ]]; then
                read -p "Are you sure you want to undeploy web apps from the current project? **WARNING: this will act against your current openshift project context** (y/n): " confirm
            else
                read -p "Are you sure you want to undeploy ALL services from the current project? **WARNING: this will act against your current openshift project context** (y/n): " confirm
            fi
        fi
        
        if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
            echo "Undeploy operation cancelled."
            exit 0
        fi
        
        # Proceed with undeployment
        if [[ "$dc_agency_only" == true ]]; then
            undeploy_dc_agency
        elif [[ "$web_apps_only" == true ]]; then
            undeploy_web_apps
        else
            # Undeploy both, web-apps first
            undeploy_web_apps
            undeploy_dc_agency
            
            # Delete the project if specified
            if [[ -n "$project_name" && "$command" == "undeploy" ]]; then
                if project_exists "$project_name"; then
                    echo "Deleting the project: $project_name..."
                    oc delete project $project_name || echo "Failed to delete project $project_name."
                else
                    echo "Project $project_name no longer exists or has already been deleted."
                fi
            fi
        fi
        ;;
    "create-secret")
        create_secret
        ;;
    *)
        usage
        ;;
esac


echo "Operation completed successfully."
