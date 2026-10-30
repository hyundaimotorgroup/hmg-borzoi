import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/utils/logger";
import { isSsoEnabled, isSecureCookieRequired } from "@/lib/feature-flags";
import { getOidcSettings, getConfiguredAppOrigin, sanitizeReturnTo } from "@/lib/auth/oidc-config";
import { createAuthRequestSecrets, getOidcConfiguration, buildAuthorizationUrl } from "@/lib/auth/oidc-client";

const TXN_COOKIE = "oidc_txn";
const TXN_COOKIE_PATH = "/api/auth/oidc";
const TXN_MAX_AGE_SECONDS = 600;

function loginRedirect(request: NextRequest, error: string): NextResponse {
  return NextResponse.redirect(new URL(`/login?error=${error}`, getConfiguredAppOrigin() ?? request.url));
}

/**
 * GET /api/auth/oidc/start
 * Redirects the browser to the IdP's authorization endpoint, stashing
 * state/nonce/PKCE verifier/returnTo in a short-lived transaction cookie.
 */
export async function GET(request: NextRequest) {
  if (!isSsoEnabled()) {
    return loginRedirect(request, "sso_disabled");
  }

  try {
    const settings = getOidcSettings();
    if (!settings) {
      return loginRedirect(request, "sso_disabled");
    }

    const returnTo = sanitizeReturnTo(request.nextUrl.searchParams.get("returnTo"));
    const secrets = await createAuthRequestSecrets();
    const configuration = await getOidcConfiguration(settings);

    const authorizationUrl = buildAuthorizationUrl(configuration, {
      redirectUri: settings.redirectUri,
      scope: settings.scope,
      state: secrets.state,
      nonce: secrets.nonce,
      codeChallenge: secrets.codeChallenge,
    });

    const response = NextResponse.redirect(authorizationUrl);

    response.cookies.set(
      TXN_COOKIE,
      JSON.stringify({
        state: secrets.state,
        nonce: secrets.nonce,
        codeVerifier: secrets.codeVerifier,
        returnTo,
      }),
      {
        httpOnly: true,
        secure: isSecureCookieRequired(),
        sameSite: "lax",
        path: TXN_COOKIE_PATH,
        maxAge: TXN_MAX_AGE_SECONDS,
      }
    );

    return response;
  } catch (error) {
    logger.error("OIDC start error:", error);
    return loginRedirect(request, "oidc_config_error");
  }
}
