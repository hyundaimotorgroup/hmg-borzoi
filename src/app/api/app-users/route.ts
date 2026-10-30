import { logger } from "@/lib/utils/logger";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withRole, withAudit } from "@/lib/auth/middleware";
import bcrypt from "bcryptjs";
import { createAppUserSchema, parseRequestJson } from "@/lib/validation";
import { USER_CLUSTER_ACCESS_SAFE_SELECT } from "@/lib/prisma-selects";

export const GET = withRole(async (_request: NextRequest) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: { name: 'asc' },
      include: {
        clusterAccess: {
          select: USER_CLUSTER_ACCESS_SAFE_SELECT,
        },
      },
    });

    const sanitized = users.map(({ password: _, ...u }) => u);
    return NextResponse.json(sanitized);
  } catch (error) {
    logger.error("Failed to fetch app users:", error);
    return NextResponse.json(
      { error: "Failed to fetch app users" },
      { status: 500 }
    );
  }
}, ['admin']);

export const POST = withRole(
  withAudit(async (request, _context, _user) => {
    try {
      const parsed = await parseRequestJson(request, createAppUserSchema);
      if (!parsed.success) {
        return parsed.response;
      }
      const { name, email, password, role } = parsed.data;

      // Check for duplicate email
      const existingUser = await prisma.user.findUnique({
        where: { email }
      });

      if (existingUser) {
        return NextResponse.json(
          { error: "User with this email already exists" },
          { status: 409 }
        );
      }

      // Hash the password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Create user
      const user = await prisma.user.create({
        data: {
          name,
          email,
          password: hashedPassword,
          role
        }
      });

      // Return user info excluding password
      const { password: _, ...userWithoutPassword } = user;
      return NextResponse.json(userWithoutPassword, { status: 201 });
    } catch (error) {
      logger.error("Failed to create app user:", error);
      return NextResponse.json(
        { error: "Failed to create app user" },
        { status: 500 }
      );
    }
  }, 'CREATE_APP_USER', 'user'),
  ['admin']
);
