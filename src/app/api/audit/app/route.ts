import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { withRole } from "@/lib/auth/middleware";
import { logger } from "@/lib/utils/logger";
import { resolveTimeseriesRange, TimeseriesRangeError } from "@/lib/metrics/timeseries-range";

export const GET = withRole(async (request: NextRequest) => {
  try {
    const searchParams = request.nextUrl.searchParams;
    const action = searchParams.get("action");
    const resourceType = searchParams.get("resourceType");
    const resolvedRange = resolveTimeseriesRange({
      mode: searchParams.get('mode'),
      preset: searchParams.get('preset'),
      from: searchParams.get('from'),
      to: searchParams.get('to'),
      timeRange: searchParams.get('timeRange'),
      timezone: searchParams.get('timezone'),
    });

    const where: Prisma.AuditLogWhereInput = {
      timestamp: {
        gte: resolvedRange.start,
        lt: resolvedRange.end,
      },
    };

    if (action && action !== "all") {
      where.action = action;
    }

    if (resourceType && resourceType !== "all") {
      where.resourceType = resourceType;
    }

 // 
    const logs = await prisma.auditLog.findMany({
      where,
      orderBy: {
        timestamp: "desc",
      },
      take: 1000,
    });

    return NextResponse.json({ logs });
  } catch (error) {
    if (error instanceof TimeseriesRangeError) {
      return NextResponse.json(
        { error: error.message, logs: [] },
        { status: 400 }
      );
    }

    logger.error("Failed to fetch app audit logs:", error);
    return NextResponse.json(
      { error: "Failed to fetch audit logs", logs: [] },
      { status: 500 }
    );
  }
}, ['admin']);

