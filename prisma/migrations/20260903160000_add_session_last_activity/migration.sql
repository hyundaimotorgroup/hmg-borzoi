-- Tracks per-session activity for idle-timeout enforcement, independent of
-- the absolute expiresAt.
ALTER TABLE "Session" ADD COLUMN "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
