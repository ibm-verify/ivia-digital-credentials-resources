importClass(Packages.com.tivoli.am.fim.trustserver.sts.utilities.IDMappingExtUtils);
importClass(Packages.com.tivoli.am.fim.trustserver.sts.utilities.OAuthMappingExtUtils);

var username = stsuu.getContextAttributes().getAttributeValueByName("username");
var password = stsuu.getContextAttributes().getAttributeValueByName("password");

IDMappingExtUtils.traceString("Starting ROPC JS");
IDMappingExtUtils.traceString("username: " + username);

if (username !== "user_1" || password !== "secret") {
    OAuthMappingExtUtils.throwSTSCustomUserMessageException("Invalid resource owner credentials", 400, "invalid_grant");
}

stsuu.setPrincipalName(username);
stsuu.addContextAttribute(new Attribute("authsvc", "urn:ibm:names:ITFIM:oauth:response:attribute", "authenticated"));
stsuu.addContextAttribute(new Attribute("uid", "urn:ibm:names:ITFIM:oauth:response:attribute", username));
stsuu.addContextAttribute(new Attribute("username", "urn:ibm:names:ITFIM:oauth:response:attribute", username));
stsuu.addContextAttribute(new Attribute("preferred_username", "urn:ibm:names:ITFIM:oauth:response:attribute", username));