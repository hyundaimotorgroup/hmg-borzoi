-- Distinguishes why a session was revoked ('superseded' | 'idle_timeout' |
-- 'logout' | 'admin_revoked') so the client can tell "a newer login elsewhere
-- replaced this session" apart from an idle timeout it already handles precisely.
ALTER TABLE "Session" ADD COLUMN "revokedReason" TEXT;
