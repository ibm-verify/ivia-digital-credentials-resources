/// <reference types="vite/client" />

interface Window {
  ENV?: {
    REACT_APP_ACCOUNT_URL?: string;
    REACT_APP_W3_ROOT?: string;
    REACT_APP_HR_REDIRECT_URL?: string;
    REACT_APP_HR_CREDENTIAL_SCHEMA_ID?: string;
    REACT_APP_HR_CREDENTIAL_DEFINITION_ID?: string;
    REACT_APP_HR_AGENT_ID?: string;
  };
}