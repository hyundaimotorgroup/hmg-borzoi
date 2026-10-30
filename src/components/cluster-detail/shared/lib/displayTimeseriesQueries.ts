import { resolveTimeseriesRange, type TimeseriesRangeSelection } from "@/lib/metrics/timeseries-range";
import { buildTimeseriesQuery } from "@/lib/clickhouse/queries/timeseries";

function resolveDisplayRange(timeRange: TimeseriesRangeSelection, timezone: string) {
  if (typeof timeRange === "string") {
    return resolveTimeseriesRange({ timeRange, timezone });
  }

  if (timeRange.mode === "relative") {
    return resolveTimeseriesRange({ mode: "relative", preset: timeRange.preset, timezone });
  }

  return resolveTimeseriesRange({
    mode: "absolute",
    from: timeRange.from,
    to: timeRange.to,
    timezone,
  });
}

function buildLogPrewhere(startUtc: string, endUtc: string): string {
  const s = startUtc.slice(0, 10);
  const e = endUtc.slice(0, 10);
  return `PREWHERE event_date BETWEEN toDate('${s}') AND toDate('${e}')
       AND event_time BETWEEN toDateTime('${startUtc}', 'UTC')
                          AND toDateTime('${endUtc}', 'UTC')`;
}

export function buildQueriesPanelDisplayQueries(timeRange: TimeseriesRangeSelection, timezone: string) {
  const resolved = resolveDisplayRange(timeRange, timezone);
  const prewhere = buildLogPrewhere(resolved.startUtc, resolved.endUtc);

  const failedQueries = `SELECT
  query_id, user, hostname, type,
  exception, exception_code,
  query_duration_ms, memory_usage,
  formatReadableSize(memory_usage) AS readable_memory_usage,
  event_time, query
FROM (
  SELECT *,
    row_number() OVER (
      PARTITION BY user ORDER BY event_time DESC, query_id DESC
    ) AS rn
  FROM clusterAllReplicas(
    (SELECT cluster FROM system.clusters WHERE is_local = 1 LIMIT 1),
    merge('system', '^query_log(_\\d+)?$')
  )
  ${prewhere}
  WHERE type IN ('ExceptionBeforeStart', 'ExceptionWhileProcessing')
    AND query NOT LIKE '%system.query_log%'
    AND query NOT LIKE '%system.metric_log%'
    AND initial_query_id = query_id
)
WHERE rn <= 100
ORDER BY user ASC, event_time DESC
SETTINGS skip_unavailable_shards = 1`;

  const queryDistribution = `-- query_log: merge() combines sharded log tables (query_log, query_log_0, ...)
-- processes: real-time view of currently running queries

SELECT
  node, user, client_hostname,
  sum(query_count)      AS query_count,
  sum(running_count)    AS running_count,
  round(avg(avg_ms), 2) AS avg_ms
FROM (
  SELECT
    hostname              AS node,
    user, client_hostname,
    count()               AS query_count,
    0                     AS running_count,
    avg(query_duration_ms) AS avg_ms
  FROM clusterAllReplicas(
    (SELECT cluster FROM system.clusters WHERE is_local = 1 LIMIT 1),
    merge('system', '^query_log(_\\d+)?$')
  )
  ${prewhere}
  WHERE type = 'QueryFinish'
    AND initial_query_id = query_id
  GROUP BY node, user, client_hostname

  UNION ALL

  SELECT
    hostName()            AS node,
    user, client_hostname,
    0                     AS query_count,
    count()               AS running_count,
    avg(elapsed * 1000)   AS avg_ms
  FROM clusterAllReplicas(
    (SELECT cluster FROM system.clusters WHERE is_local = 1 LIMIT 1),
    system.processes
  )
  WHERE initial_query_id = query_id
  GROUP BY node, user, client_hostname
)
GROUP BY node, user, client_hostname
ORDER BY (query_count + running_count) DESC
LIMIT 100
SETTINGS skip_unavailable_shards = 1`;

  return { failedQueries, queryDistribution };
}

function getDisplayQuery(metric: string, timeRange: ReturnType<typeof resolveDisplayRange>) {
  return buildTimeseriesQuery(metric, timeRange).query;
}

export function buildHealthChartQueries(timeRange: TimeseriesRangeSelection, timezone: string) {
  const resolved = resolveDisplayRange(timeRange, timezone);

  return {
    httpConnections: getDisplayQuery("httpConnections", resolved),
    tcpConnections: getDisplayQuery("tcpConnections", resolved),
    interserverConnections: getDisplayQuery("interserverConnections", resolved),
    errorLog: getDisplayQuery("connectionErrors", resolved),
    keeperSessions: getDisplayQuery("keeperSessions", resolved),
    keeperRequests: getDisplayQuery("keeperRequests", resolved),
    keeperExceptions: getDisplayQuery("keeperExceptions", resolved),
  };
}

export function buildQueriesChartQueries(timeRange: TimeseriesRangeSelection, timezone: string) {
  const resolved = resolveDisplayRange(timeRange, timezone);

  return {
    successQueries: getDisplayQuery("successQueries", resolved),
    failedQueries: getDisplayQuery("failedQueries", resolved),
    queryMemoryUsage: getDisplayQuery("queryMemoryUsage", resolved),
    queryDuration: getDisplayQuery("queryDuration", resolved),
    queryType: getDisplayQuery("queryType", resolved),
    readThroughput: getDisplayQuery("readThroughput", resolved),
    writeThroughput: getDisplayQuery("writeThroughput", resolved),
    readRowCount: getDisplayQuery("readRowCount", resolved),
    writeRowCount: getDisplayQuery("writeRowCount", resolved),
    queryQueue: getDisplayQuery("queryQueue", resolved),
    currentQueryMemory: getDisplayQuery("currentQueryMemory", resolved),
  };
}

export function buildStorageChartQueries(timeRange: TimeseriesRangeSelection, timezone: string) {
  const resolved = resolveDisplayRange(timeRange, timezone);

  return {
    freeDiskSpace: getDisplayQuery("freeDiskSpace", resolved),
    diskIO: getDisplayQuery("diskIO", resolved),
    partsCount: getDisplayQuery("partsCount", resolved),
    insertRateRows: getDisplayQuery("insertRateRows", resolved),
    mergeRateRows: getDisplayQuery("mergeRateRows", resolved),
  };
}

export function buildOperationsChartQueries(timeRange: TimeseriesRangeSelection, timezone: string) {
  const resolved = resolveDisplayRange(timeRange, timezone);

  return {
    activeMerges: getDisplayQuery("activeMerges", resolved),
    mergeBytes: getDisplayQuery("mergeBytes", resolved),
    activeMutations: getDisplayQuery("activeMutations", resolved),
    mutationBytes: getDisplayQuery("mutationBytes", resolved),
    distributionQueue: getDisplayQuery("distributionQueue", resolved),
    replicationLag: getDisplayQuery("replicationLag", resolved),
    replicationQueue: getDisplayQuery("replicationQueue", resolved),
  };
}

export function buildOverviewNodeChartQueries(timeRange: TimeseriesRangeSelection, timezone: string) {
  const resolved = resolveDisplayRange(timeRange, timezone);

  return {
    memory: getDisplayQuery("memory", resolved),
    cpu: getDisplayQuery("cpu", resolved),
    currentQueryMemory: getDisplayQuery("currentQueryMemory", resolved),
    distributionQueue: getDisplayQuery("distributionQueue", resolved),
    httpConnections: getDisplayQuery("httpConnections", resolved),
    tcpConnections: getDisplayQuery("tcpConnections", resolved),
    disk: getDisplayQuery("disk", resolved),
    partsCount: getDisplayQuery("partsCount", resolved),
    network: getDisplayQuery("network", resolved),
    fileDescriptors: getDisplayQuery("fileDescriptors", resolved),
    backgroundPool: getDisplayQuery("backgroundPool", resolved),
  };
}

export function buildUserStatsDisplayQueries(timeRange: TimeseriesRangeSelection, timezone: string) {
  const resolved = resolveDisplayRange(timeRange, timezone);
  const { startUtc, endUtc, intervalSeconds } = resolved;
  const startDate = startUtc.slice(0, 10);
  const endDate = endUtc.slice(0, 10);

  const prewhere = `PREWHERE event_date BETWEEN toDate('${startDate}') AND toDate('${endDate}')
       AND event_time BETWEEN toDateTime('${startUtc}', 'UTC')
                          AND toDateTime('${endUtc}', 'UTC')`;

  const filteredCte = `
  SELECT
    event_time, user, query_duration_ms, memory_usage,
    read_rows, type, initial_query_id = query_id AS is_initial
  FROM clusterAllReplicas(
    (SELECT cluster FROM system.clusters WHERE is_local = 1 LIMIT 1),
    merge('system', '^query_log(_\\d+)?$')
  )
  ${prewhere}`;

  const topUsers = `WITH filtered AS (${filteredCte}
)
SELECT
  user,
  countIf(type = 'QueryFinish' AND is_initial)                                         AS initial_queries,
  countIf(type = 'QueryFinish')                                                         AS executed_on_nodes,
  round(avgIf(query_duration_ms, type = 'QueryFinish' AND is_initial) / 1000, 3)        AS avg_duration_sec,
  sumIf(read_rows,    type = 'QueryFinish' AND is_initial)                               AS total_rows,
  round(sumIf(memory_usage, type = 'QueryFinish' AND is_initial) / 1024 / 1024, 2)      AS total_memory_mb,
  countIf(type IN ('ExceptionBeforeStart','ExceptionWhileProcessing') AND is_initial)   AS failed
FROM filtered
GROUP BY user
ORDER BY initial_queries DESC
LIMIT 10
SETTINGS skip_unavailable_shards = 1`;

  const queryCountByUser = `WITH filtered AS (${filteredCte}
)
SELECT
  user,
  countIf(type = 'QueryFinish' AND is_initial) AS queries
FROM filtered
GROUP BY user
ORDER BY queries DESC
LIMIT 10
SETTINGS skip_unavailable_shards = 1`;

  const queryTrend = `-- top 3 users by initial query count within the time range
WITH
  filtered AS (${filteredCte}
  ),
  top_users AS (
    SELECT user
    FROM filtered
    WHERE type = 'QueryFinish' AND is_initial
    GROUP BY user
    ORDER BY count() DESC
    LIMIT 3
  )
SELECT
  toStartOfInterval(event_time, INTERVAL ${intervalSeconds} SECOND) AS time,
  user,
  countIf(type = 'QueryFinish') AS queries
FROM filtered
WHERE is_initial
  AND user IN (SELECT user FROM top_users)
GROUP BY time, user
ORDER BY time
SETTINGS skip_unavailable_shards = 1`;

  const avgDuration = `WITH filtered AS (${filteredCte}
)
SELECT
  user,
  round(avgIf(query_duration_ms, type = 'QueryFinish' AND is_initial) / 1000, 3) AS avg_duration_sec
FROM filtered
GROUP BY user
ORDER BY avg_duration_sec DESC
LIMIT 10
SETTINGS skip_unavailable_shards = 1`;

  const memoryUsage = `-- top 3 users by initial query count within the time range
WITH
  filtered AS (${filteredCte}
  ),
  top_users AS (
    SELECT user
    FROM filtered
    WHERE type = 'QueryFinish' AND is_initial
    GROUP BY user
    ORDER BY count() DESC
    LIMIT 3
  )
SELECT
  toStartOfInterval(event_time, INTERVAL ${intervalSeconds} SECOND) AS time,
  user,
  round(sumIf(memory_usage, type = 'QueryFinish') / 1024 / 1024, 2) AS memory_mb
FROM filtered
WHERE is_initial
  AND user IN (SELECT user FROM top_users)
GROUP BY time, user
ORDER BY time, user
SETTINGS skip_unavailable_shards = 1`;

  const readRows = `-- top 3 users by initial query count within the time range
WITH
  filtered AS (${filteredCte}
  ),
  top_users AS (
    SELECT user
    FROM filtered
    WHERE type = 'QueryFinish' AND is_initial
    GROUP BY user
    ORDER BY count() DESC
    LIMIT 3
  )
SELECT
  toDate(event_time) AS date,
  user,
  sumIf(read_rows, type = 'QueryFinish' AND is_initial) AS total_rows
FROM filtered
WHERE user IN (SELECT user FROM top_users)
GROUP BY date, user
ORDER BY date, user
SETTINGS skip_unavailable_shards = 1`;

  return { topUsers, queryCountByUser, queryTrend, avgDuration, memoryUsage, readRows };
}
