import type { TimeseriesMetricGroup } from '@/lib/metrics/timeseries-groups';
import type { ResolvedTimeseriesRange } from '@/lib/metrics/timeseries-range';
import { getTimeseriesMetricGroup } from '@/lib/metrics/timeseries-groups';
import {
  buildMonitoringQueryExclusion,
  buildSystemLogPrewhere,
  clusterSystemLogTableExpr,
  escapeSqlString,
} from './helpers';

type TimeseriesWindow = Pick<ResolvedTimeseriesRange, 'startUtc' | 'endUtc' | 'intervalSeconds'>;

export type TimeseriesQueryDefinition = {
  table: TimeseriesMetricGroup;
  query: string;
  label: string;
};

type MetricLogSelectBuilder = (window: TimeseriesWindow) => string;

function buildWindowPrewhere(window: TimeseriesWindow): string {
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

const METRIC_LOG_SELECT_BUILDERS: Record<string, MetricLogSelectBuilder> = {
  httpConnections: () => 'max(ifNull(CurrentMetric_HTTPConnection, 0)) as http_connections',
  tcpConnections: () => 'max(ifNull(CurrentMetric_TCPConnection, 0)) as tcp_connections',
  interserverConnections: () => 'max(ifNull(CurrentMetric_InterserverConnection, 0)) as interserver_connections',
  keeperSessions: () => 'max(ifNull(CurrentMetric_ZooKeeperSession, 0)) as keeper_sessions',
  keeperRequests: (window) => `round(sum(ifNull(ProfileEvent_ZooKeeperTransactions, 0)) / (${window.intervalSeconds} / 60), 2) as keeper_requests_per_min`,
  keeperExceptions: () => 'round(max(ifNull(CurrentMetric_ZooKeeperSessionExpired, 0)), 2) as keeper_exceptions',
  network: (window) => `
    round(sum(ProfileEvent_NetworkReceiveBytes) / ${window.intervalSeconds}, 2) as network_receive_bytes_per_sec,
    round(sum(ProfileEvent_NetworkSendBytes) / ${window.intervalSeconds}, 2) as network_send_bytes_per_sec
  `,
  fileDescriptors: () => `
    round(
      avg(ifNull(CurrentMetric_OpenFileForRead, 0)) +
      avg(ifNull(CurrentMetric_OpenFileForWrite, 0)),
      2
    ) as file_descriptors
  `,
  backgroundPool: () => `
    greatest(
      max(ifNull(CurrentMetric_BackgroundCommonPoolTask, 0)),
      0
    )
    + max(ifNull(CurrentMetric_BackgroundFetchesPoolTask, 0))
    + max(ifNull(CurrentMetric_BackgroundMovePoolTask, 0))
    + max(ifNull(CurrentMetric_BackgroundSchedulePoolTask, 0))
    + max(ifNull(CurrentMetric_BackgroundDistributedSchedulePoolTask, 0)) as background_tasks
  `,
  readThroughput: (window) => `round(sum(ProfileEvent_SelectedBytes) / ${window.intervalSeconds}, 2) as read_bytes_per_sec`,
  writeThroughput: (window) => `round(sum(ProfileEvent_InsertedBytes) / ${window.intervalSeconds}, 2) as write_bytes_per_sec`,
  readRowCount: () => 'sum(ProfileEvent_SelectedRows) as rows_read',
  writeRowCount: () => 'sum(ProfileEvent_InsertedRows) as rows_written',
  queryQueue: () => 'round(avg(ifNull(CurrentMetric_Query, 0)), 2) as queue_length',
  currentQueryMemory: () => 'round(max(ifNull(CurrentMetric_MemoryTracking, 0)), 2) as current_memory_bytes',
  diskIO: (window) => `
    round(
      (sum(ProfileEvent_OSReadBytes) + sum(ProfileEvent_OSWriteBytes)) / ${window.intervalSeconds},
      2
    ) as disk_io_bytes_per_sec
  `,
  activeMerges: () => 'max(CurrentMetric_Merge) as active_merges',
  activeMutations: () => 'max(CurrentMetric_PartMutation) as active_mutations',
  distributionQueue: () => 'max(CurrentMetric_DistributedFilesToInsert) as queue_files',
  mergeBytes: (window) => `
    round(
      sum(ProfileEvent_MergedUncompressedBytes) / ${window.intervalSeconds},
      2
    ) as merge_bytes_per_sec
  `,
  mutationBytes: (window) => `
    round(
      sum(ProfileEvent_MutatedUncompressedBytes) / ${window.intervalSeconds},
      2
    ) as mutation_bytes_per_sec
  `,
  partsCount: () => 'round(avg(ifNull(CurrentMetric_PartsActive, 0)), 2) as parts_count',
  insertRateRows: (window) => `
    round(sum(ifNull(ProfileEvent_InsertedRows, 0)) / ${window.intervalSeconds}, 2) as inserted_rows_per_sec
  `,
  mergeRateRows: (window) => `
    round(sum(ifNull(ProfileEvent_MergedRows, 0)) / ${window.intervalSeconds}, 2) as merged_rows_per_sec
  `,
};

function buildMetricLogTimeseriesQuery(metric: string, window: TimeseriesWindow): string {
  if (metric === 'cpu') {
    return `
      WITH
        (SELECT cluster FROM system.clusters WHERE is_local = 1 LIMIT 1) AS cluster_name,
        host_cpu AS (
          SELECT
            hostname() AS hostname,
            countIf(metric LIKE 'CPUFrequencyMHz_%') AS logical_cpu_cores_est
          FROM clusterAllReplicas(cluster_name, system.asynchronous_metrics)
          GROUP BY hostname
        ),
        host_ch_cpu AS (
          SELECT
            toStartOfInterval(event_time, INTERVAL ${window.intervalSeconds} SECOND) as time,
            hostname,
            sum(ProfileEvent_OSCPUVirtualTimeMicroseconds) / 1000000 / ${window.intervalSeconds} as cpu_cores_used
          FROM ${clusterSystemLogTableExpr('metric_log', 'cluster_name')}
          ${buildWindowPrewhere(window)}
          GROUP BY time, hostname
        )
      SELECT
        c.time as time,
        c.hostname as hostname,
        round(ifNull(c.cpu_cores_used / nullIf(h.logical_cpu_cores_est, 0) * 100, 0), 2) as cpu_usage_percent
      FROM host_ch_cpu c
      LEFT JOIN host_cpu h
        ON c.hostname = h.hostname
      ORDER BY time, hostname
      SETTINGS skip_unavailable_shards = 1
    `;
  }

  const selectColumn = METRIC_LOG_SELECT_BUILDERS[metric]?.(window);

  if (!selectColumn) {
    throw new Error(`No valid metric found for metric_log: ${metric}`);
  }

  return `
    SELECT
      toStartOfInterval(event_time, INTERVAL ${window.intervalSeconds} SECOND) as time,
      hostname,
      ${selectColumn}
    FROM ${clusterSystemLogTableExpr('metric_log')}
    ${buildWindowPrewhere(window)}
    GROUP BY time, hostname
    ORDER BY time, hostname
    SETTINGS skip_unavailable_shards = 1
  `;
}

function buildAsyncMetricLogTimeseriesQuery(metric: string, window: TimeseriesWindow): string {
  if (metric === 'memory') {
    return `
      SELECT
        time,
        hostname,
        round(memory_rss / nullIf(memory_total, 0) * 100, 2) as memory_usage_percent
      FROM (
        SELECT
          toStartOfInterval(event_time, INTERVAL ${window.intervalSeconds} SECOND) as time,
          hostname,
          max(CASE WHEN metric = 'MemoryResident' THEN value ELSE 0 END) as memory_rss,
          max(CASE WHEN metric = 'OSMemoryTotal' THEN value ELSE 0 END) as memory_total
        FROM ${clusterSystemLogTableExpr('asynchronous_metric_log')}
        ${buildWindowPrewhere(window)}
        WHERE metric IN ('MemoryResident', 'OSMemoryTotal')
        GROUP BY time, hostname
      )
      ORDER BY time, hostname
      SETTINGS skip_unavailable_shards = 1
    `;
  }

  if (metric === 'disk') {
    return `
      SELECT
        time,
        hostname,
        round(disk_used / nullIf(disk_total, 0) * 100, 2) as disk_usage_percent
      FROM (
        SELECT
          toStartOfInterval(event_time, INTERVAL ${window.intervalSeconds} SECOND) as time,
          hostname,
          max(CASE WHEN metric = 'FilesystemMainPathUsedBytes' THEN value ELSE 0 END) as disk_used,
          max(CASE WHEN metric = 'FilesystemMainPathTotalBytes' THEN value ELSE 0 END) as disk_total
        FROM ${clusterSystemLogTableExpr('asynchronous_metric_log')}
        ${buildWindowPrewhere(window)}
        WHERE metric IN ('FilesystemMainPathUsedBytes', 'FilesystemMainPathTotalBytes')
        GROUP BY time, hostname
      )
      ORDER BY time, hostname
      SETTINGS skip_unavailable_shards = 1
    `;
  }

  if (metric === 'freeDiskSpace') {
    return `
      SELECT
        time,
        hostname,
        round(100 - (disk_used / nullIf(disk_total, 0) * 100), 2) as free_disk_space_percent
      FROM (
        SELECT
          toStartOfInterval(event_time, INTERVAL ${window.intervalSeconds} SECOND) as time,
          hostname,
          max(CASE WHEN metric = 'FilesystemMainPathUsedBytes' THEN value ELSE 0 END) as disk_used,
          max(CASE WHEN metric = 'FilesystemMainPathTotalBytes' THEN value ELSE 0 END) as disk_total
        FROM ${clusterSystemLogTableExpr('asynchronous_metric_log')}
        ${buildWindowPrewhere(window)}
        WHERE metric IN ('FilesystemMainPathUsedBytes', 'FilesystemMainPathTotalBytes')
        GROUP BY time, hostname
      )
      ORDER BY time, hostname
      SETTINGS skip_unavailable_shards = 1
    `;
  }

  if (metric === 'replicationLag') {
    return `
      SELECT
        time,
        hostname,
        replication_lag_value as replication_delay_seconds
      FROM (
        SELECT
          toStartOfInterval(event_time, INTERVAL ${window.intervalSeconds} SECOND) as time,
          hostname,
          max(CASE WHEN metric = 'ReplicasMaxAbsoluteDelay' THEN value ELSE 0 END) as replication_lag_value
        FROM ${clusterSystemLogTableExpr('asynchronous_metric_log')}
        ${buildWindowPrewhere(window)}
        WHERE metric = 'ReplicasMaxAbsoluteDelay'
        GROUP BY time, hostname
      )
      ORDER BY time, hostname
      SETTINGS skip_unavailable_shards = 1
    `;
  }

  if (metric === 'replicationQueue') {
    return `
      SELECT
        time,
        hostname,
        replication_queue_value as queue_size
      FROM (
        SELECT
          toStartOfInterval(event_time, INTERVAL ${window.intervalSeconds} SECOND) as time,
          hostname,
          max(CASE WHEN metric = 'ReplicasSumQueueSize' THEN value ELSE 0 END) as replication_queue_value
        FROM ${clusterSystemLogTableExpr('asynchronous_metric_log')}
        ${buildWindowPrewhere(window)}
        WHERE metric = 'ReplicasSumQueueSize'
        GROUP BY time, hostname
      )
      ORDER BY time, hostname
      SETTINGS skip_unavailable_shards = 1
    `;
  }

  throw new Error(`No valid metric found for async_metric_log: ${metric}`);
}

function buildQueryLogTimeseriesQuery(metric: string, window: TimeseriesWindow): string {
  if (metric === 'queryType') {
    return `
      WITH upper(query) as query_upper
      SELECT
        toStartOfInterval(event_time, INTERVAL ${window.intervalSeconds} SECOND) as time,
        hostname,
        multiIf(
          query_upper LIKE 'SELECT%', 'SELECT',
          query_upper LIKE 'INSERT%', 'INSERT',
          query_upper LIKE 'ALTER%', 'ALTER',
          query_upper LIKE 'CREATE%', 'CREATE',
          query_upper LIKE 'DROP%', 'DROP',
          'OTHER'
        ) as query_type,
        count(DISTINCT query_id) as count
      FROM ${clusterSystemLogTableExpr('query_log')}
      ${buildWindowPrewhere(window)}
      WHERE type = 'QueryFinish'
        AND ${buildMonitoringQueryExclusion()}
        AND (
          query_upper LIKE 'SELECT%'
          OR query_upper LIKE 'INSERT%'
          OR query_upper LIKE 'ALTER%'
          OR query_upper LIKE 'CREATE%'
          OR query_upper LIKE 'DROP%'
        )
      GROUP BY time, hostname, query_type
      ORDER BY time, hostname, query_type
      SETTINGS skip_unavailable_shards = 1
    `;
  }

  const selectByMetric: Record<string, string> = {
    successQueries: "countIf(type = 'QueryFinish') as success_queries",
    failedQueries: "countIf(type IN ('ExceptionBeforeStart', 'ExceptionWhileProcessing')) as failed_queries",
    queryMemoryUsage: "round(maxIf(memory_usage, memory_usage > 0), 2) as query_memory_bytes",
    queryDuration: "round(avgIf(query_duration_ms, type = 'QueryFinish'), 2) as avg_duration_ms",
  };

  const selectColumn = selectByMetric[metric];

  if (!selectColumn) {
    throw new Error(`No valid metric found for query_log: ${metric}`);
  }

  const allowedTypes =
    metric === 'failedQueries' || metric === 'queryMemoryUsage'
      ? "('QueryFinish', 'ExceptionBeforeStart', 'ExceptionWhileProcessing')"
      : "('QueryFinish')";

  return `
    SELECT
      toStartOfInterval(event_time, INTERVAL ${window.intervalSeconds} SECOND) as time,
      hostname,
      ${selectColumn}
    FROM ${clusterSystemLogTableExpr('query_log')}
    ${buildWindowPrewhere(window)}
    WHERE type IN ${allowedTypes}
      AND ${buildMonitoringQueryExclusion()}
    GROUP BY time, hostname
    ORDER BY time, hostname
    SETTINGS skip_unavailable_shards = 1
  `;
}


function buildConnectionErrorsTimeseriesQuery(window: TimeseriesWindow): string {
  return `
    SELECT
      toStartOfInterval(event_time, INTERVAL ${window.intervalSeconds} SECOND) as time,
      hostname,
      round(count(*) / (${window.intervalSeconds} / 60), 2) as connection_errors
    FROM ${clusterSystemLogTableExpr('error_log')}
    ${buildWindowPrewhere(window)}
    WHERE code = 210
    GROUP BY time, hostname
    ORDER BY time, hostname
    SETTINGS skip_unavailable_shards = 1
  `;
}

export function buildTimeseriesQuery(metric: string, window: TimeseriesWindow): TimeseriesQueryDefinition {
  const table = getTimeseriesMetricGroup(metric);

  if (!table) {
    throw new Error(`Unsupported timeseries metric: ${metric}`);
  }

  switch (table) {
    case 'metric_log':
      return {
        table,
        query: buildMetricLogTimeseriesQuery(metric, window),
        label: `timeseries.metric_log:${metric}`,
      };
    case 'async_metric_log':
      return {
        table,
        query: buildAsyncMetricLogTimeseriesQuery(metric, window),
        label: `timeseries.async_metric_log:${metric}`,
      };
    case 'query_log':
      return {
        table,
        query: buildQueryLogTimeseriesQuery(metric, window),
        label: `timeseries.query_log:${metric}`,
      };
    case 'error_log':
      return {
        table,
        query: buildConnectionErrorsTimeseriesQuery(window),
        label: 'timeseries.error_log:connectionErrors',
      };
    default:
      throw new Error(`Unsupported timeseries table: ${table}`);
  }
}
