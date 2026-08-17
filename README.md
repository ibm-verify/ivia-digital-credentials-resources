# IBM Verify Identity Access Digital Credentials

This repository contains sample applications demonstrating the implementation of OpenID for Verifiable Credentials (OID4VC) using IBM Verify Identity Access Digital Credentials.

The demo covers the end-to-end flow of issuing and verifying digital credentials: a DMV issues a digital driver's licence, a Bank verifies that credential to open an account, and an HR portal issues an employment credential.

## Applications

The three sample web applications each connect to a shared IBM Verify Identity Access Digital Credentials deployment running locally or in OpenShift.

| App | Description | Local URL |
|-----|-------------|-----------|
| `dmv-app` | Issues digital driver's licences | `https://localhost:8090` |
| `bank-app` | Verifies digital credentials to open accounts | `https://localhost:8091` |
| `hr-portal` | Issues employment credentials | `https://localhost:8092` |

## Prerequisites

### IBM Verify tenant

Sign up for a free trial: [https://www.ibm.com/account/reg/us-en/signup?formid=urx-30041](https://www.ibm.com/account/reg/us-en/signup?formid=urx-30041)

In your tenant, go to **Security → API access** and create a bootstrap API client. The deploy script uses this client to provision all required IBM Verify objects (OIDC applications, API clients, and FIDO2 relying parties) automatically on every deploy and removes them on undeploy — no further manual configuration is required. Each application can optionally be pointed at a different tenant.

Note the client ID — you will be prompted for the client secret at deploy time.

### Local tooling

- Docker and Docker Compose
- Python 3.x
- `jq`
- *(OpenShift only)* `oc`, `kubectl`, and an IBM Cloud API key for the container registry

## First-Time Setup

**1. Clone the repository**

```bash
git clone git@github.com:ibm-verify/ivia-digital-credentials-resources.git
cd ivia-digital-credentials-resources
```

**2. Set up a Python virtual environment**

```bash
python3 -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

**3. Build the Docker images**

```bash
./build.sh
```

> Re-run `./build.sh` whenever you make changes to the DMV, Bank, or HR portal source code.

## Deploy & Undeploy

Local and OpenShift deployments follow the same three-step workflow. The only differences for OpenShift are the script name and a small number of additional flags.

### Local

```bash
# Deploy
./deploy_locally.sh deploy \
    --dmv-verify-base-url https://<tenant-hostname> \
    --dmv-verify-bootstrap-client-id <client-id>

# Undeploy
./deploy_locally.sh undeploy \
    --dmv-verify-base-url https://<tenant-hostname> \
    --dmv-verify-bootstrap-client-id <client-id>
```

### OpenShift

Before deploying to OpenShift, push the built images to your container registry:

```bash
# Push images to registry
./deploy_openshift.sh push \
    --registry <registry-url> \
    --registry-namespace <registry-namespace> \
    [project-name]

# Deploy
./deploy_openshift.sh deploy \
    --registry <registry-url> \
    --registry-namespace <registry-namespace> \
    --dmv-verify-base-url https://<tenant-hostname> \
    --dmv-verify-bootstrap-client-id <client-id> \
    --apps-domain <your-apps-domain> \
    [project-name]

# Undeploy
./deploy_openshift.sh undeploy \
    --dmv-verify-base-url https://<tenant-hostname> \
    --dmv-verify-bootstrap-client-id <client-id> \
    [project-name]
```

`--apps-domain` sets the hostname suffix for the OpenShift app routes (e.g. `apps.mycluster.example.com`). Omit it to let OpenShift generate route hostnames automatically.

See `./deploy_openshift.sh --help` for the full flag reference including the `build` and `create-secret` commands.

### Notes

- Client secrets are prompted interactively if not supplied inline.
- `undeploy` tears down all IBM Verify objects provisioned at deploy time, as well as stopping the containers.
- Always `undeploy` before `deploy` to ensure a clean state.

## Mobile Connectivity (local deployment only)

When running locally, the mobile wallet app must be able to reach the `iviadcgw` container directly to complete the credential issuance flow. In most local network setups this is not possible because mobile devices cannot resolve Docker container hostnames.

Possible workarounds:

- Use a mobile emulator running on the same machine as Docker
- Configure network port forwarding and local DNS resolution
- Use the **Add to a wallet on this device** link when viewing the QR code if the wallet app is on the same machine

## Troubleshooting

- **Always `undeploy` before `deploy`** to get a clean instance of all services and IBM Verify objects.
- Check container logs for errors:
  ```bash
  docker logs iviadcgw
  docker logs dmv-app
  docker logs bank-app
  docker logs hr-portal
  ```
- Ensure no other services are occupying ports 8090, 8091, or 8092.
- For OpenShift, verify you are logged in to your cluster (`oc whoami`) and that the image pull secret exists before deploying.
- Run `./deploy_locally.sh --help` or `./deploy_openshift.sh --help` for the full flag reference.
