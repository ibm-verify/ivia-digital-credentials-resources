#!/bin/sh

#
# These functions are used to help manually run commands against a DC deployment.
#

# ADD YOUR OWN VALUES BELOW AND UNCOMMENT RELEVANT COMMANDS


###############################################################################
# If we are using Kubernetes we can get the hostnames from the route
# definition.

source .env

get_host()
{
    host=`kubectl get route $1 -o json | jq '.spec.host' | sed "s|\"||g"`

    if [ -z "$host" ] ; then
        echo "Error> could not determine a required host.  Set the $2" 1>&2
        echo "       environment variable." 1>&2

        exit 1
    fi

    echo "$host"
}

###############################################################################
# Variables.

if [ "$KUBERNETES" = "1" ] ; then
    route=iviadcgw

    if [ -z "$host" ] ; then
        host=`get_host $route "host"`
    fi

    AGENCY_URL=https://$host/diagency
    OIDC_TOKEN_ENDPOINT=https://$host/oauth2/token
else
    if [ -z "$AGENCY_URL" ] ; then
        AGENCY_URL=https://iviadcgw:8443/diagency
    fi

    if [ -z "$OIDC_TOKEN_ENDPOINT" ] ; then
        OIDC_TOKEN_ENDPOINT=https://iviadcgw:8443/oauth2/token
    fi
fi

if [ -z "$ADMIN_NAME" ] ; then
    ADMIN_NAME=00000000-0000-4000-8000-000000000000
fi

if [ -z "$ADMIN_PASSWORD" ] ; then
    ADMIN_PASSWORD=secret
fi

if [ -z "$HOLDER_AGENT_ID" ] ; then
    HOLDER_AGENT_ID=user_1
fi

if [ -z "$HOLDER_AGENT_NAME" ] ; then
    HOLDER_AGENT_NAME=user_1
fi

if [ -z "$HOLDER_AGENT_PASSWORD" ] ; then
    HOLDER_AGENT_PASSWORD=secret
fi

###############################################################################
# Retrieve an access token.

get_access_token() {
    local access_token=$(curl --silent --insecure \
        --location "$1" \
        --header 'Accept: application/json' \
        --header 'Content-Type: application/x-www-form-urlencoded' \
        --data-urlencode "client_id=$2" \
        --data-urlencode "client_secret=$3" \
        --data-urlencode 'grant_type=client_credentials' \
            | jq -r .access_token | sed 's|"||g')
    echo "$access_token"
}

###############################################################################
# Get an access token using ROPC authentication.

get_ropc_token() {
    local access_token=$(curl --silent --insecure \
        --location "$1" \
        --header 'Accept: application/json' \
        --header 'Content-Type: application/x-www-form-urlencoded' \
        --data-urlencode "client_id=onpremise_vcholders" \
        --data-urlencode "username=$2" \
        --data-urlencode "password=$3" \
        --data-urlencode 'grant_type=password' \
        --data-urlencode 'scope=openid' | jq -r .access_token)
    echo "$access_token"
}

###############################################################################
# Create an invitation from the holder access token.
create_invitation_from_holder() {
    echo "Creating the invitation from the holder token." >&2

    local invitation=$(curl --silent --insecure \
        --location "$1/v1.0/diagency/invitations" \
        --header 'Content-Type: application/json' \
        --header 'Accept: application/json' \
        --header "Authorization: Bearer $2" \
        --request "POST" \
        --data "{\"direct_route\": true,\"type\": \"connection\"}" | jq -r .short_url | sed 's|"||g')
    echo "$invitation"
}

###############################################################################
# Create an invitation from the issuer access token.
create_invitation_from_issuer() {
    echo "Creating the invitation from the issuer token." >&2

    local invitation=$(curl --silent --insecure \
        --location "$1/v1.0/diagency/invitations" \
        --header 'Content-Type: application/json' \
        --header 'Accept: application/json' \
        --header "Authorization: Bearer $2" \
        --request "POST" \
        --data "{\"direct_route\": true,\"type\": \"oob\",\"attach\": {\"recipient\": \"invitee\",\"use_connection\": true,\"cred_offer\": {\"cred_def_id\": \"$3\",\"attributes\": {\"credential\": {\"id\": \"https://issuer.verify.ibm.com/credentials/1732680480100\",\"type\": [\"VerifiableCredential\",\"PermanentResidentCard\"],\"credentialSubject\": {\"type\": [\"Person\",\"PermanentResident\"],\"id\": \"did:example:b34ca6cd37bbf23\",\"birthCountry\": \"Australia\",\"familyName\": \"Breton\",\"givenName\": \"Jessica\"}}}}}}")
    echo "$invitation">&2
    echo "$invitation"
}

###############################################################################
# Create an invitation from the issuer access token for verification
create_invitation_from_issuer_for_verification() {
    echo "Creating the invitation from the issuer token for verification." >&2

    local invitation=$(curl --silent --insecure \
        --location "$1/v1.0/diagency/invitations" \
        --header 'Content-Type: application/json' \
        --header 'Accept: application/json' \
        --header "Authorization: Bearer $2" \
        --request "POST" \
        --data "{\"direct_route\":true,\"type\":\"oob\",\"max_acceptances\":1,\"attach\":{\"recipient\":\"invitee\",\"use_connection\":true,\"verification_request\":{\"state\":\"outbound_proof_request\",\"properties\":{},\"proof_request\":{\"name\":\"DMV Login Request\",\"version\":\"4.21747960873285\",\"mso_mdoc\":{\"presentation_definition\":{\"id\":\"b9c6eced-ec47-45e1-80dd-b4125f6fdad4\",\"input_descriptors\":[{\"id\":\"org.iso.18013.5.1.mDL\",\"format\":{\"mso_mdoc\":{\"alg\":[\"EdDSA\",\"ES256\"]}},\"name\":\"Mobile Driver's License\",\"purpose\":\"Validate the drivers license document number\",\"constraints\":{\"limit_disclosure\":\"required\",\"fields\":[{\"path\":[\"\$['org.iso.18013.5.1']['document_number']\"],\"intent_to_retain\":false}]}}]}}},\"store_presentation\":true}}}")
    echo "$invitation">&2
    echo "$invitation"
}

###############################################################################
# Create an invitation from the issuer access token for verification
create_invitation_for_verification_with_multiple_credentials() {
    echo "Creating the invitation for verification with multiple credentials." >&2

    local invitation=$(curl --insecure \
        --location "$1/v1.0/diagency/invitations" \
        --header 'Content-Type: application/json' \
        --header 'Accept: application/json' \
        --header "Authorization: Bearer $2" \
        --request "POST" \
        --data "{\"direct_route\":true,\"type\":\"oob\",\"max_acceptances\":1,\"attach\":{\"recipient\":\"invitee\",\"use_connection\":true,\"verification_request\":{\"state\":\"outbound_proof_request\",\"properties\":{},\"proof_request\":{\"name\":\"Verify Employment\",\"version\":\"1.0\",\"mso_mdoc\":{\"presentation_definition\":{\"id\":\"\",\"input_descriptors\":[{\"id\":\"org.iso.18013.5.1.mDL\",\"format\":{\"mso_mdoc\":{\"alg\":[\"EdDSA\",\"ES256\"]}},\"name\":\"Mobile Driver's License\",\"purpose\":\"Validate the drivers license document number\",\"constraints\":{\"limit_disclosure\":\"required\",\"fields\":[{\"path\":[\"\$['org.iso.18013.5.1']['document_number']\"],\"intent_to_retain\":false}]}},{\"id\":\"com.myhr.example.employee\",\"format\":{\"mso_mdoc\":{\"alg\":[\"EdDSA\",\"ES256\"]}},\"name\":\"Employee card social security number\",\"purpose\":\"Validate the employee's social security number\",\"constraints\":{\"limit_disclosure\":\"required\",\"fields\":[{\"path\":[\"\$['com.myhr.example.employee']['document_number']\"],\"intent_to_retain\":false}]}}]}}},\"store_presentation\":true}}}")
    echo "$invitation">&2
    echo "$invitation"
}

###############################################################################
# Accept a verification
accept_verification() {
    echo "Accepting a verification" >&2

    local verification=$(curl --silent --insecure \
        --location "$1/v1.0/diagency/verifications/$3" \
        --header 'Content-Type: application/json' \
        --header 'Accept: application/json' \
        --header "Authorization: Bearer $2" \
        --request "PATCH" \
        --data "{\"state\": \"proof_shared\"}")
    echo "$verification">&2
    echo "$verification"
}

###############################################################################
# List connections
list_connections() {
    echo "Listing connections." >&2

    local connections=$(curl --silent --insecure \
        --location "$1/v1.0/diagency/connections?filter={"$or":[{"state":"inbound_request"},{"state":"outbound_offer"},{"state":"inbound_offer"}]}&include=id,state,timestamps.updated" \
        --header 'Content-Type: application/json' \
        --header 'Accept: application/json' \
        --header "Authorization: Bearer $2")
    echo "$connections"
}

###############################################################################
# List verifications
list_verifications() {
    echo "Listing verifications." >&2

    local connections=$(curl --silent --insecure \
        --location "$1/v1.0/diagency/verifications" \
        --header 'Content-Type: application/json' \
        --header 'Accept: application/json' \
        --header "Authorization: Bearer $2")
    echo "$connections"
}

###############################################################################
# List credentials
list_credentials() {
    local connections=$(curl --silent --insecure \
        --location "$1/v1.0/diagency/credentials" \
        --header 'Content-Type: application/json' \
        --header 'Accept: application/json' \
        --header "Authorization: Bearer $2")
    echo "$connections"
}

###############################################################################
# Get credential
get_credential() {
    local connections=$(curl --silent --insecure \
        --location "$1/v1.0/diagency/credentials?filter={"$or":[{"id":"$3"}]}" \
        --header 'Content-Type: application/json' \
        --header 'Accept: application/json' \
        --header "Authorization: Bearer $2")
    echo "$connections"
}

###############################################################################
# Get credential schema
get_credential_schema() {
    local schema=$(curl --silent --insecure \
        --location "$1/v1.0/diagency/credential_schemas/$3" \
        --header 'Content-Type: application/json' \
        --header 'Accept: application/json' \
        --header "Authorization: Bearer $2")
    echo "$schema"
}

###############################################################################
# Get credential definitions
get_credential_definitions() {
    local definition=$(curl --silent --insecure \
        --location "$1/v2.0/diagency/credential_definitions" \
        --header 'Content-Type: application/json' \
        --header 'Accept: application/json' \
        --header "Authorization: Bearer $2")
    echo "$definition"
}

###############################################################################
# Get credential definition
get_credential_definition() {
    local definition=$(curl --silent --insecure \
        --location "$1/v2.0/diagency/credential_definitions/$3" \
        --header 'Content-Type: application/json' \
        --header 'Accept: application/json' \
        --header "Authorization: Bearer $2")
    echo "$definition"
}

###############################################################################
# List agents
list_agents() {
    echo "Listing agents." >&2

    local agents=$(curl --silent --insecure \
        --location "$1/v1.0/diagency/agents" \
        --header 'Content-Type: application/json' \
        --header 'Accept: application/json' \
        --header "Authorization: Bearer $2")
    echo "$agents"
}

###############################################################################
# Get agent
get_agent() {
    local agent=$(curl --silent --insecure \
        --location "$1/v1.0/diagency/agents/$3" \
        --header 'Content-Type: application/json' \
        --header 'Accept: application/json' \
        --header "Authorization: Bearer $2")
    echo "$agent"
}

###############################################################################
# Accept credentials
accept_credential() {
    echo "Accepting credential." >&2

    local connections=$(curl --silent --insecure \
        --location "$1/v1.0/diagency/credentials/$3" \
        --header 'Content-Type: application/json' \
        --header 'Accept: application/json' \
        --header "Authorization: Bearer $2" \
        --request "PATCH" \
        --data "{\"state\": \"accepted\"}"
    )
    echo "$connections"
}

###############################################################################
# Create credential schema
create_oid4vci_credential_schema() {
    local schema_id=$(curl --silent --insecure \
        --location "$1/v2.0/diagency/credential_schemas" \
        --header 'Content-Type: application/json' \
        --header 'Accept: application/json' \
        --header "Authorization: Bearer $2" \
        --request "POST" \
        --data '{"name":"oidschema", "version":"1.0", "schema": {"$schema":"https://json-schema.org/draft/2020-12/schema","$linkedData":{"identifier":"org.iso.18013.5.1.mDL","@id":"https://iso.org/schemas/mdl","@vocab":"https://iso.org/schemas/mdl","@type":"org.iso.18013.5.1.mDL"},"$oid4vc":{"display":[{"name":"Mobile Drivers Licence","locale":"en"}]},"type":"object","properties":{"org.iso.18013.5.1":{"$linkedData":{"identifier":"org.iso.18013.5.1","@id":"https://iso.org/schemas/mdl/org.iso.18013.5.1"},"type":"object","properties":{"@context":{"type":"array"},"given_name":{"$linkedData":{"identifier":"given_name","@id":"https://iso.org/schemas/mdl/org.iso.18013.5.1/given_name"},"$oid4vc":{"display":[{"name":"Given name","locale":"en"}]},"type":"string"},"family_name":{"$linkedData":{"identifier":"family_name","@id":"https://iso.org/schemas/mdl/org.iso.18013.5.1/family_name"},"$oid4vc":{"display":[{"name":"Family name","locale":"en"}]},"type":"string"},"birth_date":{"$linkedData":{"identifier":"birth_date","@id":"https://iso.org/schemas/mdl/org.iso.18013.5.1/birth_date"},"$oid4vc":{"display":[{"name":"Date of birth","locale":"en"}]},"type":"string","format":"date"},"issue_date":{"$linkedData":{"identifier":"issue_date","@id":"https://iso.org/schemas/mdl/org.iso.18013.5.1/issue_date"},"$oid4vc":{"display":[{"name":"Date of issue","locale":"en"}]},"type":"string","format":"date"},"expiry_date":{"$linkedData":{"identifier":"expiry_date","@id":"https://iso.org/schemas/mdl/org.iso.18013.5.1/expiry_date"},"$oid4vc":{"display":[{"name":"Date of expiry","locale":"en"}]},"type":"string","format":"date"},"issuing_country":{"$linkedData":{"identifier":"issuing_country","@id":"https://iso.org/schemas/mdl/org.iso.18013.5.1/issuing_country"},"$oid4vc":{"display":[{"name":"Issuing country","locale":"en"}]},"type":"string"},"issuing_authority":{"$linkedData":{"identifier":"issuing_authority","@id":"https://iso.org/schemas/mdl/org.iso.18013.5.1/issuing_authority"},"$oid4vc":{"display":[{"name":"Issuing authority","locale":"en"}]},"type":"string"},"document_number":{"$linkedData":{"identifier":"document_number","@id":"https://iso.org/schemas/mdl/org.iso.18013.5.1/document_number"},"$oid4vc":{"display":[{"name":"Licence number","locale":"en"}]},"type":"string"},"portrait":{"$linkedData":{"identifier":"portrait","@id":"https://iso.org/schemas/mdl/org.iso.18013.5.1/portrait"},"$oid4vc":{"display":[{"name":"Portrait of holder","locale":"en"}]},"type":"string"},"driving_privileges":{"$linkedData":{"identifier":"driving_privileges","@id":"https://iso.org/schemas/mdl/org.iso.18013.5.1/driving_privileges"},"$oid4vc":{"display":[{"name":"Categories of holder vehicles/restrictions/conditions","locale":"en"}]},"type":"array"},"un_distinguishing_sign":{"$linkedData":{"identifier":"un_distinguishing_sign","@id":"https://iso.org/schemas/mdl/org.iso.18013.5.1/un_distinguishing_sign"},"$oid4vc":{"display":[{"name":"UN distinguishing sign","locale":"en"}]},"type":"string"},"administrative_number":{"$linkedData":{"identifier":"administrative_number","@id":"https://iso.org/schemas/mdl/org.iso.18013.5.1/administrative_number"},"$oid4vc":{"display":[{"name":"Administrative number","locale":"en"}]},"type":"string"},"sex":{"$linkedData":{"identifier":"sex","@id":"https://iso.org/schemas/mdl/org.iso.18013.5.1/sex"},"$oid4vc":{"display":[{"name":"Sex","locale":"en"}]},"type":"integer"},"height":{"$linkedData":{"identifier":"height","@id":"https://iso.org/schemas/mdl/org.iso.18013.5.1/height"},"$oid4vc":{"display":[{"name":"Height (cm)","locale":"en"}]},"type":"integer"},"weight":{"$linkedData":{"identifier":"weight","@id":"https://iso.org/schemas/mdl/org.iso.18013.5.1/weight"},"$oid4vc":{"display":[{"name":"Weight (kg)","locale":"en"}]},"type":"integer"},"eye_colour":{"$linkedData":{"identifier":"eye_colour","@id":"https://iso.org/schemas/mdl/org.iso.18013.5.1/eye_colour"},"$oid4vc":{"display":[{"name":"Eye colour","locale":"en"}]},"type":"string"},"hair_colour":{"$linkedData":{"identifier":"hair_colour","@id":"https://iso.org/schemas/mdl/org.iso.18013.5.1/hair_colour"},"$oid4vc":{"display":[{"name":"Hair colour","locale":"en"}]},"type":"string"},"birth_place":{"$linkedData":{"identifier":"birth_place","@id":"https://iso.org/schemas/mdl/org.iso.18013.5.1/birth_place"},"$oid4vc":{"display":[{"name":"Place of birth","locale":"en"}]},"type":"string"},"resident_address":{"$linkedData":{"identifier":"resident_address","@id":"https://iso.org/schemas/mdl/org.iso.18013.5.1/resident_address"},"$oid4vc":{"display":[{"name":"Permanent place of residence","locale":"en"}]},"type":"string"},"portrait_capture_date":{"$linkedData":{"identifier":"portrait_capture_date","@id":"https://iso.org/schemas/mdl/org.iso.18013.5.1/portrait_capture_date"},"$oid4vc":{"display":[{"name":"Portrait image timestamp","locale":"en"}]},"type":"string","format":"date"},"age_in_years":{"$linkedData":{"identifier":"age_in_years","@id":"https://iso.org/schemas/mdl/org.iso.18013.5.1/age_in_years"},"$oid4vc":{"display":[{"name":"Age in years","locale":"en"}]},"type":"integer"},"age_birth_year":{"$linkedData":{"identifier":"age_birth_year","@id":"https://iso.org/schemas/mdl/org.iso.18013.5.1/age_birth_year"},"$oid4vc":{"display":[{"name":"Birth year","locale":"en"}]},"type":"integer"},"age_over_18":{"$linkedData":{"identifier":"age_over_18","@id":"https://iso.org/schemas/mdl/org.iso.18013.5.1/age_over_18"},"$oid4vc":{"display":[{"name":"Is age over 18?","locale":"en"}]},"type":"boolean"},"age_over_21":{"$linkedData":{"identifier":"age_over_21","@id":"https://iso.org/schemas/mdl/org.iso.18013.5.1/age_over_21"},"$oid4vc":{"display":[{"name":"Is age over 21?","locale":"en"}]},"type":"boolean"},"age_over_65":{"$linkedData":{"identifier":"age_over_65","@id":"https://iso.org/schemas/mdl/org.iso.18013.5.1/age_over_65"},"$oid4vc":{"display":[{"name":"Is age over 65?","locale":"en"}]},"type":"boolean"},"issuing_jurisdiction":{"$linkedData":{"identifier":"issuing_jurisdiction","@id":"https://iso.org/schemas/mdl/org.iso.18013.5.1/issuing_jurisdiction"},"$oid4vc":{"display":[{"name":"Issuing jurisdiction","locale":"en"}]},"type":"string"},"nationality":{"$linkedData":{"identifier":"nationality","@id":"https://iso.org/schemas/mdl/org.iso.18013.5.1/nationality"},"$oid4vc":{"display":[{"name":"Nationality","locale":"en"}]},"type":"string"},"resident_city":{"$linkedData":{"identifier":"resident_city","@id":"https://iso.org/schemas/mdl/org.iso.18013.5.1/resident_city"},"$oid4vc":{"display":[{"name":"Resident city","locale":"en"}]},"type":"string"},"resident_state":{"$linkedData":{"identifier":"resident_state","@id":"https://iso.org/schemas/mdl/org.iso.18013.5.1/resident_state"},"$oid4vc":{"display":[{"name":"Resident state/province/district","locale":"en"}]},"type":"string"},"resident_postal_code":{"$linkedData":{"identifier":"resident_postal_code","@id":"https://iso.org/schemas/mdl/org.iso.18013.5.1/resident_postal_code"},"$oid4vc":{"display":[{"name":"Resident postal code","locale":"en"}]},"type":"string"},"resident_country":{"$linkedData":{"identifier":"resident_country","@id":"https://iso.org/schemas/mdl/org.iso.18013.5.1/resident_country"},"$oid4vc":{"display":[{"name":"Resident country","locale":"en"}]},"type":"string"},"biometric_template_face":{"$linkedData":{"identifier":"biometric_template_face","@id":"https://iso.org/schemas/mdl/org.iso.18013.5.1/biometric_template_face"},"$oid4vc":{"display":[{"name":"Biometric template face","locale":"en"}]},"type":"string"},"biometric_template_signature_sign":{"$linkedData":{"identifier":"biometric_template_signature_sign","@id":"https://iso.org/schemas/mdl/org.iso.18013.5.1/biometric_template_signature_sign"},"$oid4vc":{"display":[{"name":"Biometric template signature/sign","locale":"en"}]},"type":"string"},"family_name_national_character":{"$linkedData":{"identifier":"family_name_national_character","@id":"https://iso.org/schemas/mdl/org.iso.18013.5.1/family_name_national_character"},"$oid4vc":{"display":[{"name":"Family name in national characters","locale":"en"}]},"type":"string"},"given_name_national_character":{"$linkedData":{"identifier":"given_name_national_character","@id":"https://iso.org/schemas/mdl/org.iso.18013.5.1/given_name_national_character"},"$oid4vc":{"display":[{"name":"Given name in national characters","locale":"en"}]},"type":"string"},"signature_usual_mark":{"$linkedData":{"identifier":"signature_usual_mark","@id":"https://iso.org/schemas/mdl/org.iso.18013.5.1/signature_usual_mark"},"$oid4vc":{"display":[{"name":"Signature/usual mark","locale":"en"}]},"type":"string"}},"required":["family_name","given_name","birth_date","issue_date","expiry_date","issuing_country","issuing_authority","document_number","portrait","driving_privileges","un_distinguishing_sign"],"additionalProperties":false}},"required":["org.iso.18013.5.1"],"additionalProperties":false}}' \
        | jq -r .id | sed 's|"||g'
    )
    echo "$schema_id"
}

###############################################################################
# Create credential definition
create_oid4vci_credential_definition() {
    local credential_definition_id=$(curl --silent --insecure \
        --location "$1/v2.0/diagency/credential_definitions" \
        --header 'Content-Type: application/json' \
        --header 'Accept: application/json' \
        --header "Authorization: Bearer $2" \
        --request "POST" \
        --data "{\"schema_id\": \"$3\", \"credential_document_type\": [ \"org.iso.18013.5.1.mDL\" ], \"credential_format\": \"mso_mdoc\", \"credential_signing_algorithm\": \"ESP256\", \"cryptographic_binding_methods\": [\"cose_key\"], \"key_proof_types\": {\"jwt\": [\"ES256\"]} }" \
        | jq -r .id | sed 's|"||g'
    )
    echo "$credential_definition_id"
}

###############################################################################
# Create OID4VCI offer
create_oid4vci_offer() {
    local offer_id=$(curl --silent --insecure \
        --location "$1/v1.0/oidvc/vci/offers" \
        --header 'Content-Type: application/json' \
        --header 'Accept: application/json' \
        --header "Authorization: Bearer $2" \
        --request "POST" \
        --data "{\"credential_configuration_ids\": [\"$3\"], \"credential_data\": {\"org.iso.18013.5.1:family_name\":\"Smith\",\"org.iso.18013.5.1:given_name\":\"John\",\"org.iso.18013.5.1:birth_date\":\"1980-01-01\",\"org.iso.18013.5.1:issue_date\":\"2024-01-01\",\"org.iso.18013.5.1:expiry_date\":\"2029-01-01\",\"org.iso.18013.5.1:issuing_country\":\"US\",\"org.iso.18013.5.1:issuing_authority\":\"Department of Motor Vehicles\",\"org.iso.18013.5.1:document_number\":\"123456789\",\"org.iso.18013.5.1:driving_privileges\":[{\"vehicle_category_code\":\"A\",\"issue_date\":\"2024-01-01\",\"expiry_date\":\"2029-01-01\"}],\"org.iso.18013.5.1:un_distinguishing_sign\":\"US\"} }" \
        | jq -r .id | sed 's|"||g'
    )
    echo "$offer_id"
}

###############################################################################
# Get OID4VCI offers
get_oid4vci_offers() {
    local apiEndpoint='/v1.0/oidvc/vci/offers%3Ffilter%3D%7B%22state%22%3A%22OfferCreated%22%7D'
    local offers=$(curl --insecure \
        --location "$1$apiEndpoint" \
        --header 'Accept: application/json' \
        --header "Authorization: Bearer $2" \
        --request "GET" 
    )
    echo "$offers"
}

###############################################################################
# Get OID4VCI offer
get_oid4vci_offer() {
    $(curl --silent --insecure -o offer_image.png \
        --location "$1/v1.0/oidvc/vci/offers/$3" \
        --header 'Accept: image/png' \
        --header "Authorization: Bearer $2" \
        --request "GET" 
    )
}

###############################################################################
# Get trusted issuing authorities
get_trusted_issuing_authorities() {
    local authorities=$(curl --silent --insecure \
        --location "$1/v1.0/diagency/trusted_issuing_authorities" \
        --header "Authorization: Bearer $2" \
        --request "GET" 
    )
    echo "$authorities"
}

###############################################################################
# Create trusted issuing authority
create_trusted_issuing_authority() {
    local authority_id=$(curl --silent --insecure \
        --location "$1/v1.0/diagency/trusted_issuing_authorities" \
        --header 'Content-Type: application/json' \
        --header 'Accept: application/json' \
        --header "Authorization: Bearer $2" \
        --request "POST" \
        --data "{\"credential_document_type\": \"org.iso.18013.5.1.mDL\",\"certificate\": \"$3\"}" \
        | jq -r .id | sed 's|"||g'
    )
    echo "$authority_id"
}


# Get access token
# echo "Getting an access token..."
# access_token=$(get_access_token "$OIDC_TOKEN_ENDPOINT" "$DMV_AGENT_ID" "$DMV_AGENT_PASSWORD")

# if [ -z "$access_token" ] ; then
#    echo "Error> failed to obtain an access token."
#    exit 1
# fi

#holder_access_token=$(get_ropc_token "$OIDC_TOKEN_ENDPOINT" "$HOLDER_AGENT_NAME" "$HOLDER_AGENT_PASSWORD")

# Create and print the invitation
# echo $(create_invitation $AGENCY_URL $holder_access_token)

#echo "Listing holder credentials:"
#echo $(list_credentials $AGENCY_URL $holder_access_token)

# echo "Listing DMV credentials:"
# echo $(list_credentials $AGENCY_URL $access_token)

# echo "Accepting holder credential:"
# read -p "Enter your cred id: " credid
# echo $(accept_credential $AGENCY_URL $holder_access_token $credid)

# echo "Listing holder connections:"
# echo $(list_connections $AGENCY_URL $holder_access_token)
# echo "Listing DMV connections:"
# echo $(list_connections $AGENCY_URL $access_token)

# Get access token
echo "Getting admin access token..."
access_token=$(get_access_token "$TOKEN_ENDPOINT" "$admin_name" "$admin_password")

# echo "Listing agents:"
# echo $(list_agents $AGENCY_URL $access_token)

# echo "Listing trusted issuing authorities:"
# echo $(get_trusted_issuing_authorities $AGENCY_URL $access_token)

#echo "Creating trusted issuing authority:"
#authority_id=$(create_trusted_issuing_authority "$AGENCY_URL" $access_token "certificatePayload")
#echo $authority_id

# echo "Get agent:"
# echo $(get_agent $AGENCY_URL $access_token "d651ceae-e9fa-4ed5-87df-79527b379c62")

#echo "Creating invitation for verification..."
#echo $(create_invitation_from_issuer_for_verification $AGENCY_URL $access_token)

#echo "List verifications..."
#echo $(list_verifications $AGENCY_URL $access_token)

#echo "Creating invitation for verification..."
#echo $(create_invitation_for_verification_with_multiple_credentials $AGENCY_URL $access_token)

#echo "Accept verification..."
#echo $(accept_verification $AGENCY_URL $holder_access_token "a740e3f2-ca45-456b-a5d1-69a9d8e9f374")

# echo "Listing credential schema:"
# echo $(get_credential_schema $AGENCY_URL $access_token "48c1cec8-cbd6-44fa-a36f-b24d590eb7ef")

# echo "Create invitation from holder:"
# short_invitation=$(create_invitation_from_holder $AGENCY_URL $holder_access_token)

# echo "Create invitation from issuer:"
# short_invitation=$(create_invitation_from_issuer $AGENCY_URL $access_token "2:mso_mdoc:625c43d1-6f6d-4b7e-a763-9926061f7b1c")

# echo "Getting credential definitions:"
# echo $(get_credential_definitions $AGENCY_URL $access_token)

#echo "Getting credential definition:"
#echo $(get_credential_definition $AGENCY_URL $access_token "2:mso_mdoc:777072e2-1ee5-4ac4-9cee-9c5eca21fbb6")

# echo "Create credential schema"
# schema_id=$(create_oid4vci_credential_schema $AGENCY_URL $access_token)
# echo $schema_id

# echo "Create credential definition"
# credential_definition_id=$(create_oid4vci_credential_definition $AGENCY_URL $access_token $schema_id)
# echo $credential_definition_id

# echo "Create OID4VCI offer"
# offer_id=$(create_oid4vci_offer $AGENCY_URL $access_token $credential_definition_id)
# echo $offer_id

# echo "Get OID4VCI offer"
# $(get_oid4vci_offer $AGENCY_URL $access_token $offer_id)
# open ./offer_image.png

# echo "Get OID4VCI offers"
# offers=$(get_oid4vci_offers $AGENCY_URL $access_token)
# echo $offers