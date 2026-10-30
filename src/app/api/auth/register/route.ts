import { logger } from "@/lib/utils/logger";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";
import bcryptjs from "bcryptjs";
import { registerSchema, parseRequestJson } from "@/lib/validation";
import { createSession } from "@/lib/auth/session-store";
import { isSsoEnabled, isSecureCookieRequired } from "@/lib/feature-flags";

export async function POST(request: NextRequest) {
  try {
    if (isSsoEnabled()) {
      return NextResponse.json(
        { error: "SSO가 활성화된 상태에서는 회원가입을 사용할 수 없습니다." },
        { status: 403 }
      );
    }

    if (process.env.ALLOW_PUBLIC_REGISTRATION !== "true") {
      return NextResponse.json(
        { error: "Public registration is disabled." },
        { status: 403 }
      );
    }

    const parsed = await parseRequestJson(request, registerSchema);
    if (!parsed.success) {
      return parsed.response;
    }

    const { name, email, password } = parsed.data;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json(
        { error: "An account with this email already exists." },
        { status: 409 }
      );
    }

    const hashedPassword = await bcryptjs.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role: "viewer",
      },
    });

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

    try {
      await prisma.auditLog.create({
        data: {
          userId: user.id,
          userName: user.name,
          action: "REGISTER",
          resourceType: "auth",
          details: `New user ${user.email} registered (role: viewer)`,
          ipAddress,
          userAgent,
          success: true,
        },
      });
    } catch (auditError) {
      logger.error("Failed to create audit log:", auditError);
    }

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
  } catch (error) {
    logger.error("Register error:", error);
    return NextResponse.json(
      { error: "An error occurred during registration." },
      { status: 500 }
    );
  }
}
