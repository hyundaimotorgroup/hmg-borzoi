-- Encrypted copy of the OIDC id_token issued at SSO login, needed to send
-- id_token_hint on RP-Initiated Logout (required by HMG SSO's end_session_endpoint).
ALTER TABLE "Session" ADD COLUMN "idToken" TEXT;
