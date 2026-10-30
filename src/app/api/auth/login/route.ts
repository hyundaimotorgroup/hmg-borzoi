import { logger } from "@/lib/utils/logger";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";
import bcrypt from "bcrypt";
import { loginSchema, parseRequestJson } from "@/lib/validation";
import { createSession } from "@/lib/auth/session-store";
import { isSsoEnabled, isSecureCookieRequired } from "@/lib/feature-flags";

// Pre-computed once at process start. Compared against on a nonexistent-email
// hit so that path costs roughly the same as a real bcrypt.compare() — otherwise
// the fast early-return would let an attacker enumerate valid emails via timing.
const DUMMY_PASSWORD_HASH = bcrypt.hashSync("timing-attack-mitigation", 10);

export async function POST(request: NextRequest) {
  try {
    if (isSsoEnabled()) {
      return NextResponse.json(
        { error: "SSO가 활성화된 상태에서는 비밀번호 로그인을 사용할 수 없습니다." },
        { status: 403 }
      );
    }

    const parsed = await parseRequestJson(request, loginSchema);
    if (!parsed.success) {
      return parsed.response;
    }
    const { email, password } = parsed.data;

 //
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user || !user.password) {
      // Burn the same bcrypt.compare() cost as the real path below so this
      // response isn't measurably faster (would leak whether the email exists).
      // A user with no password (SSO-only account) must also fail here rather
      // than throw — bcrypt.compare() requires a string hash to compare against.
      await bcrypt.compare(password, DUMMY_PASSWORD_HASH);
      return NextResponse.json(
        { error: "Invalid email or password." },
        { status: 401 }
      );
    }

 // bcrypt
    const isValidPassword = await bcrypt.compare(password, user.password);

    if (!isValidPassword) {
      return NextResponse.json(
        { error: "Invalid email or password." },
        { status: 401 }
      );
    }

    const ipAddress = request.headers.get("x-forwarded-for")?.split(",")[0] ||
                       request.headers.get("x-real-ip") ||
                       "unknown";
    const userAgent = request.headers.get("user-agent") || "unknown";

    const { token: sessionToken, expiresAt } = await createSession(user.id, {
      ipAddress,
      userAgent,
    });

    const cookieStore = await cookies();

    cookieStore.set("app_session", sessionToken, {
      httpOnly: true,
      secure: isSecureCookieRequired(),
      sameSite: "lax",
      expires: expiresAt,
      path: "/",
    });

 // 
    try {
      await prisma.auditLog.create({
        data: {
          userId: user.id,
          userName: user.name,
          action: "LOGIN",
          resourceType: "auth",
          details: `User ${user.email} logged in successfully`,
          ipAddress,
          userAgent,
          success: true,
        },
      });
    } catch (auditError) {
      logger.error("Failed to create audit log:", auditError);
 // 
    }

 // JSON ()
    const response = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });

 // 
    return response;
  } catch (error) {
    logger.error("Login error:", error);
    return NextResponse.json(
      { error: "An error occurred during login." },
      { status: 500 }
    );
  }
}
