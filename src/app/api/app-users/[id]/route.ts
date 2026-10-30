import { logger } from "@/lib/utils/logger";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withRole, withAudit } from "@/lib/auth/middleware";
import bcrypt from "bcryptjs";
import { parseRequestJson, updateAppUserSchema } from "@/lib/validation";

export const PUT = withRole(
  withAudit(async (request: NextRequest, { params }) => {
    try {
      const { id } = await params;
      const parsed = await parseRequestJson(request, updateAppUserSchema);
      if (!parsed.success) {
        return parsed.response;
      }
      const { name, email, role, password } = parsed.data;

      // Check if user exists
      const existingUser = await prisma.user.findUnique({
        where: { id }
      });

      if (!existingUser) {
        return NextResponse.json(
          { error: "User not found" },
          { status: 404 }
        );
      }

      // Check if email is being changed and if it is already in use
      if (email && email !== existingUser.email) {
        const emailInUse = await prisma.user.findUnique({
          where: { email }
        });

        if (emailInUse) {
          return NextResponse.json(
            { error: "Email already in use" },
            { status: 409 }
          );
        }
      }

      // Prepare update data
      const updateData: {
        name?: string;
        email?: string;
        role?: "admin" | "developer" | "viewer";
        password?: string;
      } = {};
      if (name) updateData.name = name;
      if (email) updateData.email = email;
      if (role) updateData.role = role;
      if (password) {
        updateData.password = await bcrypt.hash(password, 10);
      }

      // Update user
      const user = await prisma.user.update({
        where: { id },
        data: updateData,
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          createdAt: true,
          updatedAt: true
        }
      });

      return NextResponse.json(user);
    } catch (error) {
      logger.error("Failed to update app user:", error);
      return NextResponse.json(
        { error: "Failed to update app user" },
        { status: 500 }
      );
    }
  }, 'UPDATE_APP_USER', 'user'),
  ['admin']
);

export const DELETE = withRole(
  withAudit(async (_request: NextRequest, { params }) => {
    try {
      const { id } = await params;

      // Check if user exists
      const existingUser = await prisma.user.findUnique({
        where: { id }
      });

      if (!existingUser) {
        return NextResponse.json(
          { error: "User not found" },
          { status: 404 }
        );
      }

      // Delete user (UserClusterAccess is also cascade deleted due to schema configuration)
      await prisma.user.delete({
        where: { id }
      });

      return NextResponse.json({ message: "User deleted successfully" });
    } catch (error) {
      logger.error("Failed to delete app user:", error);
      return NextResponse.json(
        { error: "Failed to delete app user" },
        { status: 500 }
      );
    }
  }, 'DELETE_APP_USER', 'user'),
  ['admin']
);
