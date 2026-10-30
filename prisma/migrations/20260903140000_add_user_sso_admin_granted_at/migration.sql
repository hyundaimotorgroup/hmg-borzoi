-- Tracks whether AUTH_OIDC_ADMIN_EMAILS has already granted this account admin,
-- so the allowlist is a one-time bootstrap and doesn't undo a later manual demotion.
ALTER TABLE "User" ADD COLUMN "ssoAdminGrantedAt" TIMESTAMP(3);
