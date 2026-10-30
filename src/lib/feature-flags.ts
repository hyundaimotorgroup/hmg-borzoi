/**
 * Feature flags backed by env vars, checked server-side only. Deliberately NOT
 * NEXT_PUBLIC_-prefixed: Next.js inlines NEXT_PUBLIC_ vars into the compiled
 * output at build time (server code included), which breaks a deployment
 * model where a single image is built once and toggled per-environment via
 * runtime env vars (e.g. a k8s ConfigMap). A plain env var is read live from
 * process.env on every request, so it responds to runtime config changes.
 * Client-side visibility (e.g. sidebar nav) must get this value from a server
 * response (see /api/auth/session) rather than reading process.env directly.
 */
export function isQueryEditorEnabled(): boolean {
  return process.env.ENABLE_QUERY_EDITOR !== "false";
}

/**
 * Whether OIDC-based SSO login is active. Opt-in (default disabled), unlike
 * ENABLE_QUERY_EDITOR above — enabling it also disables password login/registration
 * (see /api/auth/login, /api/auth/register), so it must not turn on by accident.
 */
export function isSsoEnabled(): boolean {
  return process.env.AUTH_OIDC_ENABLED === "true";
}

/**
 * Whether app_session/oidc_txn cookies must carry the Secure attribute.
 * Defaults to true regardless of NODE_ENV — previously hardcoded to
 * NODE_ENV === "production", which silently breaks whenever a production
 * deployment is genuinely served over plain HTTP (e.g. a legacy host with no
 * TLS termination in front of it): the browser refuses to store a Secure
 * cookie from a plain-HTTP response, so login "succeeds" server-side but the
 * client never ends up authenticated.
 *
 * Deliberately NOT derived from x-forwarded-proto: a misconfigured
 * TLS-terminating proxy that drops that header would otherwise silently
 * downgrade a real HTTPS deployment to non-Secure cookies. This must be an
 * explicit, per-host opt-out set by whoever controls that host's ConfigMap —
 * only for a host that is genuinely, deliberately plain HTTP.
 */
export function isSecureCookieRequired(): boolean {
  return process.env.AUTH_COOKIE_ALLOW_INSECURE !== "true";
}

/**
 * Idle-logout window in ms, reset on every authenticated request (see
 * getSessionUser() in session-store.ts). Opt-in: 0 means disabled — unset or
 * a non-positive value leaves only the absolute max-lifetime timeout below,
 * so upgrading an existing deployment without configuring this doesn't
 * silently start logging people out.
 */
export function getSessionIdleTimeoutMs(): number {
  const minutes = Number(process.env.SESSION_IDLE_TIMEOUT_MINUTES);
  return Number.isFinite(minutes) && minutes > 0 ? minutes * 60_000 : 0;
}

const DEFAULT_SESSION_MAX_LIFETIME_MINUTES = 24 * 60;

/**
 * Absolute session lifetime in ms from creation, unaffected by activity —
 * unlike the idle timeout above, this always has a value (default 24h,
 * matching the previously hardcoded SESSION_TTL_MS) since it replaces
 * behavior that already existed unconditionally.
 */
export function getSessionMaxLifetimeMs(): number {
  const minutes = Number(process.env.SESSION_MAX_LIFETIME_MINUTES);
  const effectiveMinutes = Number.isFinite(minutes) && minutes > 0 ? minutes : DEFAULT_SESSION_MAX_LIFETIME_MINUTES;
  return effectiveMinutes * 60_000;
}
