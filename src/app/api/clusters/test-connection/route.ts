import { logger } from "@/lib/utils/logger";
import { NextRequest, NextResponse } from "next/server";
import { createClickHouseClientDirect } from "@/lib/clickhouse/index";
import { withRole } from "@/lib/auth/middleware";
import { clusterConnectionTestSchema, parseRequestJson } from "@/lib/validation";

function parseConnectionError(errorMessage: string, username: string): string {
  if (errorMessage.includes("Authentication failed")) return "Invalid username or password";
  if (errorMessage.includes("Connection refused")) return "Cannot connect to CH server";
  if (errorMessage.includes("timeout")) return "Connection timeout";
  if (errorMessage.includes("Unknown user")) return `User '${username}' does not exist in CH`;
  return "Connection failed";
}

export const POST = withRole(
  async (request: NextRequest) => {
    try {
      const parsed = await parseRequestJson(request, clusterConnectionTestSchema);
      if (!parsed.success) {
        return parsed.response;
      }
      const { host, port, username, password, useTLS } = parsed.data;

      // No host/IP restriction: cluster registration is admin-only and this
      // endpoint's whole purpose is connecting to an admin-supplied ClickHouse
      // host, which may legitimately be any address (internal, loopback for
      // local testing, or a public IP).
      const client = await createClickHouseClientDirect({
        host,
        port,
        username,
        password,
        useTLS,
        request_timeout: 5000,
      });

      try {
        const alive = await client.ping();

        if (!alive) {
          return NextResponse.json({ success: false, message: "Connection failed", error: "Connection failed" });
        }

        return NextResponse.json({ success: true, message: "Connection successful" });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const message = parseConnectionError(errorMessage, username);
        return NextResponse.json({
          success: false,
          message,
          error: message,
          details: errorMessage,
        });
      } finally {
        await client.close();
      }
    } catch (error) {
      logger.error("Connection test error:", error);
      return NextResponse.json(
        {
          success: false,
          message: "Failed to test connection",
          error: "Failed to test connection",
          details: error instanceof Error ? error.message : String(error),
        },
        { status: 500 }
      );
    }
  },
  ["admin"]
);
