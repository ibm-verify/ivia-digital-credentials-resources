importClass(Packages.com.tivoli.am.fim.trustserver.sts.utilities.IDMappingExtUtils);
/*
 * We want to set the scope based on the client identifier and grant type.  Of
 * particular concern are administrative users.
 */

var grantType = stsuu.getContextAttributes().getAttributeValueByName(
                                                    "grant_type");
var clientID  = stsuu.getContextAttributes().getAttributeValueByName(
                                                    "client_id");

IDMappingExtUtils.traceString("Starting PRE TOKEN JS");
// IDMappingExtUtils.traceString("CONTEXT ATTRIBUTES\n: " + stsuu.toString());
// IDMappingExtUtils.traceString("client attributes: " + JSON.stringify(oauth_client));
IDMappingExtUtils.traceString("clientID: " + clientID);
IDMappingExtUtils.traceString("grantType: " + grantType);

/*
 * If the grant type is a pre-authorized code then we need to add the
 * pre-authorized code to the token data so that it can introspected
 * by the credential issuer later.  It is likely the credential issuer
 * will need to correlate a credential offer with the pre-authorized code
 * value.
 */

if (grantType === "urn:ietf:params:oauth:grant-type:pre-authorized_code") {
    var preAuthorizedCode  = stsuu.getContextAttributes().getAttributeValueByName("pre-authorized_code");
    IDMappingExtUtils.traceString("pre-authorized_code: " + preAuthorizedCode);
    tokenData["pre-authorized_code"] = preAuthorizedCode;
}

const excludeAznClientCheck = new Set(["default_oid4vci_wallet"]);

if (!excludeAznClientCheck.has(clientID)) {

    // Let the token have all of the permitted scopes of the registered client.
    tokenData.scope = (oauth_client._client.scopes || []).join(' ');

    // Add tenantUUID from extension properties to the token
    tokenData.tenantUUID = oauth_client.getExtendedData("tenantUUID");
    IDMappingExtUtils.traceString("Added tenantUUID to token: " + tokenData.tenantUUID);

    tokenData.isHolder = (oauth_client.getExtendedData("isHolder") === "true");

    /*
    * If the grant type is an authorization code (which occurs during OIDC
    * authentication) we want to add the scope to the id token data, based
    * on the client id.
    */
    if (grantType == "authorization_code" && excludeAznClientCheck.has(clientID) != true) {
        if (clientID == "rp_client") {
            idtokenData.scope = "admin";
        } else {
            idtokenData.scope = "verifier/issuers";
        }
    }
}