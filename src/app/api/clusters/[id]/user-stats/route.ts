import { logger } from "@/lib/utils/logger";
import { NextRequest, NextResponse } from "next/server";
import { executeClickHouseQuery } from "@/lib/clickhouse/index";
import { withClusterAccess } from "@/lib/auth/middleware";
import { buildSystemLogPrewhere, clusterSystemLogTableExpr } from "@/lib/clickhouse/queries/helpers";
import { resolveTimeseriesRange, TimeseriesRangeError } from "@/lib/metrics/timeseries-range";

function toClickHouseStringLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

type UserSummaryRow = {
  user: string;
  initial_queries: number | string;
  executed_queries: number | string;
  avgDuration: number | string | null;
  totalRows: number | string | null;
  avgMemoryMB: number | string | null;
  lastActive: string | null;
  failed: number | string;
  total: number | string;
};


type TimeBucketRow = {
  time: string;
  user: string;
  queries: number | string;
  avgMemoryMB: number | string | null;
};

type ReadRowsRow = {
  date: string;
  user: string;
  totalRows: number | string;
};

function toNumber(value: number | string | null | undefined): number {
  if (value == null) {
    return 0;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * GET /api/clusters/[id]/user-stats
 * (cluster)
 * Query parameters: timeRange (time unit)
 */
export const GET = withClusterAccess(
  async (request: NextRequest, { params }, user) => {
    try {
      const { id: clusterId } = await params;
      const { searchParams } = request.nextUrl;
      const resolvedRange = resolveTimeseriesRange({
        mode: searchParams.get('mode'),
        preset: searchParams.get('preset'),
        from: searchParams.get('from'),
        to: searchParams.get('to'),
        timeRange: searchParams.get('timeRange'),
        timezone: searchParams.get('timezone'),
      });

      const userId = user?.id;

      if (!userId) {
        return NextResponse.json(
          { error: 'User not authenticated' },
          { status: 401 }
        );
      }

      const startDateStr = resolvedRange.startUtc.substring(0, 10);
      const endDateStr = resolvedRange.endUtc.substring(0, 10);
      const startTimeStr = resolvedRange.startUtc;
      const endTimeStr = resolvedRange.endUtc;
      const intervalSeconds = resolvedRange.intervalSeconds;
      const queryLogExpr = clusterSystemLogTableExpr('query_log');
      const queryLogPrewhere = buildSystemLogPrewhere({
        startDateExpr: `toDate('${startDateStr}')`,
        endDateExpr: `toDate('${endDateStr}')`,
        startTimeExpr: `toDateTime('${startTimeStr}')`,
        endTimeExpr: `toDateTime('${endTimeStr}')`,
      });
      const filteredQueryLog = `
        SELECT
          event_time,
          user,
          query_duration_ms,
          memory_usage,
          read_rows,
          query_kind,
          type,
          initial_query_id = query_id AS is_initial
        FROM ${queryLogExpr}
        ${queryLogPrewhere}
      `;

      const userSummaryQuery = `
        WITH filtered_query_log AS (${filteredQueryLog})
        SELECT
          user,
          countIf(type = 'QueryFinish' AND is_initial) AS initial_queries,
          countIf(type = 'QueryFinish')                AS executed_queries,
          avgIf(query_duration_ms, type = 'QueryFinish' AND is_initial) / 1000 AS avgDuration,
          sumIf(read_rows,    type = 'QueryFinish' AND is_initial) AS totalRows,
          sumIf(memory_usage, type = 'QueryFinish' AND is_initial) / 1024 / 1024 AS avgMemoryMB,
          maxIf(event_time,   type = 'QueryFinish' AND is_initial) AS lastActive,
          countIf(type IN ('ExceptionBeforeStart','ExceptionWhileProcessing') AND is_initial) AS failed,
          countIf(is_initial) AS total
        FROM filtered_query_log
        GROUP BY user
        SETTINGS skip_unavailable_shards = 1, max_threads = 2
      `;

      // Query type distribution — initial queries only (from the user submission perspective)
      const queryTypeQuery = `
        WITH filtered_query_log AS (${filteredQueryLog})
        SELECT
          query_kind AS type,
          count() AS count
        FROM filtered_query_log
        WHERE type = 'QueryFinish'
          AND is_initial
        GROUP BY type
        ORDER BY count DESC
        LIMIT 10
        SETTINGS skip_unavailable_shards = 1, max_threads = 2
      `;

      const [
        userSummary,
        queryType,
      ] = await Promise.all([
        executeClickHouseQuery<UserSummaryRow>(clusterId, userSummaryQuery, undefined, userId, { label: 'userStats.userSummary' }),
        executeClickHouseQuery<{ type: string; count: number | string }>(clusterId, queryTypeQuery, undefined, userId, { label: 'userStats.queryType' }),
      ]);

      const userSummaryRows = (userSummary || []).map((entry) => ({
        ...entry,
        initialQueries: toNumber(entry.initial_queries),
        executedQueries: toNumber(entry.executed_queries),
        avgDuration: toNumber(entry.avgDuration),
        totalRows: toNumber(entry.totalRows),
        avgMemoryMB: toNumber(entry.avgMemoryMB),
        failed: toNumber(entry.failed),
        total: toNumber(entry.total),
      }));

      const sortedByQueries = [...userSummaryRows]
        .filter((entry) => entry.initialQueries > 0)
        .sort((left, right) => right.initialQueries - left.initialQueries);

      const queryCountByUser = sortedByQueries
        .slice(0, 10)
        .map(({ user, initialQueries }) => ({ user, queries: initialQueries }));

      const avgDuration = [...userSummaryRows]
        .filter((entry) => entry.initialQueries > 0)
        .sort((left, right) => right.avgDuration - left.avgDuration)
        .slice(0, 10)
        .map(({ user, avgDuration }) => ({ user, avgDuration }));

      const topUsers = sortedByQueries
        .slice(0, 10)
        .map(({ user, initialQueries, executedQueries, avgDuration, totalRows, avgMemoryMB, lastActive }) => ({
          user,
          initialQueries,
          executedQueries,
          avgDuration,
          totalRows,
          avgMemoryMB,
          lastActive,
        }));

      const failedQueries = userSummaryRows
        .filter((entry) => entry.failed > 0 && entry.total > 0)
        .map(({ user, failed, total, initialQueries, executedQueries }) => ({
          user,
          failed,
          total,
          initialQueries,
          executedQueries,
          rate: (failed / total) * 100,
        }))
        .sort((left, right) => right.rate - left.rate)
        .slice(0, 10);

      const topUsersFilterValues = queryCountByUser
        .map((entry: { user?: string }) => entry.user)
        .filter((value): value is string => Boolean(value))
        .slice(0, 3)
        .map(toClickHouseStringLiteral);

      const topUsersFilterClause = topUsersFilterValues.length > 0
        ? `AND user IN (${topUsersFilterValues.join(', ')})`
        : 'AND 1 = 0';

      const queryTrendQuery = `
        WITH filtered_query_log AS (${filteredQueryLog})
        SELECT
          toStartOfInterval(event_time, INTERVAL ${intervalSeconds} SECOND) AS time,
          user,
          countIf(type = 'QueryFinish') AS queries,
          sumIf(memory_usage, type = 'QueryFinish') / 1024 / 1024 AS avgMemoryMB
        FROM filtered_query_log
        WHERE type = 'QueryFinish'
          AND is_initial
          ${topUsersFilterClause}
        GROUP BY time, user
        ORDER BY time
        SETTINGS skip_unavailable_shards = 1, max_threads = 2
      `;

      const readRowsQuery = `
        WITH filtered_query_log AS (${filteredQueryLog})
        SELECT
          toDate(event_time) AS date,
          user,
          sum(read_rows) AS totalRows
        FROM filtered_query_log
        WHERE type = 'QueryFinish'
          AND is_initial
          ${topUsersFilterClause}
        GROUP BY date, user
        ORDER BY date
        SETTINGS skip_unavailable_shards = 1, max_threads = 2
      `;

      const [timeBuckets, readRows] = topUsersFilterValues.length > 0
        ? await Promise.all([
            executeClickHouseQuery<TimeBucketRow>(clusterId, queryTrendQuery, undefined, userId, { label: 'userStats.timeBuckets' }),
            executeClickHouseQuery<ReadRowsRow>(clusterId, readRowsQuery, undefined, userId, { label: 'userStats.readRows' }),
          ])
        : [[], []];

      const queryTrend = (timeBuckets || []).map(({ time, user, queries }) => ({
        time,
        user,
        queries: toNumber(queries),
      }));

      const memoryUsage = (timeBuckets || []).map(({ time, user, avgMemoryMB }) => ({
        time,
        user,
        avgMemoryMB: toNumber(avgMemoryMB),
      }));

      const readRowsSeries = (readRows || []).map(({ date, user, totalRows }) => ({
        date,
        user,
        totalRows: toNumber(totalRows),
      }));

 // ClickHouse /System (AsyncInsertFlush ) user .
 // topUsersFilterValues/ ,
 // "System" .
      const labelUser = <T extends { user: string }>(rows: T[]): T[] =>
        rows.map((row) => (row.user ? row : { ...row, user: "System" }));

      return NextResponse.json({
        range: resolvedRange.selection,
        from: resolvedRange.startUtc,
        to: resolvedRange.endUtc,
        intervalSeconds: resolvedRange.intervalSeconds,
        queryCountByUser: labelUser(queryCountByUser),
        queryTrend: labelUser(queryTrend || []),
        avgDuration: labelUser(avgDuration),
        memoryUsage: labelUser(memoryUsage),
        readRows: labelUser(readRowsSeries),
        queryType: queryType || [],
        topUsers: labelUser(topUsers),
        failedQueries: labelUser(failedQueries),
      });
    } catch (error) {
      logger.error("Failed to fetch user statistics:", error);
      if (error instanceof TimeseriesRangeError) {
        return NextResponse.json(
          { error: error.message },
          { status: 400 }
        );
      }

      return NextResponse.json(
        { error: "Failed to fetch user statistics", details: error instanceof Error ? error.message : String(error) },
        { status: 500 }
      );
    }
  }
);
