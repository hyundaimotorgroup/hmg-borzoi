import type { ResolvedTimeseriesRange } from '@/lib/metrics/timeseries-range';
import {
  buildMonitoringQueryExclusion,
  buildSystemLogPrewhere,
  clusterSystemLogTableExpr,
  escapeSqlString,
} from './helpers';

const BROKEN_PART_CONDITION = `reason ILIKE '%broken%' OR reason ILIKE '%corrupt%' OR reason ILIKE '%checksum%'`;

type TimeseriesWindow = Pick<ResolvedTimeseriesRange, 'startUtc' | 'endUtc'>;
type RecentQueryOptions = {
  limit?: number;
  offset?: number;
  searchTerm?: string;
};

function buildTimeWindowPrewhere(window: TimeseriesWindow): string {
  const startUtc = escapeSqlString(window.startUtc);
  const endUtc = escapeSqlString(window.endUtc);
  const startDate = startUtc.slice(0, 10);
  const endDate = endUtc.slice(0, 10);

  return buildSystemLogPrewhere({
    startDateExpr: `toDate('${startDate}')`,
    endDateExpr: `toDate('${endDate}')`,
    startTimeExpr: `toDateTime('${startUtc}', 'UTC')`,
    endTimeExpr: `toDateTime('${endUtc}', 'UTC')`,
  });
}

function buildRecentQuerySearchFilter(searchTerm?: string): string {
  const normalized = searchTerm?.trim();
  if (!normalized) return "";

  const escaped = escapeSqlString(normalized);
  return `
      AND (
        positionCaseInsensitiveUTF8(query_id, '${escaped}') > 0
        OR positionCaseInsensitiveUTF8(user, '${escaped}') > 0
        OR positionCaseInsensitiveUTF8(query, '${escaped}') > 0
      )`;
}

const LAST_MINUTE_EVENT_LOG_PREWHERE = buildSystemLogPrewhere({
  startDateExpr: 'toDate(now() - INTERVAL 1 DAY)',
  startTimeExpr: 'now() - INTERVAL 1 MINUTE',
});

const LAST_SEVEN_DAYS_EVENT_LOG_PREWHERE = buildSystemLogPrewhere({
  startDateExpr: 'toDate(now() - INTERVAL 7 DAY)',
  startTimeExpr: 'now() - INTERVAL 7 DAY',
});

const LAST_MINUTE_METRIC_LOG_BOUNDED_PREWHERE = buildSystemLogPrewhere({
  startDateExpr: 'today()',
  startTimeExpr: 'now() - INTERVAL 1 MINUTE',
  endTimeExpr: 'now()',
});

/**
 * Real-time snapshot queries
 * A collection of queries for retrieving the current state of the cluster
 *
 * Classified by tab:
 * - Overview tab: Key system metrics
 * - Queries tab: Query execution metrics
 * - Operations tab: Replication, merge, and mutation metrics
 * - Storage tab: Storage and parts metrics
 * - Health tab: Connection and Keeper metrics
 * - Common: Cluster info and shared metrics
 */

export const SnapshotQueries = {
  // ========== Common: Cluster info and shared metrics ==========

  /**
   * Number of cluster nodes
   * - Count of unique host names with duplicates removed
   */
  getNodeCount: () => `
    SELECT count(DISTINCT host_name) AS node_count
    FROM clusterAllReplicas(
      (SELECT cluster FROM system.clusters WHERE is_local = 1 LIMIT 1),
      system.clusters
    )
    WHERE cluster = (SELECT cluster FROM system.clusters WHERE is_local = 1 LIMIT 1)
    SETTINGS skip_unavailable_shards = 1
  `,

  /**
   * Node details (IP, port, shard, replica)
   * - Basic info from system.clusters + runtime hostname lookup
   * - Deduplication via GROUP BY
   */
  getNodesDetail: () => `
    SELECT
      host_name,
      any(host_address) as host_address,
      anyIf(hostName(), is_local = 1) as runtime_host_name,
      any(port) as port,
      any(shard_num) as shard_num,
      any(replica_num) as replica_num
    FROM clusterAllReplicas(
      (SELECT cluster FROM system.clusters WHERE is_local = 1 LIMIT 1),
      system.clusters
    )
    WHERE cluster = (SELECT cluster FROM system.clusters WHERE is_local = 1 LIMIT 1)
    GROUP BY host_name
    ORDER BY shard_num, replica_num, host_name
    SETTINGS skip_unavailable_shards = 1
  `,

  /**
   * Version and uptime info per node
   * - Retrieves version and uptime from each node
   */
  getNodesVersionUptime: () => `
    SELECT
      splitByChar('.', hostName())[1] as host_name,
      version() as version,
      (SELECT value FROM system.asynchronous_metrics WHERE metric = 'Uptime') as uptime_seconds
    FROM clusterAllReplicas(
      (SELECT cluster FROM system.clusters WHERE is_local = 1 LIMIT 1),
      system.one
    )
    GROUP BY host_name
    SETTINGS skip_unavailable_shards = 1
  `,

  // ========== Overview tab: System resource metrics ==========

  /**
   * Disk usage snapshot (TB) - based on system.disks (for snapshot purposes)
   * - unreserved_space is affected by reservations/policies; use with caution as an absolute KPI
   */
  getDiskUsage: () => `
  SELECT
    round(sum(used_bytes) / 1024 / 1024 / 1024 / 1024, 2) AS used_tb,
    round(sum(total_bytes) / 1024 / 1024 / 1024 / 1024, 2) AS total_tb,
    round(sum(used_bytes) / if(sum(total_bytes)=0, NULL, sum(total_bytes)) * 100, 2) AS usage_percent
  FROM
  (
    SELECT
      name AS disk_name,
      hostName() AS host_name,
      max(total_space) AS total_bytes,
      max(total_space - unreserved_space) AS used_bytes
    FROM clusterAllReplicas(
      (SELECT cluster FROM system.clusters WHERE is_local = 1 LIMIT 1),
      system.disks
    )
    GROUP BY disk_name, host_name
  )
  `,

  getAsyncMetricsOverviewSummary: () => `
    SELECT
      round(sum(memory_used) / nullIf(sum(memory_total), 0) * 100, 2) AS usage_percent,
      COALESCE(round(avg(free_disk_space_percent), 2), 0) AS free_disk_space_percent,
      toFloat64(COALESCE(max(replication_lag_value), 0)) AS max_lag_seconds,
      toUInt64(COALESCE(sum(replication_queue_value), 0)) AS replication_queue_count,
      COALESCE(round(100 - (avg(cpu_idle_ratio) * 100), 2), 0) AS cpu_usage_percent
    FROM (
      SELECT
        hostname() as node,
        maxIf(value, metric = 'MemoryResident') as memory_used,
        maxIf(value, metric = 'OSMemoryTotal') as memory_total,
        round(
          100 - (
            maxIf(value, metric = 'FilesystemMainPathUsedBytes') /
            nullIf(maxIf(value, metric = 'FilesystemMainPathTotalBytes'), 0) * 100
          ),
          2
        ) as free_disk_space_percent,
        maxIf(value, metric = 'ReplicasMaxAbsoluteDelay') as replication_lag_value,
        maxIf(value, metric = 'ReplicasSumQueueSize') as replication_queue_value,
        avgIf(value, metric LIKE 'OSIdleTimeCPU%') as cpu_idle_ratio
      FROM clusterAllReplicas(
        (SELECT cluster FROM system.clusters WHERE is_local = 1 LIMIT 1),
        system.asynchronous_metrics
      )
      WHERE metric IN (
        'MemoryResident',
        'OSMemoryTotal',
        'FilesystemMainPathUsedBytes',
        'FilesystemMainPathTotalBytes',
        'ReplicasMaxAbsoluteDelay',
        'ReplicasSumQueueSize'
      )
      OR metric LIKE 'OSIdleTimeCPU%'
      GROUP BY node
    )
    SETTINGS skip_unavailable_shards = 1
  `,

  getAsyncMetricsOverviewMinimal: () => `
    SELECT
      round(sum(memory_used) / nullIf(sum(memory_total), 0) * 100, 2) AS usage_percent,
      toFloat64(COALESCE(max(replication_lag_value), 0)) AS max_lag_seconds,
      COALESCE(round(100 - (avg(cpu_idle_ratio) * 100), 2), 0) AS cpu_usage_percent
    FROM (
      SELECT
        hostname() as node,
        maxIf(value, metric = 'MemoryResident') as memory_used,
        maxIf(value, metric = 'OSMemoryTotal') as memory_total,
        maxIf(value, metric = 'ReplicasMaxAbsoluteDelay') as replication_lag_value,
        avgIf(value, metric LIKE 'OSIdleTimeCPU%') as cpu_idle_ratio
      FROM clusterAllReplicas(
        (SELECT cluster FROM system.clusters WHERE is_local = 1 LIMIT 1),
        system.asynchronous_metrics
      )
      WHERE metric IN ('MemoryResident', 'OSMemoryTotal', 'ReplicasMaxAbsoluteDelay')
         OR metric LIKE 'OSIdleTimeCPU%'
      GROUP BY node
    )
    SETTINGS skip_unavailable_shards = 1
  `,

  getMetricLogOverviewSummary: () => `
    SELECT
      round(sum(cpu_cores), 3) AS cpu_cores,
      COALESCE(round(avg(read_bytes_per_sec), 2), 0) AS read_bytes_per_sec,
      COALESCE(round(avg(write_bytes_per_sec), 2), 0) AS write_bytes_per_sec,
      COALESCE(round(avg(disk_io_bytes_per_sec), 2), 0) AS disk_io_bytes_per_sec,
      COALESCE(round(sum(keeper_txns), 2), 0) AS keeper_requests
    FROM (
      SELECT
        hostname,
        sum(ProfileEvent_OSCPUVirtualTimeMicroseconds) / 1000000 / 60 AS cpu_cores,
        sum(ProfileEvent_SelectedBytes) / 60 AS read_bytes_per_sec,
        sum(ProfileEvent_InsertedBytes) / 60 AS write_bytes_per_sec,
        round((sum(ProfileEvent_OSReadBytes) + sum(ProfileEvent_OSWriteBytes)) / 60, 2) AS disk_io_bytes_per_sec,
        sum(ifNull(ProfileEvent_ZooKeeperTransactions, 0)) AS keeper_txns
      FROM ${clusterSystemLogTableExpr('metric_log')}
      ${LAST_MINUTE_METRIC_LOG_BOUNDED_PREWHERE}
      GROUP BY hostname
    )
    SETTINGS skip_unavailable_shards = 1
  `,

  getSystemMetricsOverviewSummary: () => `
    SELECT
      toUInt64(COALESCE(sumIf(value, metric = 'Merge'), 0)) AS active_merges,
      toUInt64(COALESCE(sumIf(value, metric = 'PartMutation'), 0)) AS active_mutations,
      toUInt64(COALESCE(sumIf(value, metric = 'DistributedFilesToInsert'), 0)) AS pending_distribution,
      round(avg(if(metric = 'MemoryTracking', value, NULL)), 2) AS current_query_memory_bytes,
      toUInt64(COALESCE(sumIf(value, metric = 'PartsActive'), 0)) AS parts_count,
      toUInt64(COALESCE(sumIf(value, metric = 'HTTPConnection'), 0)) AS http_connections,
      toUInt64(COALESCE(sumIf(value, metric = 'TCPConnection'), 0)) AS tcp_connections,
      toUInt64(COALESCE(sumIf(value, metric = 'InterserverConnection'), 0)) AS interserver_connections,
      toUInt64(COALESCE(sumIf(value, metric = 'ZooKeeperSession'), 0)) AS keeper_sessions,
      toUInt64(COALESCE(maxIf(value, metric = 'ZooKeeperSessionExpired'), 0)) AS keeper_exceptions
    FROM clusterAllReplicas(
      (SELECT cluster FROM system.clusters WHERE is_local = 1 LIMIT 1),
      system.metrics
    )
    WHERE metric IN (
      'Merge',
      'PartMutation',
      'DistributedFilesToInsert',
      'MemoryTracking',
      'PartsActive',
      'HTTPConnection',
      'TCPConnection',
      'InterserverConnection',
      'ZooKeeperSession',
      'ZooKeeperSessionExpired'
    )
    SETTINGS skip_unavailable_shards = 1
  `,

  getDetachedPartsOverviewSummary: () => `
    SELECT
      countIf(${BROKEN_PART_CONDITION}) AS broken_parts,
      count() AS detached_parts
    FROM clusterAllReplicas(
      (SELECT cluster FROM system.clusters WHERE is_local = 1 LIMIT 1),
      system.detached_parts
    )
    SETTINGS skip_unavailable_shards = 1
  `,

  // ========== Queries tab: Query execution metrics ==========

  /**
   * Number of running queries (entire cluster)
   * Includes all running queries including monitoring queries
   */
  getRunningQueries: () => `
  SELECT countDistinct(query_id) AS count
  FROM clusterAllReplicas(
    (SELECT cluster FROM system.clusters WHERE is_local = 1 LIMIT 1),
    system.processes
  )
  WHERE is_cancelled = 0
    AND query != ''
  SETTINGS skip_unavailable_shards = 1;
  `,

  /**
   * Running query details
   * - Query ID, user, query text, elapsed time, memory usage, etc.
   * - Sorted by elapsed time descending
   */
  getRunningQueriesDetail: () => `
    SELECT
      query_id,
      user,
      query,
      elapsed,
      read_rows,
      read_bytes,
      total_rows_approx,
      memory_usage,
      current_database,
      formatReadableTimeDelta(elapsed) AS elapsed_time,
      formatReadableSize(memory_usage) AS readable_memory_usage
    FROM clusterAllReplicas(
      (SELECT cluster FROM system.clusters WHERE is_local = 1 LIMIT 1),
      system.processes
    )
    WHERE is_cancelled = 0
    ORDER BY elapsed DESC
    SETTINGS skip_unavailable_shards = 1
  `,

  /**
   * Query failures - aggregated query failures across all cluster nodes
   * - Aggregates only ExceptionBeforeStart and ExceptionWhileProcessing types from system.query_log
   * - Returns occurrence count per exception_code, last occurrence time, and last error message
   * - Aggregates data from the last 7 days
   * - Excludes internal system queries (query_log, metric_log lookups)
   */
  getSystemErrors: () => `
    SELECT
      exception_code AS code,
      any(exception) AS name,
      count() AS value,
      max(event_time) AS last_error_time,
      argMax(exception, event_time) AS last_error_message
    FROM ${clusterSystemLogTableExpr('query_log')}
    ${LAST_SEVEN_DAYS_EVENT_LOG_PREWHERE}
    WHERE type IN ('ExceptionBeforeStart', 'ExceptionWhileProcessing')
      AND exception_code != 0
      AND ${buildMonitoringQueryExclusion()}
      AND initial_query_id = query_id
    GROUP BY exception_code
    ORDER BY value DESC, last_error_time DESC
    SETTINGS skip_unavailable_shards = 1
  `,

  /**
   * Recent query history
   * - List of queries executed within the recent time window (excluding system queries)
   * - Includes duration, read/write bytes, memory usage, exceptions, etc.
   */
  getRecentQueries: (
    window: TimeseriesWindow,
    { limit = 100, offset = 0, searchTerm }: RecentQueryOptions = {}
  ) => `
    SELECT
      query_id,
      user,
      query,
      type,
      query_duration_ms,
      read_rows,
      read_bytes,
      written_rows,
      written_bytes,
      result_rows,
      result_bytes,
      memory_usage,
      formatReadableSize(memory_usage) AS readable_memory_usage,
      exception,
      event_time
    FROM ${clusterSystemLogTableExpr('query_log')}
    ${buildTimeWindowPrewhere(window)}
    WHERE type IN ('QueryFinish', 'ExceptionBeforeStart', 'ExceptionWhileProcessing')
      AND initial_query_id = query_id
      AND ${buildMonitoringQueryExclusion()}
    ${buildRecentQuerySearchFilter(searchTerm)}
    ORDER BY event_time DESC
    LIMIT ${limit} OFFSET ${offset}
    SETTINGS skip_unavailable_shards = 1
  `,

  getRecentQueriesCount: (window: TimeseriesWindow, searchTerm?: string) => `
    SELECT count() AS total
    FROM ${clusterSystemLogTableExpr('query_log')}
    ${buildTimeWindowPrewhere(window)}
    WHERE type IN ('QueryFinish', 'ExceptionBeforeStart', 'ExceptionWhileProcessing')
      AND initial_query_id = query_id
      AND ${buildMonitoringQueryExclusion()}
    ${buildRecentQuerySearchFilter(searchTerm)}
    SETTINGS skip_unavailable_shards = 1
  `,

  /**
   * Detailed list of failed queries (entire cluster)
   * - ExceptionBeforeStart and ExceptionWhileProcessing types from system.query_log
   * - Configurable time range and per-user limit
   * - Only initial queries (subqueries excluded via initial_query_id = query_id)
   * - Returns the N most recent failed queries per user
   * - Includes query ID, user, query text, exception message, memory, duration, etc.
   */
  getFailedQueriesList: (window: TimeseriesWindow, limit: number = 100) => `
    SELECT
      query_id,
      initial_query_id,
      user,
      hostname,
      query,
      type,
      exception,
      exception_code,
      query_duration_ms,
      memory_usage,
      readable_memory_usage,
      event_time
    FROM (
      SELECT
        query_id,
        initial_query_id,
        user,
        hostname,
        query,
        type,
        exception,
        exception_code,
        query_duration_ms,
        memory_usage,
        formatReadableSize(memory_usage) AS readable_memory_usage,
        event_time,
        row_number() OVER (
          PARTITION BY user
          ORDER BY event_time DESC, query_id DESC
        ) AS user_row_number
      FROM ${clusterSystemLogTableExpr('query_log')}
      ${buildTimeWindowPrewhere(window)}
      WHERE type IN ('ExceptionBeforeStart', 'ExceptionWhileProcessing')
        AND ${buildMonitoringQueryExclusion()}
        AND initial_query_id = query_id
    )
    WHERE user_row_number <= ${limit}
    ORDER BY user ASC, event_time DESC, query_id DESC
    SETTINGS skip_unavailable_shards = 1
  `,

  /**
   * Query distribution by node/user/client
   * - system.query_log (finished) + system.processes (running) UNION
   * - Subqueries excluded (initial_query_id = query_id)
   */
  getQueryDistribution: (window: TimeseriesWindow) => `
    SELECT
      node,
      user,
      client_hostname,
      sum(query_count)   AS query_count,
      sum(running_count) AS running_count,
      round(avg(avg_ms), 2) AS avg_ms
    FROM (
      SELECT
        hostname          AS node,
        user,
        client_hostname,
        count()           AS query_count,
        0                 AS running_count,
        avg(query_duration_ms) AS avg_ms
      FROM ${clusterSystemLogTableExpr('query_log')}
      ${buildTimeWindowPrewhere(window)}
      WHERE type = 'QueryFinish'
        AND initial_query_id = query_id
      GROUP BY node, user, client_hostname

      UNION ALL

      SELECT
        hostName()        AS node,
        user,
        client_hostname,
        0                 AS query_count,
        count()           AS running_count,
        avg(elapsed * 1000) AS avg_ms
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
    SETTINGS skip_unavailable_shards = 1
  `,

  getQueryOverviewSummary: () => `
    SELECT
      COALESCE(round(sum(start_count) / 60, 2), 0) AS qps,
      COALESCE(round(avg(success_count), 2), 0) AS success_queries,
      COALESCE(round(avg(failed_count), 2), 0) AS failed_query_count,
      COALESCE(round(avg(avg_duration_ms), 2), 0) AS avg_duration_ms,
      COALESCE(round(avg(avg_query_memory_bytes), 2), 0) AS avg_query_memory_bytes
    FROM (
      SELECT
        hostname,
        countIf(type = 'QueryStart' AND initial_query_id = query_id) AS start_count,
        countIf(type = 'QueryFinish' AND initial_query_id = query_id) AS success_count,
        countIf(type IN ('ExceptionBeforeStart', 'ExceptionWhileProcessing') AND initial_query_id = query_id) AS failed_count,
        avgIf(query_duration_ms, type = 'QueryFinish' AND initial_query_id = query_id) AS avg_duration_ms,
        avgIf(memory_usage, type = 'QueryFinish' AND initial_query_id = query_id AND memory_usage > 0) AS avg_query_memory_bytes
      FROM ${clusterSystemLogTableExpr('query_log')}
      ${LAST_MINUTE_EVENT_LOG_PREWHERE}
      WHERE type IN ('QueryStart', 'QueryFinish', 'ExceptionBeforeStart', 'ExceptionWhileProcessing')
        AND ${buildMonitoringQueryExclusion()}
      GROUP BY hostname
    )
    SETTINGS skip_unavailable_shards = 1
  `,

  getQueryOverviewMinimal: () => `
    SELECT COALESCE(round(sum(start_count) / 60, 2), 0) AS qps
    FROM (
      SELECT
        hostname,
        countIf(type = 'QueryStart' AND initial_query_id = query_id) AS start_count
      FROM ${clusterSystemLogTableExpr('query_log')}
      ${LAST_MINUTE_EVENT_LOG_PREWHERE}
      WHERE type = 'QueryStart'
        AND ${buildMonitoringQueryExclusion()}
      GROUP BY hostname
    )
    SETTINGS skip_unavailable_shards = 1
  `,

  // ========== Operations tab: Replication, merge, and mutation metrics ==========

  /**
   * Details of problematic replicas
   * - Detects problem replicas by checking multiple conditions
   * - Displays violated condition status per condition
   */
  getBadReplicasDetail: () => `
    SELECT
      hostName() AS hostname,
      -- Node-level flags (identical for every table on this host). Aliased to
      -- a distinct name (not "is_readonly"/"is_session_expired") because
      -- ClickHouse's analyzer resolves a bare identifier in WHERE against a
      -- same-named SELECT-list alias when one exists, which would substitute
      -- the raw per-row column check below with this aggregate — producing
      -- "Aggregate function ... is found in WHERE" (ILLEGAL_AGGREGATION).
      max(is_readonly)        AS node_is_readonly,
      max(is_session_expired) AS node_is_session_expired,
      -- Table-level aggregates
      countIf(future_parts > 20)                                          AS tables_future_parts,
      countIf(parts_to_check > 10)                                        AS tables_parts_check,
      countIf(queue_size > 20)                                            AS tables_queue_backlog,
      countIf(inserts_in_queue > 10)                                      AS tables_insert_backlog,
      countIf(greatest(log_max_index - log_pointer + 1, 0) > 10)         AS tables_log_delay,
      countIf(absolute_delay >= 300)                                      AS tables_delay,
      max(absolute_delay)     AS max_absolute_delay,
      max(queue_size)         AS max_queue_size,
      -- How many tables on this replica have at least one issue
      countIf(
        is_readonly = 1
        OR is_session_expired = 1
        OR future_parts > 20
        OR parts_to_check > 10
        OR queue_size > 20
        OR inserts_in_queue > 10
        OR greatest(log_max_index - log_pointer + 1, 0) > 10
        OR absolute_delay >= 300
        OR total_replicas < 2
        OR active_replicas < total_replicas
      ) AS affected_tables,
      -- Issues summary string
      arrayStringConcat(
        arrayFilter(x -> x != '', [
          if(max(is_readonly) = 1,        'ReadOnly', ''),
          if(max(is_session_expired) = 1, 'SessionExpired', ''),
          if(countIf(future_parts > 20) > 0,                                        'FutureParts>20', ''),
          if(countIf(parts_to_check > 10) > 0,                                      'PartsToCheck>10', ''),
          if(countIf(queue_size > 20) > 0,                                          'QueueSize>20', ''),
          if(countIf(inserts_in_queue > 10) > 0,                                    'InsertsQueue>10', ''),
          if(countIf(greatest(log_max_index - log_pointer + 1, 0) > 10) > 0,       'LogDelay>10', ''),
          if(countIf(absolute_delay >= 300) > 0,                                    'AbsoluteDelay>=300', ''),
          if(min(total_replicas) < 2,                                               'LowReplicas', ''),
          if(min(active_replicas) < min(total_replicas),                            'InactiveReplicas', '')
        ]),
        ', '
      ) AS issues
    FROM clusterAllReplicas(
      (SELECT cluster FROM system.clusters WHERE is_local = 1 LIMIT 1),
      system.replicas
    )
    WHERE (
      is_readonly = 1
      OR is_session_expired = 1
      OR future_parts > 20
      OR parts_to_check > 10
      OR queue_size > 20
      OR inserts_in_queue > 10
      OR greatest(log_max_index - log_pointer + 1, 0) > 10
      OR absolute_delay >= 300
      OR total_replicas < 2
      OR active_replicas < total_replicas
    )
    GROUP BY hostname
    ORDER BY
      max(is_readonly) DESC,
      max(is_session_expired) DESC,
      length(issues) DESC,
      hostname
    LIMIT 50
    SETTINGS skip_unavailable_shards = 1
  `,

  // ========== Storage tab: Storage and parts metrics ==========

  /**
   * Parts status statistics (per node)
   * - Active/inactive part count and bytes
   * - Small parts ratio (under 10MB)
   * - Level-0 parts ratio
   * - Refcount info
   */
  getPartsStatus: () => `
    SELECT
      hostName() AS hostname,
      countIf(active = 1) AS active_parts,
      round(sumIf(bytes_on_disk, active = 1) / 1024 / 1024 / 1024, 2) AS active_bytes_gb,
      countIf(active = 1 AND bytes_on_disk < 10*1024*1024) AS small_parts_lt_10mb,
      round(small_parts_lt_10mb / nullIf(active_parts, 0), 4) AS small_parts_ratio,
      countIf(active = 1 AND level = 0) AS level0_parts,
      round(level0_parts / nullIf(active_parts, 0), 4) AS level0_ratio,
      countIf(active = 0) AS inactive_parts,
      max(refcount) AS max_refcount,
      countIf(refcount > 1) AS parts_refcount_gt_1
    FROM clusterAllReplicas(
      (SELECT cluster FROM system.clusters WHERE is_local = 1 LIMIT 1),
      system.parts
    )
    GROUP BY hostname
    ORDER BY hostname
    SETTINGS skip_unavailable_shards = 1
  `,

  /**
   * Detached parts summary (per node)
   * - Total number of detached parts
   * - Broken parts count and ratio
   */
  getDetachedPartsSummary: () => `
    SELECT
      hostName() AS hostname,
      count() AS total_detached,
      countIf(${BROKEN_PART_CONDITION}) AS broken_parts,
      round(broken_parts / nullIf(total_detached, 0), 4) AS broken_ratio
    FROM clusterAllReplicas(
      (SELECT cluster FROM system.clusters WHERE is_local = 1 LIMIT 1),
      system.detached_parts
    )
    GROUP BY hostname
    ORDER BY total_detached DESC
    SETTINGS skip_unavailable_shards = 1
  `,

  /**
   * Detached parts detail
   * - Aggregated by database/table/disk/reason
   * - Returns only the top 20 entries
   */
  getDetachedPartsDetail: () => `
    SELECT
      hostName() AS hostname,
      database,
      table,
      disk,
      reason,
      count() AS cnt
    FROM clusterAllReplicas(
      (SELECT cluster FROM system.clusters WHERE is_local = 1 LIMIT 1),
      system.detached_parts
    )
    GROUP BY hostname, database, table, disk, reason
    ORDER BY cnt DESC
    LIMIT 10
    SETTINGS skip_unavailable_shards = 1, max_threads = 2
  `,

  /**
   * Parts status per (node x database)
   * - All columns needed for expandable DB rows in the per-node parts status table
   * - Excludes system/information_schema databases
   */
  getPartsStatusByDb: () => `
    SELECT
      hostName() AS hostname,
      database,
      countIf(active = 1) AS active_parts,
      uniqExactIf(concat(table, '||', partition), active = 1) AS total_partitions,
      round(
        countIf(active = 1) / nullIf(
          uniqExactIf(concat(table, '||', partition), active = 1), 0
        ), 1
      ) AS avg_parts_per_partition,
      countIf(active = 1 AND level = 0) AS level0_parts,
      round(countIf(active = 1 AND level = 0) / nullIf(countIf(active = 1), 0), 4) AS level0_ratio,
      round(
        countIf(active = 1 AND bytes_on_disk < 10485760) / nullIf(countIf(active = 1), 0), 4
      ) AS small_parts_ratio,
      countIf(active = 0) AS inactive_parts,
      uniqExact(table) AS tables
    FROM clusterAllReplicas(
      (SELECT cluster FROM system.clusters WHERE is_local = 1 LIMIT 1),
      system.parts
    )
    WHERE database NOT IN ('system', 'information_schema', 'INFORMATION_SCHEMA')
    GROUP BY hostname, database
    ORDER BY hostname, active_parts DESC
    SETTINGS skip_unavailable_shards = 1
  `,

  /**
   * Detached/broken part count per (node x database)
   * - system.detached_parts has very little data, so it queries quickly
   * - Fetched separately from status-by-db and merged on the frontend
   */
  getDetachedPartsByDb: () => `
    SELECT
      hostName() AS hostname,
      database,
      count() AS total_detached,
      countIf(${BROKEN_PART_CONDITION}) AS broken_parts
    FROM clusterAllReplicas(
      (SELECT cluster FROM system.clusters WHERE is_local = 1 LIMIT 1),
      system.detached_parts
    )
    WHERE database NOT IN ('system', 'information_schema', 'INFORMATION_SCHEMA')
    GROUP BY hostname, database
    ORDER BY hostname, total_detached DESC
    SETTINGS skip_unavailable_shards = 1
  `,

  /**
   * Partition cardinality summary per node
   * - Total active parts, unique partition count, average parts per partition, level-0 ratio
   * - Excludes system/information_schema databases
   */
  getPartitionCardinalitySummary: () => `
    SELECT
      hostName() AS hostname,
      count() AS total_active_parts,
      countDistinct(concat(database, '.', table, '||', partition)) AS total_partitions,
      countDistinct(concat(database, '.', table)) AS total_tables,
      round(
        count() / nullIf(
          countDistinct(concat(database, '.', table, '||', partition)), 0
        ), 1
      ) AS avg_parts_per_partition,
      countIf(level = 0) AS level0_parts,
      round(countIf(level = 0) / nullIf(count(), 0), 4) AS level0_ratio
    FROM clusterAllReplicas(
      (SELECT cluster FROM system.clusters WHERE is_local = 1 LIMIT 1),
      system.parts
    )
    WHERE active = 1
      AND database NOT IN ('system', 'information_schema', 'INFORMATION_SCHEMA')
    GROUP BY hostname
    ORDER BY hostname
    SETTINGS skip_unavailable_shards = 1
  `,

  /**
   * Top partitions by part count (entire cluster)
   * - Grouped by node/database/table/partition, sorted by part count descending
   * - Excludes system/information_schema databases
   */
  getPartitionPartsDetail: () => `
    SELECT
      hostName() AS hostname,
      database,
      table,
      partition,
      count() AS parts,
      sum(rows) AS rows,
      formatReadableSize(sum(bytes_on_disk)) AS size,
      max(level) AS max_level,
      countIf(level = 0) AS level0_parts
    FROM clusterAllReplicas(
      (SELECT cluster FROM system.clusters WHERE is_local = 1 LIMIT 1),
      system.parts
    )
    WHERE active = 1
      AND database NOT IN ('system', 'information_schema', 'INFORMATION_SCHEMA')
    GROUP BY hostname, database, table, partition
    ORDER BY parts DESC
    LIMIT 100
    SETTINGS skip_unavailable_shards = 1
  `,

  /**
   * Disk usage by database (per node)
   * - Aggregates only parts with active=1 from system.parts
   */
  getDatabaseDiskUsageByNode: () => `
    WITH
      parts_agg AS (
        SELECT
          hostName() AS hostname,
          database,
          sum(bytes_on_disk) AS active_size_bytes,
          round(active_size_bytes / 1024 / 1024 / 1024, 2) AS active_size_gb,
          count() AS active_parts,
          uniqExact(table) AS tables
        FROM clusterAllReplicas(
          (SELECT cluster FROM system.clusters WHERE is_local = 1 LIMIT 1),
          system.parts
        )
        WHERE active = 1
        GROUP BY hostname, database
      ),
      totals AS (
        SELECT
          hostName() AS hostname,
          sumIf(value, metric = 'FilesystemMainPathTotalBytes') AS total_bytes
        FROM clusterAllReplicas(
          (SELECT cluster FROM system.clusters WHERE is_local = 1 LIMIT 1),
          system.asynchronous_metrics
        )
        GROUP BY hostname
      )
    SELECT
      p.hostname,
      p.database,
      p.active_size_gb,
      p.active_parts,
      p.tables,
      round(t.total_bytes / 1024 / 1024 / 1024, 2) AS total_disk_gb,
      round(p.active_size_bytes / nullIf(t.total_bytes, 0) * 100, 2) AS usage_pct
    FROM parts_agg p
    LEFT JOIN totals t ON p.hostname = t.hostname
    WHERE p.active_size_bytes > 0
    ORDER BY usage_pct DESC
    SETTINGS skip_unavailable_shards = 1, max_threads = 2
  `,

  /**
   * Top tables by level-0 part count (entire cluster)
   * - level=0 means unmerged parts written directly by INSERT
   * - High level-0 count = merges are not keeping up with insert rate
   */
  getLevel0PartsDetail: () => `
    SELECT
      hostName() AS hostname,
      database,
      table,
      count() AS level0_parts,
      sum(count()) OVER (PARTITION BY hostname, database, table) AS total_active_parts,
      round(count() / nullIf(sum(count()) OVER (PARTITION BY hostname, database, table), 0), 4) AS level0_ratio,
      formatReadableSize(sum(bytes_on_disk)) AS size
    FROM clusterAllReplicas(
      (SELECT cluster FROM system.clusters WHERE is_local = 1 LIMIT 1),
      system.parts
    )
    WHERE active = 1
      AND level = 0
      AND database NOT IN ('system', 'information_schema', 'INFORMATION_SCHEMA')
    GROUP BY hostname, database, table
    ORDER BY level0_parts DESC
    LIMIT 50
    SETTINGS skip_unavailable_shards = 1
  `,

  // ========== Health tab: Connection and Keeper metrics ==========

  /**
   * Connection errors (last 1 minute)
   * - Aggregates network errors (code 210) from system.error_log
   * - Count of connection errors within the last 1 minute
   */
  getConnectionErrors: () => `
    SELECT COALESCE(count(*), 0) AS connection_errors
    FROM ${clusterSystemLogTableExpr('error_log')}
    ${LAST_MINUTE_EVENT_LOG_PREWHERE}
    WHERE code = 210
    SETTINGS skip_unavailable_shards = 1
  `,

  // ========== Operations tab: Table details ==========

  /**
   * Currently active merge operations (real-time snapshot)
   * - Queried from system.merges, which shows currently in-progress merges
   * - Includes mutation operations (ALTER UPDATE/DELETE rewrites)
   */
  getActiveMergesDetail: () => `
    SELECT
      hostName() AS hostname,
      database,
      table,
      round(elapsed, 1) AS elapsed_sec,
      round(progress * 100, 1) AS progress_pct,
      num_parts,
      is_mutation,
      formatReadableSize(memory_usage) AS memory,
      formatReadableSize(bytes_read_uncompressed) AS bytes_read,
      round(rows_written / nullIf(elapsed, 0), 0) AS rows_per_sec,
      result_part_name
    FROM clusterAllReplicas(
      (SELECT cluster FROM system.clusters WHERE is_local = 1 LIMIT 1),
      system.merges
    )
    ORDER BY elapsed DESC
    SETTINGS skip_unavailable_shards = 1
  `,


  /**
   * Replication queue count by table (entire cluster)
   * - Retrieves replication queue status per table
   * - Database, table, queue, inserts, merges, postponed merges, mutations, last queue
   */
  getReplicationQueueByTable: () => `
  SELECT
    hostName() AS hostname,
    database,
    table,
    countIf(type IN ('GET_PART', 'MERGE_PARTS', 'MUTATE_PART')) AS queue,
    countIf(type = 'GET_PART') AS inserts,
    countIf(type = 'MERGE_PARTS') AS merges,
    countIf(num_postponed > 0) AS postponed_merges,
    countIf(type = 'MUTATE_PART') AS mutations,
    if(
      max(last_attempt_time) = toDateTime(0),
      'never attempted',
      formatReadableTimeDelta(now() - max(last_attempt_time))
    ) AS last_queue
  FROM clusterAllReplicas(
    (SELECT cluster FROM system.clusters WHERE is_local = 1 LIMIT 1),
    system.replication_queue
  )
  WHERE database NOT IN ('system', 'information_schema', 'INFORMATION_SCHEMA')
  GROUP BY hostname, database, table
  HAVING queue > 0
  ORDER BY queue DESC
  LIMIT 20
  SETTINGS skip_unavailable_shards = 1
  `,

  /**
   * Replication queue count by table (specific node)
   * - Retrieves replication queue status per table for a specific node
   */
  getReplicationQueueByTableForNode: (hostname: string) => `
  SELECT
    hostName() AS hostname,
    database,
    table,
    countIf(type IN ('GET_PART', 'MERGE_PARTS', 'MUTATE_PART')) AS queue,
    countIf(type = 'GET_PART') AS inserts,
    countIf(type = 'MERGE_PARTS') AS merges,
    countIf(num_postponed > 0) AS postponed_merges,
    countIf(type = 'MUTATE_PART') AS mutations,
    if(
      max(last_attempt_time) = toDateTime(0),
      'never attempted',
      formatReadableTimeDelta(now() - max(last_attempt_time))
    ) AS last_queue
  FROM clusterAllReplicas(
    (SELECT cluster FROM system.clusters WHERE is_local = 1 LIMIT 1),
    system.replication_queue
  )
  WHERE database NOT IN ('system', 'information_schema', 'INFORMATION_SCHEMA')
    AND hostName() = '${hostname}'
  GROUP BY hostname, database, table
  HAVING queue > 0
  ORDER BY queue DESC
  LIMIT 20
  SETTINGS skip_unavailable_shards = 1
  `,

  /**
   * Distribution queue by table (entire cluster)
   * - Retrieves distribution queue status per table
   * - Database, table, pending files, broken files, bytes, oldest entry
   */
  getDistributionQueueByTable: () => `
  SELECT
    hostName() AS hostname,
    database,
    table,
    sum(data_files) AS pending_files,
    sum(broken_data_files) AS broken_files,
    formatReadableSize(sum(data_compressed_bytes)) AS bytes,
    formatReadableTimeDelta(now() - minIf(last_exception_time, last_exception_time > toDateTime('1970-01-02 00:00:00')))
      AS oldest_age
  FROM clusterAllReplicas(
    (SELECT cluster FROM system.clusters WHERE is_local = 1 LIMIT 1),
    system.distribution_queue
  )
  WHERE database NOT IN ('system', 'information_schema', 'INFORMATION_SCHEMA')
  GROUP BY hostname, database, table
  HAVING pending_files > 0 OR broken_files > 0
  ORDER BY pending_files DESC
  LIMIT 20
  SETTINGS skip_unavailable_shards = 1
  `,

  /**
   * Distribution queue by table (specific node)
   * - Retrieves distribution queue status per table for a specific node
   */
  getDistributionQueueByTableForNode: (hostname: string) => `
  SELECT
    hostName() AS hostname,
    database,
    table,
    sum(data_files) AS pending_files,
    sum(broken_data_files) AS broken_files,
    formatReadableSize(sum(data_compressed_bytes)) AS bytes,
    formatReadableTimeDelta(now() - minIf(last_exception_time, last_exception_time > toDateTime('1970-01-02 00:00:00')))
      AS oldest_age
  FROM clusterAllReplicas(
    (SELECT cluster FROM system.clusters WHERE is_local = 1 LIMIT 1),
    system.distribution_queue
  )
  WHERE database NOT IN ('system', 'information_schema', 'INFORMATION_SCHEMA')
    AND hostName() = '${hostname}'
  GROUP BY hostname, database, table
  HAVING pending_files > 0 OR broken_files > 0
  ORDER BY pending_files DESC
  LIMIT 20
  SETTINGS skip_unavailable_shards = 1
  `,

  /**
   * Mutation details (entire cluster)
   * - Retrieves details of active mutations where is_done = 0
   * - Database, table, mutation ID, command, create time, remaining parts, latest failure reason
   */
  getMutationsDetail: () => `
  SELECT
    hostName() AS hostname,
    database,
    table,
    mutation_id,
    command,
    formatDateTime(create_time, '%Y-%m-%d %H:%M:%S') AS create_time,
    parts_to_do,
    latest_fail_reason
  FROM clusterAllReplicas(
    (SELECT cluster FROM system.clusters
     WHERE is_local = 1 LIMIT 1),
    system.mutations
  )
  WHERE is_done = 0
  ORDER BY create_time DESC
  LIMIT 50
  SETTINGS skip_unavailable_shards = 1
`,

  /**
   * Mutation details (specific node)
   * - Retrieves active mutation details for a specific node
   */
  getMutationsDetailForNode: (node: string) => `
  SELECT
    hostname() AS hostname,
    database,
    table,
    mutation_id,
    command,
    formatDateTime(create_time, '%Y-%m-%d %H:%M:%S') AS create_time,
    parts_to_do,
    latest_fail_reason
  FROM system.mutations
  WHERE is_done = 0
    AND hostname() = '${node}'
  ORDER BY create_time DESC
  LIMIT 50
`,

  /**
   * DDL queue pending tasks
   * - Retrieves non-finished DDL tasks from system.distributed_ddl_queue
   * - Shows tasks stuck for more than 1 minute, sorted by age (oldest first)
   */
  getDDLQueueDetail: () => `
  SELECT
    host AS hostname,
    cluster,
    query,
    initiator_host,
    status,
    formatDateTime(query_create_time, '%Y-%m-%d %H:%M:%S') AS create_time,
    dateDiff('second', query_create_time, now()) AS age_seconds,
    formatReadableTimeDelta(age_seconds) AS age,
    exception_text
  FROM system.distributed_ddl_queue
  WHERE status IN ('Active', 'Inactive', 'Unknown')
    AND query_create_time < now() - INTERVAL 1 MINUTE
  ORDER BY age_seconds DESC
  LIMIT 50
  `,

  getDDLQueueDetailForNode: (hostname: string) => `
  SELECT
    host AS hostname,
    cluster,
    query,
    initiator_host,
    status,
    formatDateTime(query_create_time, '%Y-%m-%d %H:%M:%S') AS create_time,
    dateDiff('second', query_create_time, now()) AS age_seconds,
    formatReadableTimeDelta(age_seconds) AS age,
    exception_text
  FROM system.distributed_ddl_queue
  WHERE status IN ('Active', 'Inactive', 'Unknown')
    AND query_create_time < now() - INTERVAL 1 MINUTE
    AND host = '${hostname}'
  ORDER BY age_seconds DESC
  LIMIT 50
  `,

};
