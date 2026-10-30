import { logger } from "@/lib/utils/logger";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSession } from "@/lib/auth/session";
import { peekSessionExpiry, getRevocationReason } from "@/lib/auth/session-store";
import { isQueryEditorEnabled } from "@/lib/feature-flags";

export async function GET() {
  try {
    const user = await getSession();

    if (!user) {
      const sessionToken = (await cookies()).get("app_session")?.value ?? "";
      const reason = await getRevocationReason(sessionToken);
      return NextResponse.json({ user: null, reason }, { status: 401 });
    }

    const sessionToken = (await cookies()).get("app_session")?.value ?? "";
    const sessionExpiresAt = await peekSessionExpiry(sessionToken);

    return NextResponse.json({
      user,
      queryEditorEnabled: isQueryEditorEnabled(),
      sessionExpiresAt: sessionExpiresAt?.toISOString() ?? null,
    });
  } catch (error) {
    logger.error("Session check error:", error);
    return NextResponse.json({ user: null }, { status: 401 });
  }
}
