import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClickHouseClientDirect } from "@/lib/clickhouse/index";
import { withRole } from "@/lib/auth/middleware";
import { logger } from "@/lib/utils/logger";
import { clusterCredentialTestSchema, parseRequestJson } from "@/lib/validation";

function parseConnectionError(errorMessage: string, username: string): string {
  if (errorMessage.includes("Authentication failed")) return "Invalid username or password";
  if (errorMessage.includes("Connection refused")) return "Cannot connect to CH server";
  if (errorMessage.includes("timeout")) return "Connection timeout";
  if (errorMessage.includes("Unknown user")) return `User '${username}' does not exist in CH`;
  return "Authentication failed";
}

export const POST = withRole(async (request, { params }) => {
  try {
    const { id } = await params;
    const parsed = await parseRequestJson(request, clusterCredentialTestSchema);
    if (!parsed.success) {
      return parsed.response;
    }
    const { username, password } = parsed.data;

    const cluster = await prisma.cluster.findUnique({ where: { id } });
    if (!cluster) {
      return NextResponse.json(
        { success: false, error: "Cluster not found" },
        { status: 404 }
      );
    }

    const client = await createClickHouseClientDirect({
      host: cluster.host,
      port: cluster.port,
      username,
      password,
      useTLS: cluster.useTLS,
      request_timeout: 5000,
    });

    try {
      const alive = await client.ping();
      if (!alive) {
        return NextResponse.json({ success: false, error: "Connection failed" });
      }

      return NextResponse.json({ success: true, message: "Connection successful" });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return NextResponse.json({
        success: false,
        error: parseConnectionError(errorMessage, username),
        details: errorMessage,
      });
    } finally {
      await client.close();
    }
  } catch (error) {
    logger.error("Admin connection test error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to test connection",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}, ["admin"]);
