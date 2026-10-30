export type OidcClientAuthMethod = "client_secret_basic" | "client_secret_post";

export type EmailVerifiedPolicy = "ignore" | "trust" | "require";

export interface OidcSettings {
  issuer: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scope: string;
  userNameClaim: string;
  userNameClaimRegex: string;
  clientAuthMethod: OidcClientAuthMethod;
  adminEmails: Set<string>;
  emailVerifiedPolicy: EmailVerifiedPolicy;
}

/**
 * Reads and validates AUTH_OIDC_* env vars. Returns null when SSO is disabled.
 * Throws when enabled but missing required settings, so misconfiguration
 * fails loudly at first use instead of silently falling back to password login.
 */
export function getOidcSettings(): OidcSettings | null {
  if (process.env.AUTH_OIDC_ENABLED !== "true") {
    return null;
  }

  const issuer = process.env.AUTH_OIDC_ISSUER;
  const clientId = process.env.AUTH_OIDC_CLIENT_ID;
  const clientSecret = process.env.AUTH_OIDC_CLIENT_SECRET;
  const baseUrl = process.env.AUTH_OIDC_BASE_URL;

  if (!issuer || !clientId || !clientSecret || !baseUrl) {
    throw new Error(
      "AUTH_OIDC_ENABLED=true requires AUTH_OIDC_ISSUER, AUTH_OIDC_CLIENT_ID, AUTH_OIDC_CLIENT_SECRET and AUTH_OIDC_BASE_URL to be set."
    );
  }

  // Only the origin ever matters here (see getConfiguredAppOrigin() below) —
  // the callback path is fixed and always ours, so there's no reason to make
  // an operator type it out (and no risk of it drifting from what the route
  // is actually mounted at).
  let redirectUri: string;
  try {
    redirectUri = new URL("/api/auth/oidc/callback", baseUrl).toString();
  } catch {
    throw new Error(`AUTH_OIDC_BASE_URL is not a valid absolute URL: ${baseUrl}`);
  }

  const clientAuthMethod: OidcClientAuthMethod =
    process.env.AUTH_OIDC_CLIENT_AUTHENTICATION_METHOD === "client_secret_post"
      ? "client_secret_post"
      : "client_secret_basic";

  return {
    issuer,
    clientId,
    clientSecret,
    redirectUri,
    scope: process.env.AUTH_OIDC_SCOPE || "openid profile email",
    userNameClaim: process.env.AUTH_OIDC_USER_NAME_CLAIM || "email",
    userNameClaimRegex: process.env.AUTH_OIDC_USER_NAME_CLAIM_REGEX || "(.*)",
    clientAuthMethod,
    adminEmails: parseAdminEmails(process.env.AUTH_OIDC_ADMIN_EMAILS),
    emailVerifiedPolicy: parseEmailVerifiedPolicy(process.env.AUTH_OIDC_EMAIL_VERIFIED_POLICY),
  };
}

function parseEmailVerifiedPolicy(raw: string | undefined): EmailVerifiedPolicy {
  return raw === "ignore" || raw === "require" ? raw : "trust";
}

export function parseAdminEmails(raw: string | undefined | null): Set<string> {
  if (!raw) {
    return new Set();
  }

  return new Set(
    raw
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter((email) => email.length > 0)
  );
}

/**
 * Extracts the identifier used to match/create a User from ID token claims.
 * Returns null on a missing claim or a regex that fails to match, so callers
 * can redirect to a clear error instead of creating a user with a bad email.
 */
export function resolveIdentifier(
  claims: Record<string, unknown>,
  claimName: string,
  regexSource: string
): string | null {
  const rawValue = claims[claimName];
  if (typeof rawValue !== "string" || rawValue.length === 0) {
    return null;
  }

  let regex: RegExp;
  try {
    regex = new RegExp(regexSource);
  } catch {
    return null;
  }

  const match = regex.exec(rawValue);
  if (!match) {
    return null;
  }

  return match[1] ?? match[0];
}

/**
 * Guards against linking to an unverified email address, which the AUTH_OIDC_ADMIN_EMAILS
 * allowlist makes higher-stakes than an ordinary login (an unverified/attacker-controlled
 * email matching an admin's address would grant admin on first login). Only enforced when
 * the configured identifier claim is actually "email" — for a different claim,
 * `email_verified` isn't meaningful.
 *
 * IdPs vary a lot here, in ways that don't collapse to a single "how strict"
 * knob:
 *  - "trust" (default): trust-by-absence — reject only an explicit `false`.
 *    Fits an IdP that never sends the claim but is otherwise trusted.
 *  - "require": require an explicit `true`. Verify against the actual IdP's
 *    token/userinfo response before enabling this — an IdP that simply omits
 *    the claim would lock out every SSO login.
 *  - "ignore": never check this claim. Needed for IdPs (seen in practice with
 *    at least one enterprise SSO) that emit `email_verified: false` for every
 *    account unconditionally — administratively-assigned corporate addresses
 *    have no user-driven verification step, so the org treats the claim as
 *    meaningless rather than as a real signal. "trust" would still reject
 *    those logins because the value is an explicit `false`, not absent.
 */
export function isIdentifierClaimVerified(
  claims: Record<string, unknown>,
  userNameClaim: string,
  policy: EmailVerifiedPolicy
): boolean {
  if (userNameClaim !== "email" || policy === "ignore") {
    return true;
  }
  return policy === "require" ? claims.email_verified === true : claims.email_verified !== false;
}

/**
 * Best-known public origin for redirecting back to /login, read directly from
 * AUTH_OIDC_BASE_URL rather than the incoming request's own URL. Behind a
 * reverse proxy that doesn't forward the Host header, `request.url` can fall
 * back to the container's bind address (e.g. http://0.0.0.0:3000) — a
 * redirect Location the browser can't actually reach. Returns null (callers
 * should fall back to `request.url`) when the env var is unset or unparsable.
 */
export function getConfiguredAppOrigin(): string | null {
  const baseUrl = process.env.AUTH_OIDC_BASE_URL;
  if (!baseUrl) {
    return null;
  }
  try {
    return new URL(baseUrl).origin;
  } catch {
    return null;
  }
}

/**
 * Restricts the post-login redirect target to a same-origin relative path.
 * `returnTo` round-trips through a cookie the user's browser controls, so an
 * unrestricted value would be an open-redirect vector.
 */
export function sanitizeReturnTo(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) {
    return "/";
  }
  return raw;
}
