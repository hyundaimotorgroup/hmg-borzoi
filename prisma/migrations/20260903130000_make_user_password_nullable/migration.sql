-- Make the password nullable because users who register only via SSO (OIDC) have no local password.
ALTER TABLE "User" ALTER COLUMN "password" DROP NOT NULL;
