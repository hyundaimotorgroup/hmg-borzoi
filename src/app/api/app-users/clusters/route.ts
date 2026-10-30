import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withRole } from "@/lib/auth/middleware";
import { logger } from "@/lib/utils/logger";

export const GET = withRole(async (_request: NextRequest) => {
  try {
    const clusters = await prisma.cluster.findMany({
      select: {
        id: true,
        name: true,
        host: true,
        port: true,
        username: true,
        environment: true,
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json(clusters);
  } catch (error) {
    logger.error("Failed to fetch admin cluster list:", error);
    return NextResponse.json(
      { error: "Failed to fetch cluster list" },
      { status: 500 }
    );
  }
}, ["admin"]);
