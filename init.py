#!/usr/bin/env python3

"""
This script is used to create the .env file for an onpremise verifiable
credentials environment.
"""

import json
import os
import sys
from typing import Any
import requests

def get_verify_option():
    """
    Returns the appropriate verify option for requests.
    - If CUSTOM_CA_PATH is set, use that CA bundle (for localhost with self-signed certs)
    - Otherwise, use True (system CA bundle for production)
    - NEVER returns False - certificate validation is always enabled
    
    Returns:
        str or bool: Path to custom CA bundle, or True for system CA bundle
    """
    custom_ca = os.environ.get('CUSTOM_CA_PATH')
    if custom_ca and os.path.exists(custom_ca):
        print(f"Using custom CA certificate from: {custom_ca}")
        return custom_ca
    # Always validate certificates using system CA bundle
    return True

# Constants
DMV_AGENT_NAME = "DMVIssuer"
BANK_AGENT_NAME = "BankVerifier"
HR_AGENT_NAME = "HRIssuer"

DMV_DOCUMENT_TYPE = "org.iso.18013.5.1.mDL"
HR_EMPLOYMENT_DOCUMENT_TYPE = "com.example.hr.portal.employment_v1"
HR_EMPLOYMENT_NAMESPACE = "com.example.hr.portal.1"

# Debug flag — set to True by --debug CLI argument
_DEBUG = False


def _debug_dump(method: str, url: str, body: Any) -> None:
    """Print a formatted request or response body when debug mode is active."""
    if _DEBUG:
        print(f"  [debug] {method} {url}")
        print(json.dumps(body, indent=2))

INSTRUCTIONS = """This script is used to create the .env file for the
demo environment when the verifiable credentials environment is running
in an onpremise environment.

There are a couple of environment variables which will need to be
customised for the envionment in use, mostly AGENCY_URL and OIDC_TOKEN_ENDPOINT.

If the verifiable credentials environment is running in an OpenShift cluster
the KUBERNETES=1 environment variable can be set to tell this script to
dynamically obtain the required information.
"""

def usage():
    """Display usage instructions and exit."""
    print("Instructions:")
    print("=============")
    print(INSTRUCTIONS)
    sys.exit(1)

def get_access_token(token_endpoint, client_id, client_secret):
    """
    Retrieve an access token.
    
    Args:
        token_endpoint: OAuth token endpoint URL
        client_id: OAuth client ID
        client_secret: OAuth client secret
        
    Returns:
        Access token string
    """
    data = {
        'client_id': client_id,
        'client_secret': client_secret,
        'grant_type': 'client_credentials'
    }
    
    headers = {
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded'
    }
    
    response = requests.post(token_endpoint, headers=headers, data=data, verify=get_verify_option())
    
    if response.status_code != 200:
        print(f"Error getting access token: {response.text}")
        return None
        
    return response.json().get('access_token')

def build_logo_data(app_host, public_logo_path, local_logo_file_path):
    """
    Build a logo payload referencing the hosted logo URL.

    The agency enforces a 500-character maxLength on logo.uri, which rules out
    base64-embedded data: URIs for anything but trivial images.  The wallet
    client (not the agency) fetches the logo at display time, so a URL
    reference works correctly for both local (http://) and production (https://)
    deployments.  The local_logo_file_path parameter is retained for signature
    compatibility but is no longer used.
    """
    if app_host:
        return {'uri': f"{app_host}{public_logo_path}"}

    return None

def build_display_entry(display_name, app_host, public_logo_path, local_logo_file_path,
                        background_color=None, text_color=None):
    """
    Create a display entry with an optional logo payload.
    """
    display_entry = {
        'locale': 'en-AU',
        'name': display_name
    }

    logo_data = build_logo_data(app_host, public_logo_path, local_logo_file_path)
    if logo_data:
        display_entry['logo'] = logo_data

    if background_color:
        display_entry['background_color'] = background_color

    if text_color:
        display_entry['text_color'] = text_color

    return display_entry

def create_agent(agency_url, access_token, agent_id, agent_name, is_did_on_ledger, agent_type):
    """
    Create an agent.
    
    Args:
        agency_url: Agency URL
        access_token: Access token for authentication
        agent_id: Agent ID (can be empty string for new agents)
        agent_name: Agent name
        is_did_on_ledger: Boolean indicating if DID is on ledger
        agent_type: Type of agent (issuer or verifier)
        
    Returns:
        Agent data as dictionary
    """
    print(f"Creating the agent: {agent_name}")
    
    headers = {
        'Accept': 'application/json',
        'Authorization': f'Bearer {access_token}'
    }
    
    headers['Content-Type'] = 'application/json'

    agent_data = {
        'id': agent_id,
        'name': agent_name,
        'is_did_on_ledger': is_did_on_ledger,
        'agent_type': agent_type,
        'did_method': 'did:web'
    }

    if agent_type == "verifier":
        # For verifier, add profile with logo and 'verifier' attribute
        bank_host = os.environ.get('BANK_HOST', '')
        logo_file_path = "bank-app/public/logo.png"

        agent_data['profile'] = {
            'verifier': {
                'root_of_trust': {
                    'system_generated': {}
                },
                'metadata': {
                    'response_types': ['vp_token'],
                    'vp_formats_supported': {
                        'mso_mdoc': {
                            'issuerauth_alg_values': [-9, -7],
                            'deviceauth_alg_values': [-9, -7]
                        }
                    }
                },
                'default_exchange_template': {
                    'response_mode': 'direct_post',
                    'client_id_prefix': 'redirect_uri',
                    'request_mode': 'by_value_params',
                    'default_authorization_url_scheme': 'openid4vp://',
                    'ttl': 120
                }
            },
            'display': [
                build_display_entry('Smart Money Bank', bank_host, '/logo.png', logo_file_path)
            ]
        }

    elif agent_type == "issuer":
        # For issuer, add profile with logo
        issuer_display_name = 'Department of Motor Vehicles'
        issuer_host = os.environ.get('DMV_HOST', '')
        issuer_logo_path = '/logo.png'
        issuer_logo_file = 'dmv-app/public/logo.png'

        if agent_name == HR_AGENT_NAME:
            issuer_display_name = 'HR Portal Credential Services'
            issuer_host = os.environ.get('HR_HOST', '')
            issuer_logo_path = '/logo.svg'
            issuer_logo_file = 'hr-portal/public/logo.svg'

        agent_data['profile'] = {
            'display': [
                build_display_entry(issuer_display_name, issuer_host, issuer_logo_path, issuer_logo_file)
            ]
        }

    response = requests.post(
        f"{agency_url}/v1.0/diagency/agents?includepass=true",
        headers=headers,
        json=agent_data,
        verify=get_verify_option()
    )

    if response.status_code not in [200, 201]:
        print(f"Error creating agent: {response.text}")
        return None

    return response.json()

def build_dmv_credential_configuration(agency_url):
    """
    Build the credential_configurations POST payload for the DMV Driver's License.

    Merges what was previously sent to credential_schemas and credential_definitions
    into a single dict ready for create_credential_configuration().

    Returns:
        dict with schema, definitions, and state keys
    """
    return {
        "template_id": DMV_DOCUMENT_TYPE,
        "display": [
            {
                "name": "Mobile Driver's License",
                "description": "An ISO/IEC 18013-5 compliant mobile driver's license (mDL).",
                "locale": "en"
            }
        ]
    }

def build_dmv_schema_overrides(app_host):
    """
    Build schema overrides for DMV credential display colors.
    
    Returns a dict with the display entry override containing brand colors.
    """
    return {
        "schema": {
            "$oid4vc": {
                "display": [
                    build_display_entry(
                        "Mobile Driver's License",
                        app_host,
                        '/logo.svg',
                        'dmv-app/public/logo.svg',
                        background_color='#BB162D',
                        text_color='#FFFFFF'
                    )
                ]
            }
        }
    }




def build_hr_credential_configuration(agency_url):
    """
    Build the credential_configurations POST payload for the HR Proof of Employment credential.

    Merges what was previously sent to credential_schemas and credential_definitions
    into a single dict ready for create_credential_configuration().

    Returns:
        dict with schema, definitions, and state keys
    """
    namespace_base_id = "https://example.org/schemas/hr/employment"
    namespace_id = f"{namespace_base_id}/{HR_EMPLOYMENT_NAMESPACE}"

    return {
        "display": [
            {
                "name": "Proof of Employment and Income",
                "description": "An ISO/IEC 18013-5 formatted Proof of Employment and Income.",
                "locale": "en"
            }
        ],
        "schema": {
            "name": "hr-employment-schema",
            "version": "1.0",
            "schema": {
                "$schema": "https://json-schema.org/draft/2020-12/schema",
                "$linkedData": {
                    "identifier": HR_EMPLOYMENT_DOCUMENT_TYPE,
                    "@id": namespace_base_id,
                    "@vocab": namespace_base_id,
                    "@type": HR_EMPLOYMENT_DOCUMENT_TYPE
                },
                "$oid4vc": {
                    "display": [
                        build_display_entry(
                            "Proof of Employment and Income",
                            os.environ.get('HR_HOST', ''),
                            '/logo.svg',
                            'hr-portal/public/logo.svg',
                            background_color='#9F6939',
                            text_color='#FFFFFF'
                        )
                    ]
                },
                "type": "object",
                "properties": {
                    HR_EMPLOYMENT_NAMESPACE: {
                        "$linkedData": {
                            "identifier": HR_EMPLOYMENT_NAMESPACE,
                            "@id": namespace_id
                        },
                        "type": "object",
                        "properties": {
                            "@context": {
                                "type": "array"
                            },
                            "employee_id": {
                                "$linkedData": {
                                    "identifier": "employee_id",
                                    "@id": f"{namespace_id}/employee_id"
                                },
                                "$oid4vc": {
                                    "display": [{"name": "Employee ID", "locale": "en"}]
                                },
                                "type": "string"
                            },
                            "document_number": {
                                "$linkedData": {
                                    "identifier": "document_number",
                                    "@id": f"{namespace_id}/document_number"
                                },
                                "$oid4vc": {
                                    "display": [{"name": "Document number", "locale": "en"}]
                                },
                                "type": "string"
                            },
                            "given_name": {
                                "$linkedData": {
                                    "identifier": "given_name",
                                    "@id": f"{namespace_id}/given_name"
                                },
                                "$oid4vc": {
                                    "display": [{"name": "Given name", "locale": "en"}]
                                },
                                "type": "string"
                            },
                            "family_name": {
                                "$linkedData": {
                                    "identifier": "family_name",
                                    "@id": f"{namespace_id}/family_name"
                                },
                                "$oid4vc": {
                                    "display": [{"name": "Family name", "locale": "en"}]
                                },
                                "type": "string"
                            },
                            "email": {
                                "$linkedData": {
                                    "identifier": "email",
                                    "@id": f"{namespace_id}/email"
                                },
                                "$oid4vc": {
                                    "display": [{"name": "Email", "locale": "en"}]
                                },
                                "type": "string"
                            },
                            "employer_name": {
                                "$linkedData": {
                                    "identifier": "employer_name",
                                    "@id": f"{namespace_id}/employer_name"
                                },
                                "$oid4vc": {
                                    "display": [{"name": "Employer name", "locale": "en"}]
                                },
                                "type": "string"
                            },
                            "employer_entity_id": {
                                "$linkedData": {
                                    "identifier": "employer_entity_id",
                                    "@id": f"{namespace_id}/employer_entity_id"
                                },
                                "$oid4vc": {
                                    "display": [{"name": "Employer entity ID", "locale": "en"}]
                                },
                                "type": "string"
                            },
                            "job_title": {
                                "$linkedData": {
                                    "identifier": "job_title",
                                    "@id": f"{namespace_id}/job_title"
                                },
                                "$oid4vc": {
                                    "display": [{"name": "Job title", "locale": "en"}]
                                },
                                "type": "string"
                            },
                            "department": {
                                "$linkedData": {
                                    "identifier": "department",
                                    "@id": f"{namespace_id}/department"
                                },
                                "$oid4vc": {
                                    "display": [{"name": "Department", "locale": "en"}]
                                },
                                "type": "string"
                            },
                            "employment_status": {
                                "$linkedData": {
                                    "identifier": "employment_status",
                                    "@id": f"{namespace_id}/employment_status"
                                },
                                "$oid4vc": {
                                    "display": [{"name": "Employment status", "locale": "en"}]
                                },
                                "type": "string"
                            },
                            "employment_type": {
                                "$linkedData": {
                                    "identifier": "employment_type",
                                    "@id": f"{namespace_id}/employment_type"
                                },
                                "$oid4vc": {
                                    "display": [{"name": "Employment type", "locale": "en"}]
                                },
                                "type": "string"
                            },
                            "start_date": {
                                "$linkedData": {
                                    "identifier": "start_date",
                                    "@id": f"{namespace_id}/start_date"
                                },
                                "$oid4vc": {
                                    "display": [{"name": "Start date", "locale": "en"}]
                                },
                                "type": "string",
                                "format": "date"
                            },
                            "annual_income": {
                                "$linkedData": {
                                    "identifier": "annual_income",
                                    "@id": f"{namespace_id}/annual_income"
                                },
                                "$oid4vc": {
                                    "display": [{"name": "Annual income", "locale": "en"}]
                                },
                                "type": "string"
                            },
                            "pay_frequency": {
                                "$linkedData": {
                                    "identifier": "pay_frequency",
                                    "@id": f"{namespace_id}/pay_frequency"
                                },
                                "$oid4vc": {
                                    "display": [{"name": "Pay frequency", "locale": "en"}]
                                },
                                "type": "string"
                            },
                            "work_location": {
                                "$linkedData": {
                                    "identifier": "work_location",
                                    "@id": f"{namespace_id}/work_location"
                                },
                                "$oid4vc": {
                                    "display": [{"name": "Work location", "locale": "en"}]
                                },
                                "type": "string"
                            },
                            "manager_name": {
                                "$linkedData": {
                                    "identifier": "manager_name",
                                    "@id": f"{namespace_id}/manager_name"
                                },
                                "$oid4vc": {
                                    "display": [{"name": "Manager", "locale": "en"}]
                                },
                                "type": "string"
                            },
                            "issuing_authority": {
                                "$linkedData": {
                                    "identifier": "issuing_authority",
                                    "@id": f"{namespace_id}/issuing_authority"
                                },
                                "$oid4vc": {
                                    "display": [{"name": "Issuing authority", "locale": "en"}]
                                },
                                "type": "string"
                            }
                        },
                        "required": [
                            "employee_id",
                            "document_number",
                            "given_name",
                            "family_name",
                            "employer_name",
                            "job_title",
                            "employment_status",
                            "start_date",
                            "issuing_authority"
                        ],
                        "additionalProperties": False
                    }
                },
                "required": [HR_EMPLOYMENT_NAMESPACE],
                "additionalProperties": False
            }
        },
        "definitions": [
            {
                "credential_document_type": [HR_EMPLOYMENT_DOCUMENT_TYPE],
                "credential_format": "mso_mdoc",
                "credential_signing_algorithm": "ESP256",
                "cryptographic_binding_methods": ["cose_key"],
                "key_proof_types": {
                    "jwt": ["ES256"]
                }
            }
        ],
        "state": "draft"
    }


def _deep_update(target: dict, updates: dict) -> None:
    """
    Recursively update target dict with updates dict, preserving nested structures.
    """
    for key, value in updates.items():
        if isinstance(value, dict) and isinstance(target.get(key), dict):
            _deep_update(target[key], value)
        else:
            target[key] = value




def create_credential_configuration(agency_url, access_token, config_data, definition_overrides=None, schema_overrides=None):
    """
    Create a credential configuration using the new credential_configurations API.

    Posts config_data with state "draft", then publishes it via PUT.

    Args:
        agency_url: Agency URL
        access_token: Access token for authentication
        config_data: Full configuration payload (schema, definitions, state)
        definition_overrides: Optional dict of overrides to merge into definitions[0]
                              before the PUT (e.g. {"key_proof_types": {"jwt": ["ES256"]}})
        schema_overrides: Optional dict of overrides to merge into schema before the PUT
                         (e.g. {"schema": {"$oid4vc": {"display": [...]}}})

    Returns:
        Tuple of (credential_definition_id, schema_id), or (None, None) on failure
    """
    headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': f'Bearer {access_token}'
    }

    post_url = f"{agency_url}/v1.0/diagency/credential_configurations"

    # Step 1 — create in draft state
    _debug_dump("POST request →", post_url, config_data)
    response = requests.post(
        post_url,
        headers=headers,
        json=config_data,
        verify=get_verify_option()
    )

    try:
        post_body = response.json()
    except ValueError:
        post_body = response.text
    _debug_dump(f"POST response ← {response.status_code}", post_url, post_body)

    if response.status_code not in [200, 201]:
        print(f"Error creating credential configuration (POST): {response.text}")
        return None, None

    configuration_id = post_body.get('id') if isinstance(post_body, dict) else None
    if not configuration_id:
        print("Error creating credential configuration: no id in POST response")
        return None, None

    # Step 2 — publish: start from the POST response body, strip server-assigned
    # fields that must not be echoed back, then set state to "published"
    put_url = f"{agency_url}/v1.0/diagency/credential_configurations/{configuration_id}"
    put_payload = {k: v for k, v in post_body.items() if k not in ("id", "owner_id", "template_id")}
    put_payload["state"] = "published"

    # Apply any definition-level overrides to definitions[0] before publishing
    if definition_overrides and isinstance(put_payload.get("definitions"), list) and put_payload["definitions"]:
        put_payload["definitions"][0].update(definition_overrides)
    
    # Apply any schema-level overrides before publishing
    if schema_overrides and isinstance(put_payload.get("schema"), dict):
        _deep_update(put_payload["schema"], schema_overrides)
    _debug_dump("PUT request →", put_url, put_payload)
    put_response = requests.put(
        put_url,
        headers=headers,
        json=put_payload,
        verify=get_verify_option()
    )

    try:
        put_body = put_response.json()
    except ValueError:
        put_body = put_response.text
    _debug_dump(f"PUT response ← {put_response.status_code}", put_url, put_body)

    if put_response.status_code not in [200, 201]:
        print(f"Error publishing credential configuration (PUT): {put_response.text}")
        return None, None

    if not isinstance(put_body, dict):
        print("Error publishing credential configuration: unexpected non-JSON PUT response")
        return None, None

    created_definition_ids = put_body.get('created_definition_ids', [])
    if not created_definition_ids:
        print("Error publishing credential configuration: no created_definition_ids in PUT response")
        return None, None

    schema_id = put_body.get('created_schema_id')
    return created_definition_ids[0], schema_id


def create_oid4vp_exchange_template(agency_url, access_token):
    """
    Create exchange template.
    
    Args:
        agency_url: Agency URL
        access_token: Access token for authentication
        
    Returns:
        Template ID
    """
    headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': f'Bearer {access_token}'
    }
    
    template_data = {
        "name": "Identity Verification",
        "description": "Request for identity verification using mobile drivers license",
        "exchange_template": {
            "client_id_prefix": "redirect_uri",
            "request_mode": "by_value_params",
            "exchange_completed_redirect_uri": "uri://completed.redirect",
            "dcql_query": {
                "credentials": [
                    {
                        "id": "mobile_id",
                        "format": "mso_mdoc",
                        "meta": {
                            "doctype_value": "org.iso.18013.5.1.mDL"
                        },
                        "claims": [
                            {
                                "path": ["org.iso.18013.5.1", "family_name"]
                            },
                            {
                                "path": ["org.iso.18013.5.1", "given_name"]
                            },
                            {
                                "path": ["org.iso.18013.5.1", "birth_date"]
                            },
                            {
                                "path": ["org.iso.18013.5.1", "resident_address"]
                            },
                            {
                                "path": ["org.iso.18013.5.1", "resident_city"]
                            },
                            {
                                "path": ["org.iso.18013.5.1", "resident_state"]
                            },
                            {
                                "path": ["org.iso.18013.5.1", "resident_postal_code"]
                            },
                            {
                                "path": ["org.iso.18013.5.1", "resident_country"]
                            }
                        ]
                    }
                ]
            }
        }
    }
    
    response = requests.post(
        f"{agency_url}/v1.0/oidvc/vp/exchange_templates",
        headers=headers,
        json=template_data,
        verify=get_verify_option()
    )
    
    if response.status_code not in [200, 201]:
        print(f"Error creating exchange template: {response.text}")
        return None
        
    return response.json().get('id')

def create_hr_oid4vp_exchange_template(agency_url, access_token):
    """
    Create HR employment verification exchange template.
    
    Args:
        agency_url: Agency URL
        access_token: Access token for authentication
        
    Returns:
        Template ID
    """
    headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': f'Bearer {access_token}'
    }
    
    template_data = {
        "name": "HR Employment Verification",
        "description": "Request first name, surname and salary from proof of employment credential",
        "exchange_template": {
            "client_id_prefix": "redirect_uri",
            "request_mode": "by_value_params",
            "exchange_completed_redirect_uri": "uri://completed.redirect",
            "dcql_query": {
                "credentials": [
                    {
                        "id": "employment_credential",
                        "format": "mso_mdoc",
                        "meta": {
                            "doctype_value": HR_EMPLOYMENT_DOCUMENT_TYPE
                        },
                        "claims": [
                            {
                                "path": [HR_EMPLOYMENT_NAMESPACE, "given_name"]
                            },
                            {
                                "path": [HR_EMPLOYMENT_NAMESPACE, "family_name"]
                            },
                            {
                                "path": [HR_EMPLOYMENT_NAMESPACE, "annual_income"]
                            }
                        ]
                    }
                ]
            }
        }
    }
    
    response = requests.post(
        f"{agency_url}/v1.0/oidvc/vp/exchange_templates",
        headers=headers,
        json=template_data,
        verify=get_verify_option()
    )
    
    if response.status_code not in [200, 201]:
        print(f"Error creating HR exchange template: {response.text}")
        return None
        
    return response.json().get('id')

def create_isvdc_issuer_vical_url(vicalBaseUrl, issuer_agent_id) -> str:
    """
    Create ISVDC issuer VICAL URL.
    """

    return f'{vicalBaseUrl}/v1.0/diagency/trust/anchor/{issuer_agent_id}/vical'


def create_trusted_authority(agency_url, access_token, vicalUrl) -> None:
    """
    Create trusted authority.
    
    Args:
        agency_url: Agency URL
        access_token: Access token for authentication
        vicalUrl: VICAL that contains issuer trust anchor cert)
        
    """
    headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': f'Bearer {access_token}'
    }
    
    reg_payload = {
        "name": "string",
        "activated": True,
        "endpoint": vicalUrl,
        "registryType": "vical",
        "entityType": "issuer"
    }

    # Create a reference to a remote registry
    dc_remote_reg_url = f"{agency_url}/v1.0/diagency/trust/remote_providers/registries"
    response = requests.post(
        url=dc_remote_reg_url,
        headers=headers,
        json=reg_payload,
        verify=get_verify_option()
    )
    
    if response.status_code not in [200, 201]:
        print(f"Error creating trust registry: {response.text}")
        return None

    reg_resp = response.json()
    print(f"Successfully created trust registry: {reg_resp}")

    # Now pull the remote registry data
    dc_remote_reg_fetch_url = f"{dc_remote_reg_url}/{reg_resp.get('id')}/fetch"
    print(f"Fetching VICAL data from {dc_remote_reg_fetch_url}")
    response = requests.post(
        url=dc_remote_reg_fetch_url,
        headers=headers,
        verify=get_verify_option()
    )

    if response.status_code not in [200, 201]:
        print(f"Error fetch data from remote registry: {response.text}")
        return None

    reg_resp = response.json()
    print(f"Successfully fetched registry data: {reg_resp}")



def main():
    """Main function to execute the script."""
    global _DEBUG
    _DEBUG = '--debug' in sys.argv

    # Get agency URLs from environment variables (required)
    agency_url = os.environ.get('AGENCY_URL')
    vical_base_url = os.environ.get('VICAL_BASE_URL')
    oidc_token_endpoint = os.environ.get('OIDC_TOKEN_ENDPOINT')
    dmv_extra_redirect_uris = []
    
    if not agency_url or not oidc_token_endpoint:
        print("Error: AGENCY_URL and OIDC_TOKEN_ENDPOINT environment variables must be provided.")
        sys.exit(1)

    from urllib.parse import urlparse
    token_endpoint_host = urlparse(oidc_token_endpoint).hostname
    if token_endpoint_host and token_endpoint_host not in ('localhost', '127.0.0.1', 'iviadcgw'):
        dmv_extra_redirect_uris.append(f"https://{token_endpoint_host}/pkmsoidc")
        
    admin_name = os.environ.get('ADMIN_NAME', '00000000-0000-4000-8000-000000000000')
    admin_password = os.environ.get('ADMIN_PASSWORD', 'secret')
    
    # Get tenant admin access token
    print("Getting an access token...")
    admin_access_token = get_access_token(oidc_token_endpoint, admin_name, admin_password)
    
    if not admin_access_token:
        print("Error> failed to obtain an access token.")
        sys.exit(1)
    
    # Create DMV issuer agent
    dmv_agent = create_agent(agency_url, admin_access_token, "", DMV_AGENT_NAME, False, "issuer")
    if dmv_agent is None:
        print("Error> failed to create DMV agent.")
        sys.exit(1)
        
    dmv_agent_id = dmv_agent.get('id')
    dmv_agent_client_id = dmv_agent.get('client_id') or dmv_agent_id
    dmv_agent_password = dmv_agent.get('client_secret')
    dmv_agent_did = dmv_agent.get('did')
    # dmv_agent_iaca_root_cert = dmv_agent.get('profile', {}).get('issuer', {}).get('root_of_trust', {}).get('x5c', {}).get('certificate')

    # Create HR issuer agent
    hr_agent = create_agent(agency_url, admin_access_token, "", HR_AGENT_NAME, False, "issuer")
    if hr_agent is None:
        print("Error> failed to create HR agent.")
        sys.exit(1)

    hr_agent_id = hr_agent.get('id')
    hr_agent_client_id = hr_agent.get('client_id') or hr_agent_id
    hr_agent_password = hr_agent.get('client_secret')
    hr_agent_did = hr_agent.get('did')
    
    # Create Bank agent
    bank_agent = create_agent(agency_url, admin_access_token, "", BANK_AGENT_NAME, False, "verifier")
    if bank_agent is None:
        print("Error> failed to create Bank agent.")
        sys.exit(1)
        
    bank_agent_id = bank_agent.get('id')
    bank_agent_client_id = bank_agent.get('client_id') or bank_agent_id
    bank_agent_password = bank_agent.get('client_secret')
    
    # Generate a DMV access token
    print("Generating DMV access token...")
    dmv_access_token = get_access_token(oidc_token_endpoint, dmv_agent_client_id, dmv_agent_password)
    if not dmv_access_token:
        print("Error> failed to obtain DMV access token.")
        sys.exit(1)

    # Generate an HR access token
    print("Generating HR access token...")
    hr_access_token = get_access_token(oidc_token_endpoint, hr_agent_client_id, hr_agent_password)
    if not hr_access_token:
        print("Error> failed to obtain HR access token.")
        sys.exit(1)
    
    # Generate a banking access token
    print("Generating Bank access token...")
    bank_access_token = get_access_token(oidc_token_endpoint, bank_agent_client_id, bank_agent_password)
    if not bank_access_token:
        print("Error> failed to obtain Bank access token.")
        sys.exit(1)
    
    # Create DMV credential configuration
    print("Creating DMV credential configuration...")
    credential_definition_id, schema_id = create_credential_configuration(
        agency_url,
        dmv_access_token,
        build_dmv_credential_configuration(agency_url),
        definition_overrides={"key_proof_types": {"jwt": ["ES256"]}},
        schema_overrides=build_dmv_schema_overrides(os.environ.get('DMV_HOST', ''))
    )
    if not credential_definition_id:
        print("Error> failed to create DMV credential configuration.")
        sys.exit(1)
    print(f"Created DMV credential configuration with definition ID: {credential_definition_id}, schema ID: {schema_id}")

    # Create HR credential configuration
    print("Creating HR credential configuration...")
    hr_credential_definition_id, hr_schema_id = create_credential_configuration(
        agency_url,
        hr_access_token,
        build_hr_credential_configuration(agency_url)
    )
    if not hr_credential_definition_id:
        print("Error> failed to create HR credential configuration.")
        sys.exit(1)
    print(f"Created HR credential configuration with definition ID: {hr_credential_definition_id}, schema ID: {hr_schema_id}")
    
    # Create exchange template
    print("Creating exchange template...")
    template_id = create_oid4vp_exchange_template(agency_url, bank_access_token)
    if not template_id:
        print("Error> failed to create exchange template.")
        sys.exit(1)
    print(f"Created exchange template with ID: {template_id}")

    # Create HR exchange template
    print("Creating HR exchange template...")
    hr_template_id = create_hr_oid4vp_exchange_template(agency_url, bank_access_token)
    if not hr_template_id:
        print("Error> failed to create HR exchange template.")
        sys.exit(1)
    print(f"Created HR exchange template with ID: {hr_template_id}")

    # Add issuers to the verifiers trusted authorities list
    print("Adding DMV issuer to the verifiers trusted authorities...")
    dmv_issuer_vical_url: str = create_isvdc_issuer_vical_url(vical_base_url, dmv_agent_id)
    dmv_issuing_authority = create_trusted_authority(agency_url, admin_access_token, dmv_issuer_vical_url)
    dmv_issuing_authority_id = dmv_issuing_authority.get('id') if dmv_issuing_authority else None
    print(f"Created trusted DMV issuing authority with ID: {dmv_issuing_authority_id}")

    print("Adding HR issuer to the verifiers trusted authorities...")
    hr_issuer_vical_url: str = create_isvdc_issuer_vical_url(vical_base_url, hr_agent_id)
    hr_issuing_authority = create_trusted_authority(agency_url, admin_access_token, hr_issuer_vical_url)
    hr_issuing_authority_id = hr_issuing_authority.get('id') if hr_issuing_authority else None
    print(f"Created trusted HR issuing authority with ID: {hr_issuing_authority_id}")
    
    # Get application URLs from environment variables (required)
    dmv_app_url = os.environ.get('DMV_HOST')
    bank_app_url = os.environ.get('BANK_HOST')
    hr_app_url = os.environ.get('HR_HOST')
    project_name = os.environ.get('PROJECT_NAME', 'local')

    is_app_prod_deploy: bool = os.environ.get('IS_APP_PROD_DEPLOY') == 'true'
    # All deployments (local and OpenShift) serve over HTTPS, so NODE_ENV must
    # always be 'production'.  The express-session cookie is configured as
    # secure=true only when NODE_ENV !== 'development', and a non-secure cookie
    # over an HTTPS connection breaks the login flow entirely.
    node_env_value: str = 'production'

    missing_vars = []
    if not dmv_app_url:
        missing_vars.append("DMV_HOST")
    if not bank_app_url:
        missing_vars.append("BANK_HOST")
    if not hr_app_url:
        missing_vars.append("HR_HOST")
    if missing_vars:
        print(f"Error: The following required environment variables are missing: {', '.join(missing_vars)}")
        sys.exit(1)

    # ── IBM Verify bootstrap credentials ──────────────────────────────────────
    dmv_verify_base_url       = os.environ.get('DMV_IBM_VERIFY_BASE_URL', '')
    dmv_bootstrap_client_id   = os.environ.get('DMV_IBM_VERIFY_BOOTSTRAP_CLIENT_ID', '')
    dmv_bootstrap_client_secret = os.environ.get('DMV_IBM_VERIFY_BOOTSTRAP_CLIENT_SECRET', '')

    hr_verify_base_url        = os.environ.get('HR_IBM_VERIFY_BASE_URL', '')
    hr_bootstrap_client_id    = os.environ.get('HR_IBM_VERIFY_BOOTSTRAP_CLIENT_ID', '')
    hr_bootstrap_client_secret = os.environ.get('HR_IBM_VERIFY_BOOTSTRAP_CLIENT_SECRET', '')

    bank_verify_base_url      = os.environ.get('BANK_IBM_VERIFY_BASE_URL', '')
    bank_bootstrap_client_id  = os.environ.get('BANK_IBM_VERIFY_BOOTSTRAP_CLIENT_ID', '')
    bank_bootstrap_client_secret = os.environ.get('BANK_IBM_VERIFY_BOOTSTRAP_CLIENT_SECRET', '')

    missing_bootstrap = []
    if not dmv_verify_base_url:    missing_bootstrap.append("DMV_IBM_VERIFY_BASE_URL")
    if not dmv_bootstrap_client_id: missing_bootstrap.append("DMV_IBM_VERIFY_BOOTSTRAP_CLIENT_ID")
    if not dmv_bootstrap_client_secret: missing_bootstrap.append("DMV_IBM_VERIFY_BOOTSTRAP_CLIENT_SECRET")
    if not hr_verify_base_url:     missing_bootstrap.append("HR_IBM_VERIFY_BASE_URL")
    if not hr_bootstrap_client_id: missing_bootstrap.append("HR_IBM_VERIFY_BOOTSTRAP_CLIENT_ID")
    if not hr_bootstrap_client_secret: missing_bootstrap.append("HR_IBM_VERIFY_BOOTSTRAP_CLIENT_SECRET")
    if not bank_verify_base_url:   missing_bootstrap.append("BANK_IBM_VERIFY_BASE_URL")
    if not bank_bootstrap_client_id: missing_bootstrap.append("BANK_IBM_VERIFY_BOOTSTRAP_CLIENT_ID")
    if not bank_bootstrap_client_secret: missing_bootstrap.append("BANK_IBM_VERIFY_BOOTSTRAP_CLIENT_SECRET")
    if missing_bootstrap:
        print(f"Error: Missing IBM Verify bootstrap vars: {', '.join(missing_bootstrap)}")
        sys.exit(1)

    # ── Provision IBM Verify objects for all three apps ───────────────────────
    import verify_setup as vs

    app_name_label = project_name or "local"
    verify_creds_file = os.environ.get('VERIFY_CREDS_FILE', '')

    # Determine FIDO2 rpId/origin per deployment type.
    # For local deployments the HOST env vars are https://localhost:<port>;
    # for OpenShift they are https://<hostname>.
    def _rp_info(app_url: str) -> tuple:
        """Return (rp_hostname, rp_origin) for a given app URL."""
        from urllib.parse import urlparse
        parsed = urlparse(app_url)
        hostname = parsed.hostname  # no port
        origin = f"{parsed.scheme}://{parsed.hostname}"
        if parsed.port and not (parsed.scheme == "https" and parsed.port == 443):
            origin += f":{parsed.port}"
        return hostname, origin

    dmv_rp_hostname, dmv_rp_origin = _rp_info(dmv_app_url)
    bank_rp_hostname, bank_rp_origin = _rp_info(bank_app_url)
    hr_rp_hostname, hr_rp_origin = _rp_info(hr_app_url)

    # Detect whether this is a local deployment (all three apps on localhost).
    # For local deployments we create a single unified FIDO2 RP per tenant rather
    # than one RP per app.  This keeps the Verify tenant tidy and avoids the
    # three-separate-RPs model that only makes sense for production hostnames.
    _is_local = (
        not is_app_prod_deploy
        and dmv_rp_hostname == "localhost"
        and hr_rp_hostname  == "localhost"
        and bank_rp_hostname == "localhost"
    )

    bank_group_name = f"Bank Users ({app_name_label})"

    if verify_creds_file and os.path.exists(verify_creds_file):
        print(f"Loading pre-provisioned IBM Verify credentials from {verify_creds_file}...")
        with open(verify_creds_file, 'r') as f:
            verify_creds = json.load(f)
        dmv_creds = verify_creds['dmv']
        hr_creds = verify_creds['hr']
        bank_creds = verify_creds['bank']
    else:
        print("Provisioning IBM Verify objects (teardown then provision)...")
        try:
            vs.teardown_app_suite({"tenant": dmv_verify_base_url, "bootstrap_id": dmv_bootstrap_client_id,
                                   "bootstrap_secret": dmv_bootstrap_client_secret, "app_label": "DMV",
                                   "project_name": app_name_label, "is_bank": False})
            vs.teardown_app_suite({"tenant": hr_verify_base_url, "bootstrap_id": hr_bootstrap_client_id,
                                   "bootstrap_secret": hr_bootstrap_client_secret, "app_label": "HR Portal",
                                   "project_name": app_name_label, "is_bank": False})
            vs.teardown_app_suite({"tenant": bank_verify_base_url, "bootstrap_id": bank_bootstrap_client_id,
                                   "bootstrap_secret": bank_bootstrap_client_secret, "app_label": "Bank",
                                   "project_name": app_name_label, "is_bank": True, "bank_group_name": bank_group_name})

            _unified_dmv_rp_uuid: str = ""
            _unified_bank_rp_uuid: str = ""

            if _is_local:
                # ── Local deployment: unified FIDO2 RPs ──────────────────────
                # DMV tenant covers DMV + HR (HR always inherits DMV credentials).
                # Bank tenant may be the same as DMV — if so, all three apps share
                # one RP; otherwise DMV/HR share one RP and Bank gets its own.
                print("  [verify_setup] Local deployment: provisioning unified FIDO2 RPs...")

                _dmv_token = vs.get_access_token(dmv_verify_base_url, dmv_bootstrap_client_id, dmv_bootstrap_client_secret)

                _dmv_hr_origins = [dmv_rp_origin, hr_rp_origin]
                _bank_same_tenant = (bank_verify_base_url == dmv_verify_base_url)
                if _bank_same_tenant:
                    _dmv_hr_origins.append(bank_rp_origin)

                _unified_dmv_rp_uuid = vs.provision_fido2_rp(
                    dmv_verify_base_url, _dmv_token,
                    "localhost",
                    _dmv_hr_origins,
                    f"Digital Credentials demo apps (local) ({app_name_label})",
                )
                print(f"  [verify_setup] Unified DMV/HR FIDO2 RP (uuid={_unified_dmv_rp_uuid}, origins={_dmv_hr_origins})")

                if _bank_same_tenant:
                    _unified_bank_rp_uuid = _unified_dmv_rp_uuid
                else:
                    _bank_token = vs.get_access_token(bank_verify_base_url, bank_bootstrap_client_id, bank_bootstrap_client_secret)
                    _unified_bank_rp_uuid = vs.provision_fido2_rp(
                        bank_verify_base_url, _bank_token,
                        "localhost",
                        [bank_rp_origin],
                        f"Digital Credentials demo apps — Bank (local) ({app_name_label})",
                    )
                    print(f"  [verify_setup] Bank FIDO2 RP (uuid={_unified_bank_rp_uuid})")

            # Provision OIDC apps (all three paths — local and OpenShift).
            # For local, rp_hostname/rp_origin are passed but provision_app_suite
            # will create a per-app RP only on OpenShift; on local the RP UUIDs
            # are overridden below after provision_app_suite returns.
            dmv_creds = vs.provision_app_suite({
                "tenant": dmv_verify_base_url,
                "bootstrap_id": dmv_bootstrap_client_id,
                "bootstrap_secret": dmv_bootstrap_client_secret,
                "app_name": f"DMV ({app_name_label})",
                "app_url": dmv_app_url,
                "redirect_uri": f"{dmv_app_url}/logincallback",
                "logout_uri": f"{dmv_app_url}/logoutcallback",
                "rp_hostname": dmv_rp_hostname,
                "rp_origin": dmv_rp_origin,
                "is_bank": False,
                "project_name": app_name_label,
                "extra_redirect_uris": dmv_extra_redirect_uris,
                "skip_fido2_rp": _is_local,
            })

            hr_creds = vs.provision_app_suite({
                "tenant": hr_verify_base_url,
                "bootstrap_id": hr_bootstrap_client_id,
                "bootstrap_secret": hr_bootstrap_client_secret,
                "app_name": f"HR Portal ({app_name_label})",
                "app_url": hr_app_url,
                "redirect_uri": f"{hr_app_url}/logincallback",
                "logout_uri": f"{hr_app_url}/logoutcallback",
                "rp_hostname": hr_rp_hostname,
                "rp_origin": hr_rp_origin,
                "is_bank": False,
                "project_name": app_name_label,
                "skip_fido2_rp": _is_local,
            })

            bank_creds = vs.provision_app_suite({
                "tenant": bank_verify_base_url,
                "bootstrap_id": bank_bootstrap_client_id,
                "bootstrap_secret": bank_bootstrap_client_secret,
                "app_name": f"Bank ({app_name_label})",
                "app_url": bank_app_url,
                "redirect_uri": f"{bank_app_url}/logincallback",
                "logout_uri": f"{bank_app_url}/logoutcallback",
                "rp_hostname": bank_rp_hostname,
                "rp_origin": bank_rp_origin,
                "is_bank": True,
                "project_name": app_name_label,
                "bank_group_name": bank_group_name,
                "skip_fido2_rp": _is_local,
            })

            # Patch in the unified RP UUIDs for local deployments
            if _is_local:
                dmv_creds["fido2_rp_uuid"]  = _unified_dmv_rp_uuid
                hr_creds["fido2_rp_uuid"]   = _unified_dmv_rp_uuid
                bank_creds["fido2_rp_uuid"] = _unified_bank_rp_uuid

        except RuntimeError as exc:
            print(f"Error: IBM Verify provisioning failed: {exc}")
            sys.exit(1)

        print("IBM Verify provisioning complete.")

    # Derived convenience values
    dmv_redirect_url = f"{dmv_app_url}/logincallback"
    bank_redirect_url = f"{bank_app_url}/logincallback"
    hr_redirect_url = f"{hr_app_url}/logincallback"
    
    # If the account URL and token endpoint provided were for localhost, these need to be remapped to internal 
    # docker container network names within the .env file
    if agency_url == "https://localhost:8443/diagency":
        agency_url = "https://iviadcgw:8443/diagency"
    if oidc_token_endpoint == "https://localhost:8443/oauth2/token":
        oidc_token_endpoint = "https://iviadcgw:8443/oauth2/token"
    
    # Create the .env file content
    env_content = f"""# Account and token endpoints
ACCOUNT_URL={agency_url}
REACT_APP_ACCOUNT_URL={agency_url}
REACT_APP_TOKEN_ENDPOINT={oidc_token_endpoint}
NODE_ENV={node_env_value}

# DMV agent configuration
DMV_AGENT_NAME={DMV_AGENT_NAME}
DMV_AGENT_ID={dmv_agent_id}
REACT_APP_DMV_AGENT_ID={dmv_agent_id}
DMV_AGENT_CLIENT_ID={dmv_agent_client_id}
REACT_APP_DMV_AGENT_CLIENT_ID={dmv_agent_client_id}
DMV_AGENT_PASSWORD={dmv_agent_password}
REACT_APP_DMV_AGENT_PASSWORD={dmv_agent_password}
DMV_URL={dmv_app_url}
DMV_AGENT_DID={dmv_agent_did}

# Bank agent configuration
BANK_AGENT_NAME={BANK_AGENT_NAME}
BANK_AGENT_ID={bank_agent_id}
REACT_APP_BANK_AGENT_ID={bank_agent_id}
BANK_AGENT_CLIENT_ID={bank_agent_client_id}
REACT_APP_BANK_AGENT_CLIENT_ID={bank_agent_client_id}
BANK_AGENT_PASSWORD={bank_agent_password}
REACT_APP_BANK_AGENT_PASSWORD={bank_agent_password}
BANK_URL={bank_app_url}

# HR agent configuration
HR_AGENT_NAME={HR_AGENT_NAME}
HR_AGENT_ID={hr_agent_id}
REACT_APP_HR_AGENT_ID={hr_agent_id}
HR_AGENT_CLIENT_ID={hr_agent_client_id}
REACT_APP_HR_AGENT_CLIENT_ID={hr_agent_client_id}
HR_AGENT_PASSWORD={hr_agent_password}
REACT_APP_HR_AGENT_PASSWORD={hr_agent_password}
HR_URL={hr_app_url}
HR_AGENT_DID={hr_agent_did}

# IBM Verify DMV passkey configuration (provisioned)
IBM_VERIFY_BASE_URL={dmv_creds["tenant"]}
IBM_VERIFY_TOKEN_URL={dmv_creds["tenant"]}/v1.0/endpoint/default/token
IBM_VERIFY_CLIENT_ID={dmv_creds["api_client_id"]}
IBM_VERIFY_CLIENT_SECRET={dmv_creds["api_client_secret"]}
IBM_VERIFY_BANK_USERS_GROUP=
IBM_VERIFY_FIDO2_RELYING_PARTY_ID={dmv_creds["fido2_rp_uuid"]}
REACT_APP_DMV_CLIENT_ID={dmv_creds["oidc_client_id"]}
REACT_APP_DMV_CLIENT_SECRET={dmv_creds["oidc_client_secret"]}
REACT_APP_DMV_W3_ROOT={dmv_creds["tenant"]}
REACT_APP_DMV_REDIRECT_URL={dmv_redirect_url}
REACT_APP_DMV_LOGOUT_REDIRECT_URL={dmv_app_url}/logoutcallback

# IBM Verify Bank signup and FIDO2 passkey configuration (provisioned)
IBM_VERIFY_BANK_BASE_URL={bank_creds["tenant"]}
IBM_VERIFY_BANK_TOKEN_URL={bank_creds["tenant"]}/v1.0/endpoint/default/token
IBM_VERIFY_BANK_CLIENT_ID={bank_creds["api_client_id"]}
IBM_VERIFY_BANK_CLIENT_SECRET={bank_creds["api_client_secret"]}
IBM_VERIFY_BANK_USERS_GROUP={bank_creds["bank_group_name"]}
IBM_VERIFY_BANK_FIDO2_RELYING_PARTY_ID={bank_creds["fido2_rp_uuid"]}
REACT_APP_BANK_CLIENT_ID={bank_creds["oidc_client_id"]}
REACT_APP_BANK_CLIENT_SECRET={bank_creds["oidc_client_secret"]}
REACT_APP_BANK_W3_ROOT={bank_creds["tenant"]}
REACT_APP_BANK_REDIRECT_URL={bank_redirect_url}
REACT_APP_BANK_LOGOUT_REDIRECT_URL={bank_app_url}/logoutcallback

# IBM Verify HR passkey configuration (provisioned)
IBM_VERIFY_HR_BASE_URL={hr_creds["tenant"]}
IBM_VERIFY_HR_TOKEN_URL={hr_creds["tenant"]}/v1.0/endpoint/default/token
IBM_VERIFY_HR_CLIENT_ID={hr_creds["api_client_id"]}
IBM_VERIFY_HR_CLIENT_SECRET={hr_creds["api_client_secret"]}
IBM_VERIFY_HR_FIDO2_RELYING_PARTY_ID={hr_creds["fido2_rp_uuid"]}
REACT_APP_HR_CLIENT_ID={hr_creds["oidc_client_id"]}
REACT_APP_HR_CLIENT_SECRET={hr_creds["oidc_client_secret"]}
REACT_APP_HR_W3_ROOT={hr_creds["tenant"]}
REACT_APP_HR_REDIRECT_URL={hr_redirect_url}
REACT_APP_HR_LOGOUT_REDIRECT_URL={hr_app_url}/logoutcallback

# Credential configuration
CREDENTIAL_SCHEMA_ID={schema_id}
REACT_APP_CREDENTIAL_SCHEMA_ID={schema_id}
CREDENTIAL_DEFINITION_ID={credential_definition_id}
REACT_APP_CREDENTIAL_DEFINITION_ID={credential_definition_id}
HR_CREDENTIAL_SCHEMA_ID={hr_schema_id}
REACT_APP_HR_CREDENTIAL_SCHEMA_ID={hr_schema_id}
HR_CREDENTIAL_DEFINITION_ID={hr_credential_definition_id}
REACT_APP_HR_CREDENTIAL_DEFINITION_ID={hr_credential_definition_id}
EXCHANGE_TEMPLATE_ID={template_id}
REACT_APP_EXCHANGE_TEMPLATE_ID={template_id}
HR_EXCHANGE_TEMPLATE_ID={hr_template_id}
REACT_APP_HR_EXCHANGE_TEMPLATE_ID={hr_template_id}

"""
    
    # Write the combined .env file (retained for backwards compatibility)
    with open('.env', 'w') as f:
        f.write(env_content)

    # Write per-app env files (each with only that app's keys + provisioned IBM Verify credentials)
    bank_env_content = f"""# Account and token endpoints
ACCOUNT_URL={agency_url}
REACT_APP_ACCOUNT_URL={agency_url}
REACT_APP_TOKEN_ENDPOINT={oidc_token_endpoint}
NODE_ENV={node_env_value}

# Bank agent configuration
BANK_AGENT_NAME={BANK_AGENT_NAME}
BANK_AGENT_ID={bank_agent_id}
REACT_APP_BANK_AGENT_ID={bank_agent_id}
BANK_AGENT_CLIENT_ID={bank_agent_client_id}
REACT_APP_BANK_AGENT_CLIENT_ID={bank_agent_client_id}
BANK_AGENT_PASSWORD={bank_agent_password}
REACT_APP_BANK_AGENT_PASSWORD={bank_agent_password}

# Authentication configuration Bank (provisioned OIDC app)
REACT_APP_BANK_CLIENT_ID={bank_creds["oidc_client_id"]}
REACT_APP_BANK_CLIENT_SECRET={bank_creds["oidc_client_secret"]}
REACT_APP_BANK_W3_ROOT={bank_creds["tenant"]}
REACT_APP_BANK_REDIRECT_URL={bank_redirect_url}
REACT_APP_BANK_LOGOUT_REDIRECT_URL={bank_app_url}/logoutcallback

# Exchange template configuration
EXCHANGE_TEMPLATE_ID={template_id}
REACT_APP_EXCHANGE_TEMPLATE_ID={template_id}
HR_EXCHANGE_TEMPLATE_ID={hr_template_id}
REACT_APP_HR_EXCHANGE_TEMPLATE_ID={hr_template_id}

# IBM Verify Bank signup and FIDO2 passkey configuration (provisioned)
IBM_VERIFY_BASE_URL={bank_creds["tenant"]}
IBM_VERIFY_TOKEN_URL={bank_creds["tenant"]}/v1.0/endpoint/default/token
IBM_VERIFY_CLIENT_ID={bank_creds["api_client_id"]}
IBM_VERIFY_CLIENT_SECRET={bank_creds["api_client_secret"]}
IBM_VERIFY_BANK_USERS_GROUP={bank_creds["bank_group_name"]}
IBM_VERIFY_FIDO2_RELYING_PARTY_ID={bank_creds["fido2_rp_uuid"]}
PROJECT_NAME={project_name}
"""

    dmv_env_content = f"""# Account and token endpoints
ACCOUNT_URL={agency_url}
REACT_APP_ACCOUNT_URL={agency_url}
REACT_APP_TOKEN_ENDPOINT={oidc_token_endpoint}
NODE_ENV={node_env_value}

# DMV agent configuration
DMV_AGENT_NAME={DMV_AGENT_NAME}
DMV_AGENT_ID={dmv_agent_id}
REACT_APP_DMV_AGENT_ID={dmv_agent_id}
DMV_AGENT_CLIENT_ID={dmv_agent_client_id}
REACT_APP_DMV_AGENT_CLIENT_ID={dmv_agent_client_id}
DMV_AGENT_PASSWORD={dmv_agent_password}
REACT_APP_DMV_AGENT_PASSWORD={dmv_agent_password}
DMV_AGENT_DID={dmv_agent_did}

# Authentication configuration DMV (provisioned OIDC app)
REACT_APP_DMV_CLIENT_ID={dmv_creds["oidc_client_id"]}
REACT_APP_DMV_CLIENT_SECRET={dmv_creds["oidc_client_secret"]}
REACT_APP_DMV_W3_ROOT={dmv_creds["tenant"]}
REACT_APP_DMV_REDIRECT_URL={dmv_redirect_url}
REACT_APP_DMV_LOGOUT_REDIRECT_URL={dmv_app_url}/logoutcallback

# Credential configuration
CREDENTIAL_SCHEMA_ID={schema_id}
REACT_APP_CREDENTIAL_SCHEMA_ID={schema_id}
CREDENTIAL_DEFINITION_ID={credential_definition_id}
REACT_APP_CREDENTIAL_DEFINITION_ID={credential_definition_id}

# IBM Verify FIDO2 passkey configuration (provisioned)
IBM_VERIFY_BASE_URL={dmv_creds["tenant"]}
IBM_VERIFY_TOKEN_URL={dmv_creds["tenant"]}/v1.0/endpoint/default/token
IBM_VERIFY_CLIENT_ID={dmv_creds["api_client_id"]}
IBM_VERIFY_CLIENT_SECRET={dmv_creds["api_client_secret"]}
IBM_VERIFY_BANK_USERS_GROUP=
IBM_VERIFY_FIDO2_RELYING_PARTY_ID={dmv_creds["fido2_rp_uuid"]}
"""

    hr_env_content = f"""# Account and token endpoints
REACT_APP_ACCOUNT_URL={agency_url}
REACT_APP_TOKEN_ENDPOINT={oidc_token_endpoint}
NODE_ENV={node_env_value}

# HR agent configuration
HR_AGENT_NAME={HR_AGENT_NAME}
HR_AGENT_ID={hr_agent_id}
REACT_APP_HR_AGENT_ID={hr_agent_id}
HR_AGENT_CLIENT_ID={hr_agent_client_id}
REACT_APP_HR_AGENT_CLIENT_ID={hr_agent_client_id}
HR_AGENT_PASSWORD={hr_agent_password}
REACT_APP_HR_AGENT_PASSWORD={hr_agent_password}
HR_AGENT_DID={hr_agent_did}

# Authentication configuration HR (provisioned OIDC app)
REACT_APP_HR_CLIENT_ID={hr_creds["oidc_client_id"]}
REACT_APP_HR_CLIENT_SECRET={hr_creds["oidc_client_secret"]}
REACT_APP_HR_W3_ROOT={hr_creds["tenant"]}
REACT_APP_HR_REDIRECT_URL={hr_redirect_url}
REACT_APP_HR_LOGOUT_REDIRECT_URL={hr_app_url}/logoutcallback

# Credential configuration
HR_CREDENTIAL_SCHEMA_ID={hr_schema_id}
REACT_APP_HR_CREDENTIAL_SCHEMA_ID={hr_schema_id}
HR_CREDENTIAL_DEFINITION_ID={hr_credential_definition_id}
REACT_APP_HR_CREDENTIAL_DEFINITION_ID={hr_credential_definition_id}

# IBM Verify FIDO2 passkey configuration (provisioned)
IBM_VERIFY_BASE_URL={hr_creds["tenant"]}
IBM_VERIFY_TOKEN_URL={hr_creds["tenant"]}/v1.0/endpoint/default/token
IBM_VERIFY_CLIENT_ID={hr_creds["api_client_id"]}
IBM_VERIFY_CLIENT_SECRET={hr_creds["api_client_secret"]}
IBM_VERIFY_BANK_USERS_GROUP=
IBM_VERIFY_FIDO2_RELYING_PARTY_ID={hr_creds["fido2_rp_uuid"]}
"""

    with open('.env.bank', 'w') as f:
        f.write(bank_env_content)

    with open('.env.dmv', 'w') as f:
        f.write(dmv_env_content)

    with open('.env.hr', 'w') as f:
        f.write(hr_env_content)

    print("\n" + open('.env').read())

if __name__ == "__main__":
    main()
