import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AuthorizationResponseError } from "openid-client";
import { logger } from "@/lib/utils/logger";
import { prisma } from "@/lib/prisma";
import { isSsoEnabled, isSecureCookieRequired } from "@/lib/feature-flags";
import {
  getOidcSettings,
  getConfiguredAppOrigin,
  isIdentifierClaimVerified,
  resolveIdentifier,
  sanitizeReturnTo,
} from "@/lib/auth/oidc-config";
import { getOidcConfiguration, exchangeAuthorizationCode } from "@/lib/auth/oidc-client";
import { resolveSsoUser, ensureAdminPrivileges } from "@/lib/auth/oidc-provision";
import { createSession } from "@/lib/auth/session-store";

const TXN_COOKIE = "oidc_txn";
const TXN_COOKIE_PATH = "/api/auth/oidc";

interface OidcTxn {
  state: string;
  nonce: string;
  codeVerifier: string;
  returnTo: string;
}

function parseTxnCookie(raw: string | undefined): OidcTxn | null {
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw);
    if (
      typeof parsed?.state === "string" &&
      typeof parsed?.nonce === "string" &&
      typeof parsed?.codeVerifier === "string" &&
      typeof parsed?.returnTo === "string"
    ) {
      return parsed as OidcTxn;
    }
    return null;
  } catch {
    return null;
  }
}

function redirectToLogin(request: NextRequest, error: string): NextResponse {
  // Base is AUTH_OIDC_BASE_URL, not request.url — behind a reverse proxy that
  // doesn't forward Host, request.url can fall back to the container's own
  // bind address (e.g. http://0.0.0.0:3000), which the browser can't reach.
  const response = NextResponse.redirect(new URL(`/login?error=${error}`, getConfiguredAppOrigin() ?? request.url));
  response.cookies.delete({ name: TXN_COOKIE, path: TXN_COOKIE_PATH });
  return response;
}

/**
 * GET /api/auth/oidc/callback
 * IdP redirect target after authentication: exchanges the code for tokens,
 * finds-or-creates the local User, applies the AUTH_OIDC_ADMIN_EMAILS
 * allowlist, then issues the same app_session cookie password login would.
 */
export async function GET(request: NextRequest) {
  if (!isSsoEnabled()) {
    return redirectToLogin(request, "sso_disabled");
  }

  const txn = parseTxnCookie(request.cookies.get(TXN_COOKIE)?.value);
  if (!txn) {
    return redirectToLogin(request, "oidc_session_expired");
  }

  const idpError = request.nextUrl.searchParams.get("error");
  if (idpError) {
    logger.warn(`OIDC callback: IdP returned error=${idpError}`);
    return redirectToLogin(request, "oidc_denied");
  }

  try {
    const settings = getOidcSettings();
    if (!settings) {
      return redirectToLogin(request, "sso_disabled");
    }

    const configuration = await getOidcConfiguration(settings);

    let tokens;
    try {
      tokens = await exchangeAuthorizationCode(configuration, {
        redirectUri: settings.redirectUri,
        incomingSearchParams: request.nextUrl.searchParams,
        codeVerifier: txn.codeVerifier,
        state: txn.state,
        nonce: txn.nonce,
      });
    } catch (exchangeError) {
      logger.error("OIDC token exchange failed:", exchangeError);

      if (exchangeError instanceof AuthorizationResponseError) {
        return redirectToLogin(request, "oidc_denied");
      }

      // oauth4webapi (the library openid-client is built on) signals CSRF-protection
      // failures like a state/nonce mismatch via this error `code`, not a dedicated
      // exported class — duck-typed rather than importing the transitive dependency
      // directly for an instanceof check.
      if ((exchangeError as { code?: string } | undefined)?.code === "OAUTH_INVALID_RESPONSE") {
        return redirectToLogin(request, "oidc_state_mismatch");
      }

      return redirectToLogin(request, "oidc_exchange_failed");
    }

    const claims = tokens.claims();
    const identifier = claims
      ? resolveIdentifier(claims, settings.userNameClaim, settings.userNameClaimRegex)
      : null;

    if (!claims || !identifier) {
      return redirectToLogin(request, "oidc_claim_missing");
    }

    if (!isIdentifierClaimVerified(claims, settings.userNameClaim, settings.emailVerifiedPolicy)) {
      logger.warn(`OIDC callback: rejecting unverified email claim for identifier ${identifier}`);
      return redirectToLogin(request, "oidc_email_unverified");
    }

    const emailCheck = z.email().safeParse(identifier);
    if (!emailCheck.success) {
      return redirectToLogin(request, "oidc_invalid_identifier");
    }

    const email = emailCheck.data;
    const name = typeof claims?.name === "string" && claims.name.length > 0 ? claims.name : email;

    // claims.iss/sub, not settings.issuer: openid-client already verified iss
    // matches the discovered issuer, and sub is the JWT's canonical subject —
    // both are required claims per the ID Token spec.
    const user = await resolveSsoUser({ issuer: claims.iss, subject: claims.sub, email, name });
    await ensureAdminPrivileges(user, settings.adminEmails);

    const ipAddress =
      request.headers.get("x-forwarded-for")?.split(",")[0] || request.headers.get("x-real-ip") || "unknown";
    const userAgent = request.headers.get("user-agent") || "unknown";

    // tokens.id_token: the raw ID Token JWT, stored (encrypted) on the
    // session so logout can send it back as id_token_hint when the provider
    // requires it. Not derived from `claims`, which only
    // exposes the decoded payload, not the original signed string the IdP needs.
    const { token: sessionToken, expiresAt } = await createSession(user.id, {
      ipAddress,
      userAgent,
      idToken: tokens.id_token,
    });

    try {
      await prisma.auditLog.create({
        data: {
          userId: user.id,
          userName: user.name,
          action: "LOGIN_SSO",
          resourceType: "auth",
          details: `User ${user.email} logged in via SSO`,
          ipAddress,
          userAgent,
          success: true,
        },
      });
    } catch (auditError) {
      logger.error("Failed to create audit log:", auditError);
    }

    // Re-validated here, not just trusted from what `start` already sanitized:
    // the cookie is httpOnly but still client-supplied data (cookie-tossing from
    // a sibling subdomain, or a future bug in `start`, could hand us something
    // unsafe) — the redirect target must never leave this origin.
    const returnTo = sanitizeReturnTo(txn.returnTo);
    const response = NextResponse.redirect(new URL(returnTo, getConfiguredAppOrigin() ?? request.url));
    response.cookies.delete({ name: TXN_COOKIE, path: TXN_COOKIE_PATH });

    response.cookies.set("app_session", sessionToken, {
      httpOnly: true,
      secure: isSecureCookieRequired(),
      sameSite: "lax",
      expires: expiresAt,
      path: "/",
    });

    return response;
  } catch (error) {
    logger.error("OIDC callback error:", error);
    return redirectToLogin(request, "oidc_internal_error");
  }
}
