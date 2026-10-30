import { logger } from "@/lib/utils/logger";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getSessionOwner, revokeSession } from "@/lib/auth/session-store";
import { isSsoEnabled } from "@/lib/feature-flags";
import { getOidcSettings, getConfiguredAppOrigin } from "@/lib/auth/oidc-config";
import { getOidcConfiguration, buildEndSessionUrl } from "@/lib/auth/oidc-client";
import { hasExternalIdentity } from "@/lib/auth/oidc-provision";

/**
 * Best-effort RP-Initiated Logout: also ends the IdP-side SSO session. This
 * matters just as much — arguably more — for an idle-timeout-triggered
 * logout as for a manual one: idle timeout exists to protect an unattended
 * browser, and if it only cleared our own cookie while the IdP session
 * stayed live, anyone at that browser could click "SSO sign-in" again and be
 * silently re-authenticated with no credential prompt at all, defeating the
 * point of the timeout. Only attempted for a user who has actually linked an
 * SSO identity (password-only accounts were never logged into the IdP), and
 * any failure here must never block the local logout that already happened
 * above it.
 *
 * post_logout_redirect_uri is always this exact, fixed value. Some providers
 * fall back to their own portal page for an omitted or unregistered value
 * (including one that only differs by query string) instead of returning here.
 * A dynamic message like "idle_timeout" therefore can't ride along on this
 * URL; the client stashes it in sessionStorage instead (see AuthContext.tsx).
 */
async function buildSsoLogoutUrl(userId: string, idToken: string | null): Promise<string | null> {
  if (!isSsoEnabled()) {
    return null;
  }

  try {
    const settings = getOidcSettings();
    const appOrigin = getConfiguredAppOrigin();
    if (!settings || !appOrigin || !(await hasExternalIdentity(userId))) {
      return null;
    }

    const configuration = await getOidcConfiguration(settings);
    const endSessionUrl = buildEndSessionUrl(configuration, {
      postLogoutRedirectUri: `${appOrigin}/login`,
      idTokenHint: idToken,
    });
    return endSessionUrl?.toString() ?? null;
  } catch (error) {
    logger.error("Failed to build SSO end-session URL:", error);
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get("app_session")?.value;
    // Not getSession(): that enforces idle-timeout validity as a side effect,
    // which for an idle-timeout-triggered logout would already have revoked
    // this exact session (the client's countdown hits zero at the same
    // instant the server's own idle check would) and returned null — leaving
    // no account to attribute the audit log or SSO logout to. Logout needs to
    // know who this token belonged to regardless of whether it's already
    // expired/revoked.
    const sessionOwner = await getSessionOwner(sessionToken ?? "");
    const user = sessionOwner?.user ?? null;

    if (user) {
      try {
        await prisma.auditLog.create({
          data: {
            userId: user.id,
            userName: user.name,
            action: "LOGOUT",
            resourceType: "auth",
            details: `User ${user.email} logged out`,
            ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0] ||
                       request.headers.get("x-real-ip") ||
                       "unknown",
            userAgent: request.headers.get("user-agent") || "unknown",
            success: true,
          },
        });
      } catch (auditError) {
        logger.error("Failed to create audit log:", auditError);
      }
    }

    if (sessionToken) {
      await revokeSession(sessionToken);
    }

    cookieStore.delete("app_session");
    // Also clear the legacy cookie names from before the session-cookie rename
    // (and the pre-DB-session era) so old browsers fully log out too.
    cookieStore.delete("session");
    cookieStore.delete("user");

    const ssoLogoutUrl = user ? await buildSsoLogoutUrl(user.id, sessionOwner?.idToken ?? null) : null;

    return NextResponse.json({ success: true, ssoLogoutUrl });
  } catch (error) {
    logger.error("Logout error:", error);
    return NextResponse.json(
      { error: "An error occurred during logout." },
      { status: 500 }
    );
  }
}
