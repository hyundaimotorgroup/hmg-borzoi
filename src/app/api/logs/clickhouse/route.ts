import { NextResponse } from "next/server";
import { executeClickHouseQuery } from "@/lib/clickhouse/index";
import {
  clusterSystemLogTableExpr,
  buildSystemLogPrewhere,
  escapeSqlString,
} from "@/lib/clickhouse/queries/helpers";
import { prisma } from "@/lib/prisma";
import { withRole } from "@/lib/auth/middleware";
import { hasClusterPermission } from "@/lib/auth/permissions";
import { logger } from "@/lib/utils/logger";
import { resolveTimeseriesRange, TimeseriesRangeError } from "@/lib/metrics/timeseries-range";

const KNOWN_TEXT_LOG_LEVELS = [
  "Fatal",
  "Critical",
  "Error",
  "Warning",
  "Information",
  "Debug",
  "Trace",
] as const;

const DEFAULT_TEXT_LOG_LEVELS = ["Fatal", "Critical", "Error", "Warning"];

const KNOWN_SESSION_EVENT_TYPES = [
  "LoginSuccess",
  "LoginFailure",
  "Logout",
] as const;

function normalizePositiveInteger(value: string | null, fallback: number): number {
  const parsed = Number.parseInt(value || "", 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return parsed;
}

function parseLevels(raw: string | null): string[] {
  if (!raw) return DEFAULT_TEXT_LOG_LEVELS;
  const parts = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => (KNOWN_TEXT_LOG_LEVELS as readonly string[]).includes(s));
  return parts.length > 0 ? parts : DEFAULT_TEXT_LOG_LEVELS;
}

function parseEventTypes(raw: string | null): string[] | null {
  if (!raw) return null;
  const parts = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => (KNOWN_SESSION_EVENT_TYPES as readonly string[]).includes(s));
  return parts.length > 0 ? parts : null;
}

function sqlInList(values: string[]): string {
  return values.map((v) => `'${escapeSqlString(v)}'`).join(", ");
}

/**
 * GET /api/logs/clickhouse
 * Unified ClickHouse server log query API.
 * Supports 4 log types: errors, text, session, crash
 */
export const GET = withRole(async (request, _context, user) => {
  try {

    const searchParams = request.nextUrl.searchParams;
    const clusterId = searchParams.get("clusterId");
    const type = searchParams.get("type") ?? "errors";
    const page = normalizePositiveInteger(searchParams.get("page"), 1);
    const pageSize = Math.min(
      normalizePositiveInteger(searchParams.get("pageSize"), 20),
      100
    );

    // --- No clusterId: return empty result for the given type ---
    if (!clusterId) {
      if (type === "errors" || type === "crash") {
        return NextResponse.json([]);
      }
      return NextResponse.json({ items: [], total: 0, page: 1, pageSize });
    }

    const cluster = await prisma.cluster.findUnique({ where: { id: clusterId } });
    if (!cluster) {
      return NextResponse.json({ error: "Cluster not found" }, { status: 404 });
    }

    if (!(await hasClusterPermission(user.id, clusterId))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // --- Determine time range (required for text & session; optional for others) ---
    const resolvedRange = resolveTimeseriesRange({
      mode: searchParams.get("mode"),
      preset: searchParams.get("preset"),
      from: searchParams.get("from"),
      to: searchParams.get("to"),
      timeRange: searchParams.get("timeRange"),
      timezone: searchParams.get("timezone"),
    });
    const startUtc = escapeSqlString(resolvedRange.startUtc);
    const endUtc = escapeSqlString(resolvedRange.endUtc);
    const startDate = startUtc.slice(0, 10);
    const endDate = endUtc.slice(0, 10);

    // -------------------------------------------------------------------------
    // Type: errors — system.errors (local table, no cluster expression)
    // -------------------------------------------------------------------------
    if (type === "errors") {
      const sql = `
SELECT
  name,
  code,
  value,
  last_error_time,
  last_error_message,
  remote
FROM system.errors
WHERE value > 0
ORDER BY value DESC, last_error_time DESC
`;
      const rows = await executeClickHouseQuery<Record<string, unknown>>(
        cluster.id,
        sql,
        undefined,
        undefined
      );
      return NextResponse.json(rows ?? []);
    }

    // -------------------------------------------------------------------------
    // Type: text — system.text_log (distributed via clusterAllReplicas)
    // -------------------------------------------------------------------------
    if (type === "text") {
      const levels = parseLevels(searchParams.get("levels"));
      const searchRaw = searchParams.get("search")?.trim().slice(0, 200) ?? "";

      const tableExpr = clusterSystemLogTableExpr("text_log");
      const prewhere = buildSystemLogPrewhere({
        startDateExpr: `toDate('${startDate}')`,
        endDateExpr: `toDate('${endDate}')`,
        startTimeExpr: `toDateTime('${startUtc}', 'UTC')`,
        endTimeExpr: `toDateTime('${endUtc}', 'UTC')`,
      });

      const componentRaw = searchParams.get("component")?.trim().slice(0, 200) ?? "";

      const whereConditions: string[] = [
        `level IN (${sqlInList(levels)})`,
      ];
      if (componentRaw) {
        whereConditions.push(
          `positionCaseInsensitiveUTF8(logger_name, '${escapeSqlString(componentRaw)}') > 0`
        );
      }
      if (searchRaw) {
        whereConditions.push(
          `positionCaseInsensitiveUTF8(message, '${escapeSqlString(searchRaw)}') > 0`
        );
      }

      const whereClause = whereConditions.join("\nAND ");

      const countQuery = `
SELECT count() AS total
FROM ${tableExpr}
${prewhere}
WHERE ${whereClause}
SETTINGS skip_unavailable_shards = 1
`;
      const offset = (page - 1) * pageSize;
      const itemsQuery = `
SELECT
  event_time,
  level,
  logger_name,
  message,
  thread_name,
  query_id,
  source_file,
  source_line,
  hostName() AS node
FROM ${tableExpr}
${prewhere}
WHERE ${whereClause}
ORDER BY event_time DESC
LIMIT ${pageSize} OFFSET ${offset}
SETTINGS skip_unavailable_shards = 1
`;

      const [countRows, itemRows] = await Promise.all([
        executeClickHouseQuery<Record<string, unknown>>(
          cluster.id,
          countQuery,
          undefined,
          undefined
        ),
        executeClickHouseQuery<Record<string, unknown>>(
          cluster.id,
          itemsQuery,
          undefined,
          undefined
        ),
      ]);

      const total = Number(countRows?.[0]?.total ?? 0);
      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      const currentPage = total === 0 ? 1 : Math.min(page, totalPages);

      return NextResponse.json({
        items: itemRows ?? [],
        total,
        page: currentPage,
        pageSize,
      });
    }

    // -------------------------------------------------------------------------
    // Type: session — system.session_log (distributed via clusterAllReplicas)
    // -------------------------------------------------------------------------
    if (type === "session") {
      const eventTypes = parseEventTypes(searchParams.get("eventTypes"));
      const userSearch = searchParams.get("user")?.trim().slice(0, 200) ?? "";

      // Build simple WHERE conditions (no PREWHERE, no clusterAllReplicas)
      const timeConditions = [
        `event_time >= toDateTime('${startUtc}', 'UTC')`,
        `event_time < toDateTime('${endUtc}', 'UTC')`,
      ];
      if (eventTypes && eventTypes.length > 0) {
        timeConditions.push(`type IN (${sqlInList(eventTypes)})`);
      }
      if (userSearch) {
        timeConditions.push(
          `positionCaseInsensitiveUTF8(user, '${escapeSqlString(userSearch)}') > 0`
        );
      }
      const whereClause = timeConditions.join("\nAND ");

      const countQuery = `SELECT count() AS total FROM system.session_log WHERE ${whereClause}`;
      const offset = (page - 1) * pageSize;
      const itemsQuery = `
SELECT
  event_time,
  toString(type) AS type,
  user,
  toString(client_address) AS client_address,
  client_name,
  hostName() AS node,
  toString(interface) AS interface,
  toString(auth_type) AS auth_type,
  failure_reason,
  toString(session_id) AS session_id
FROM system.session_log
WHERE ${whereClause}
ORDER BY event_time DESC
LIMIT ${pageSize} OFFSET ${offset}
`;

      const [countRows, itemRows] = await Promise.all([
        executeClickHouseQuery<Record<string, unknown>>(
          cluster.id, countQuery, undefined, undefined
        ),
        executeClickHouseQuery<Record<string, unknown>>(
          cluster.id, itemsQuery, undefined, undefined
        ),
      ]);

      const total = Number(countRows?.[0]?.total ?? 0);
      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      const currentPage = total === 0 ? 1 : Math.min(page, totalPages);

      return NextResponse.json({
        items: itemRows ?? [],
        total,
        page: currentPage,
        pageSize,
      });
    }

    // -------------------------------------------------------------------------
    // Type: crash — system.crash_log (local table, no cluster expression)
    // -------------------------------------------------------------------------
    if (type === "crash") {
      const sql = `
SELECT
  event_time,
  signal,
  thread_id,
  query_id,
  trace_full,
  version,
  revision,
  build_id
FROM system.crash_log
ORDER BY event_time DESC
LIMIT 100
`;
      const rows = await executeClickHouseQuery<Record<string, unknown>>(
        cluster.id,
        sql,
        undefined,
        undefined
      );
      return NextResponse.json(rows ?? []);
    }

    // Unknown type
    return NextResponse.json({ error: "Unknown log type" }, { status: 400 });
  } catch (error) {
    if (error instanceof TimeseriesRangeError) {
      return NextResponse.json(
        { error: error.message, items: [], total: 0 },
        { status: 400 }
      );
    }

    logger.error("Failed to fetch ClickHouse server logs:", error);
    return NextResponse.json(
      { error: "Failed to fetch server logs", items: [], total: 0 },
      { status: 500 }
    );
  }
}, ['admin']);
