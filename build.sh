#!/bin/bash

#
# build.sh — Build Docker images for the OID4VC sample web apps.
#
# Produces three canonical local images:
#   bank-app:latest
#   dmv-app:latest
#   hr-portal:latest
#
# Images are always built for linux/amd64 so they are compatible with both
# local Docker (via Rosetta on Apple Silicon) and OpenShift nodes.
#
# These images are the single source of truth consumed by:
#   ./deploy_locally.sh deploy  — runs them directly via docker-compose
#   ./deploy_openshift.sh push  — re-tags them for the target registry, then pushes
#

# Load shared helper functions
# shellcheck source=common_functions.sh
source "$(dirname "$0")/common_functions.sh"

###############################################################################
# Usage.

instructions="Build Docker images for the OID4VC sample web apps.

Usage:
  $0 [--help]

Builds the following images (always targeting linux/amd64):
  bank-app:latest
  dmv-app:latest
  hr-portal:latest

These images must be built before running:
  ./deploy_locally.sh deploy
  ./deploy_openshift.sh push

Examples:
  $0
"

if [[ "${1:-}" == "--help" ]]; then
    echo "$instructions"
    exit 0
fi

###############################################################################
# Functions.

# build_image <name>
#
# Builds a single linux/amd64 image tagged localhost/<name>:latest using
# ./<name>/Dockerfile.  If a previous image existed under that tag, removes
# its now-dangling digest afterwards without disturbing unrelated images.
build_image() {
    local name="$1"
    local tag="localhost/${name}:latest"
    local dockerfile="./${name}/Dockerfile"
    local old_digest

    echo "Building ${name} image..."
    old_digest=$(docker inspect --format='{{.Id}}' "$tag" 2>/dev/null || true)

    docker build --platform linux/amd64 -t "$tag" -f "$dockerfile" .
    if [[ $? -ne 0 ]]; then
        echo "❌ Error: Failed to build ${name} image."
        echo "Please check the build output above for errors."
        exit 1
    fi

    echo "✅ ${name} image built successfully."

    # Remove the previous digest if it is now untagged (dangling).
    if [[ -n "$old_digest" ]]; then
        local tags
        tags=$(docker inspect --format='{{json .RepoTags}}' "$old_digest" 2>/dev/null || echo "[]")
        if [[ "$tags" == "[]" ]]; then
            docker rmi "$old_digest" 2>/dev/null || true
        fi
    fi
}

###############################################################################
# Build images.

echo "Building Docker images (platform: linux/amd64)..."

build_image "bank-app"
build_image "dmv-app"
build_image "hr-portal"

echo "✅ All Docker images built successfully."
echo ""
echo "You can now run:"
echo "  ./deploy_locally.sh deploy         — deploy locally via docker-compose"
echo "  ./deploy_openshift.sh push ...     — re-tag and push to a container registry"
