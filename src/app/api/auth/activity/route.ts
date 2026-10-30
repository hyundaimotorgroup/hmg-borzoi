import { logger } from "@/lib/utils/logger";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSession } from "@/lib/auth/session";
import { touchSessionActivity, peekSessionExpiry } from "@/lib/auth/session-store";

/**
 * POST /api/auth/activity
 * The only endpoint allowed to bump lastActivityAt for idle-timeout purposes.
 * Call this exclusively from a real DOM input event handler (see the
 * activity listener in AuthContext.tsx), never from a timer/poll — a poll
 * calling this would defeat idle logout entirely, since the session would
 * never go idle as long as the tab stayed open.
 */
export async function POST() {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const sessionToken = (await cookies()).get("app_session")?.value ?? "";
    await touchSessionActivity(sessionToken);
    const sessionExpiresAt = await peekSessionExpiry(sessionToken);

    return NextResponse.json({ sessionExpiresAt: sessionExpiresAt?.toISOString() ?? null });
  } catch (error) {
    logger.error("Activity ping error:", error);
    return NextResponse.json({ error: "Failed to record activity" }, { status: 500 });
  }
}
