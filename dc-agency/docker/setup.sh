#!/bin/bash

###############################
# Generate our keys and certs #
###############################

# Check if the optional gateway DNS parameter has been set and append
# it to the IAG req.conf file if so
cp -f ./iag_config/req.conf.template ./iag_config/req.conf

if [[ -n $1 ]]; then
    echo -e "\nDNS.3 = $1" >> ./iag_config/req.conf
fi

# Generate CA cert
openssl req -new -x509 \
  -days 1825 \
  -config req-ca.conf \
  -keyout iviadc-ca.key \
  -out iviadc-ca.pem -nodes

# Generate service keys and certs

gen_certs() {
    pushd $1
    ./certs.sh
    popd
}

# Postgres depends on nothing
gen_certs postgres_config

# OIDC depends on Postgres
gen_certs oidc_provider_config

# IAG depends on OIDC
gen_certs iag_config

# Generate shared web-app cert (used by bank-app, dmv-app, hr-portal for HTTPS)
echo "Generating web-app TLS certificate..."
openssl req -new -nodes \
    -keyout webapps.key \
    -out    webapps.csr \
    -config webapps_req.conf
openssl x509 -req \
    -in webapps.csr \
    -CA  iviadc-ca.pem \
    -CAkey iviadc-ca.key \
    -CAcreateserial \
    -out webapps.crt \
    -days 365 \
    -extensions v3_req \
    -extfile webapps_req.conf
rm -f webapps.csr
echo "Web-app TLS certificate generated."

# Create CA bundle for Python requests (includes server cert + CA cert)
# This is needed for proper SSL verification with self-signed certificates
cat ./iag_config/iviadcgw_pub.crt ./iviadc-ca.pem > ./ca-bundle.pem
echo "Created CA bundle at ./ca-bundle.pem"

# DC depends on Postgres and IAG
gen_certs config
