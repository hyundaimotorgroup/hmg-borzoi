import { NextResponse } from "next/server";
import { executeClickHouseQuery } from "@/lib/clickhouse/index";
import { buildMonitoringQueryExclusion, escapeSqlString } from "@/lib/clickhouse/queries/helpers";
import { prisma } from "@/lib/prisma";
import { withRole } from "@/lib/auth/middleware";
import { hasClusterPermission } from "@/lib/auth/permissions";
import { logger } from "@/lib/utils/logger";
import { resolveTimeseriesRange, TimeseriesRangeError } from "@/lib/metrics/timeseries-range";
import { parseDdlObjectReference } from "@/lib/clickhouse/query-log";

function normalizePositiveInteger(value: string | null, fallback: number): number {
  const parsed = Number.parseInt(value || "", 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }

  return parsed;
}

function buildDdlSearchCondition(searchTerm: string | null): string | null {
  const normalized = searchTerm?.trim();
  if (!normalized) return null;

  const escaped = escapeSqlString(normalized.slice(0, 200));
  return `(
    positionCaseInsensitiveUTF8(user, '${escaped}') > 0
    OR positionCaseInsensitiveUTF8(query, '${escaped}') > 0
    OR positionCaseInsensitiveUTF8(current_database, '${escaped}') > 0
  )`;
}

/**
 * GET /api/audit/ch
 * ClickHouse DDL 
 * system.query_log DDL 
 */
export const GET = withRole(async (request, _context, user) => {
  try {
        const userId = user?.id;

    const searchParams = request.nextUrl.searchParams;
    const clusterId = searchParams.get("clusterId");
    const queryType = searchParams.get("queryType");
    const page = normalizePositiveInteger(searchParams.get("page"), 1);
    const pageSize = Math.min(normalizePositiveInteger(searchParams.get("pageSize"), 20), 100);
    const searchCondition = buildDdlSearchCondition(searchParams.get("search"));
    const resolvedRange = resolveTimeseriesRange({
      mode: searchParams.get('mode'),
      preset: searchParams.get('preset'),
      from: searchParams.get('from'),
      to: searchParams.get('to'),
      timeRange: searchParams.get('timeRange'),
      timezone: searchParams.get('timezone'),
    });
    const startUtc = escapeSqlString(resolvedRange.startUtc);
    const endUtc = escapeSqlString(resolvedRange.endUtc);
    const startDate = startUtc.slice(0, 10);
    const endDate = endUtc.slice(0, 10);

    if (!clusterId) {
      return NextResponse.json({
        items: [],
        total: 0,
        page: 1,
        pageSize,
        summary: {
          total: 0,
          successCount: 0,
          failedCount: 0,
          errorCount: 0,
          uniqueUsers: 0,
        },
      });
    }

    const cluster = await prisma.cluster.findUnique({ where: { id: clusterId } });
    if (!cluster) {
      return NextResponse.json(
        { error: "Cluster not found" },
        { status: 404 }
      );
    }

    if (userId && !(await hasClusterPermission(userId, clusterId))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    type AuditLogEntry = {
      id: string;
      timestamp: unknown;
      clusterId: string;
      clusterName: string;
      username: unknown;
      queryType: unknown;
      eventType: unknown;
      query: unknown;
      database: string;
      table?: string;
      success: boolean;
      exception: string;
      duration_ms: number;
      hostname: unknown;
    };

    const whereConditions = [
      `event_date >= toDate('${startDate}')`,
      `event_date <= toDate('${endDate}')`,
      `event_time >= toDateTime('${startUtc}', 'UTC')`,
      `event_time < toDateTime('${endUtc}', 'UTC')`,
      `type IN ('QueryFinish', 'ExceptionBeforeStart', 'ExceptionWhileProcessing')`,
      `initial_query_id = query_id`,
      `(
        upper(query) LIKE 'CREATE %'
        OR upper(query) LIKE 'DROP %'
        OR upper(query) LIKE 'ALTER %'
        OR upper(query) LIKE 'GRANT %'
        OR upper(query) LIKE 'REVOKE %'
        OR upper(query) LIKE 'TRUNCATE %'
        OR upper(query) LIKE 'RENAME %'
      )`,
      buildMonitoringQueryExclusion(),
      `query NOT LIKE '%INFORMATION_SCHEMA%'`,
    ];

    if (queryType && queryType !== "all") {
      whereConditions.push(`upper(query) LIKE '${queryType} %'`);
    }
    if (searchCondition) {
      whereConditions.push(searchCondition);
    }

    const totalQuery = `
      SELECT count() AS total
      FROM system.query_log
      WHERE ${whereConditions.join(" AND ")}
    `;
    const summaryQuery = `
      SELECT
        count() AS total,
        countIf(exception = '') AS success_count,
        countIf(exception != '') AS failed_count,
        countIf(type IN ('ExceptionBeforeStart', 'ExceptionWhileProcessing')) AS error_count,
        uniqExact(user) AS unique_users
      FROM system.query_log
      WHERE ${whereConditions.join(" AND ")}
    `;
    const totalRows = await executeClickHouseQuery<Record<string, unknown>>(cluster.id, totalQuery, undefined, userId);
    const total = Number(totalRows?.[0]?.total ?? 0);
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const currentPage = total === 0 ? 1 : Math.min(page, totalPages);
    const offset = (currentPage - 1) * pageSize;

    const itemsQuery = `
      SELECT
        query_id as id,
        event_time as timestamp,
        user as username,
        type as event_type,
        multiIf(
          upper(query) LIKE 'CREATE%', 'CREATE',
          upper(query) LIKE 'DROP%', 'DROP',
          upper(query) LIKE 'ALTER%', 'ALTER',
          upper(query) LIKE 'GRANT%', 'GRANT',
          upper(query) LIKE 'REVOKE%', 'REVOKE',
          upper(query) LIKE 'TRUNCATE%', 'TRUNCATE',
          upper(query) LIKE 'RENAME%', 'RENAME',
          'OTHER'
        ) as query_type,
        query,
        current_database as database,
        exception = '' as success,
        exception,
        query_duration_ms as duration_ms,
        hostname
      FROM system.query_log
      WHERE ${whereConditions.join(" AND ")}
      ORDER BY event_time DESC
      LIMIT ${pageSize} OFFSET ${offset}
    `;

    logger.debug(`[Audit API] Executing DDL audit query for cluster ${cluster.id}:`, itemsQuery.substring(0, 200));
    const [logs, summaryRows] = await Promise.all([
      executeClickHouseQuery<Record<string, unknown>>(cluster.id, itemsQuery, undefined, userId),
      executeClickHouseQuery<Record<string, unknown>>(cluster.id, summaryQuery, undefined, userId),
    ]);

    const items: AuditLogEntry[] = Array.isArray(logs)
      ? logs.map((log) => {
          const queryStr = String(log.query ?? "");
          const objectRef = parseDdlObjectReference(queryStr, String(log.database || "default"));

          return {
            id: String(log.id ?? ""),
            timestamp: log.timestamp,
            clusterId: cluster.id,
            clusterName: cluster.name,
            username: log.username || "System",
            queryType: log.query_type,
            eventType: log.event_type,
            query: log.query,
            database: objectRef.database,
            table: objectRef.table,
            success: log.success === 1 || log.success === true,
            exception: String(log.exception || ""),
            duration_ms: parseFloat(String(log.duration_ms)) || 0,
            hostname: log.hostname,
          };
        })
      : [];

    const summary = summaryRows?.[0] ?? {};

    return NextResponse.json({
      items,
      total,
      page: currentPage,
      pageSize,
      summary: {
        total: Number(summary.total ?? total),
        successCount: Number(summary.success_count ?? 0),
        failedCount: Number(summary.failed_count ?? 0),
        errorCount: Number(summary.error_count ?? 0),
        uniqueUsers: Number(summary.unique_users ?? 0),
      },
    });
  } catch (error) {
    if (error instanceof TimeseriesRangeError) {
      return NextResponse.json(
        { error: error.message, items: [], total: 0 },
        { status: 400 }
      );
    }

    logger.error("Failed to fetch CH audit logs:", error);
    return NextResponse.json(
      { error: "Failed to fetch audit logs", items: [], total: 0 },
      { status: 500 }
    );
  }
}, ["admin"]);
