"use client";

import { useDashboardControls } from "@/lib/hooks/use-dashboard-controls";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity, Database, GitMerge, Zap } from "lucide-react";
import { ChartInfo } from "@/components/ChartInfo";
import { useSettings } from "@/contexts/SettingsContext";
import { type DashboardTimeRange } from "@/lib/metrics/timeseries-range";
import type { ClusterWithMetrics } from "@/lib/services/cluster.service";
import { OVERVIEW_CARD_FIELDS, useOverviewData } from "@/components/cluster-detail/hooks/useOverviewData";
import { ChartLoadingBar } from "@/components/cluster-detail/shared/charts/ChartLoadingBar";
import { NodeListPanel } from "./node-list/NodeListPanel";

interface OverviewTabProps {
  clusterId: string;
  cluster?: ClusterWithMetrics;
  loadingMetricFields?: ReadonlySet<string>;
  isActive?: boolean;
}

export function OverviewTab({
  clusterId,
  cluster: clusterProp,
  loadingMetricFields,
  isActive = true,
}: OverviewTabProps) {
  const { generalSettings } = useSettings();
  const timezone = generalSettings.timezone || 'UTC';
  const { timeRange, setTimeRange, refreshNonce, handleRefresh } = useDashboardControls();
  const { cluster, clusterMetrics, isCardLoading } = useOverviewData(clusterProp, loadingMetricFields);

  if (!cluster) {
    return <OverviewTabSkeleton />;
  }

  function handleTimeRangeChange(range: DashboardTimeRange) {
    setTimeRange(range);
  }

  const queriesLoading = isCardLoading(OVERVIEW_CARD_FIELDS.queries);
  const storageLoading = isCardLoading(OVERVIEW_CARD_FIELDS.storage);
  const operationsLoading = isCardLoading(OVERVIEW_CARD_FIELDS.operations);
  const healthLoading = isCardLoading(OVERVIEW_CARD_FIELDS.health);

  return (
    <div className="space-y-4">
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="relative overflow-hidden bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-600 gap-0">
          <ChartLoadingBar loading={queriesLoading} showDelayMs={0} />
          <CardHeader className="pb-0 pt-4 px-4">
            <CardTitle className="text-sm font-semibold text-gray-800 dark:text-white flex items-center gap-1">
              <Zap className="w-3 h-3" />
              Resource
              <ChartInfo
                title="Resource overview"
                description=""
                query={`-- getQueryOverviewSummary + getMetricLogOverviewSummary
-- [1] query_log metrics (last 1 min)
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
  FROM clusterAllReplicas(
    (SELECT cluster FROM system.clusters WHERE is_local = 1 LIMIT 1),
    merge('system', '^query_log(_\\d+)?$')
  )
  PREWHERE event_date >= toDate(now() - INTERVAL 1 DAY)
        AND event_time >= now() - INTERVAL 1 MINUTE
  WHERE type IN ('QueryStart', 'QueryFinish', 'ExceptionBeforeStart', 'ExceptionWhileProcessing')
    AND query NOT LIKE '%system.query_log%'
    AND query NOT LIKE '%system.metric_log%'
    AND query NOT LIKE '%system.asynchronous_metric_log%'
    AND query NOT LIKE '%system.error_log%'
    AND query NOT LIKE '%system.part_log%'
    AND query NOT LIKE '%system.trace_log%'
  GROUP BY hostname
)
SETTINGS skip_unavailable_shards = 1;

-- [2] metric_log metrics (last 1 min)
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
  FROM clusterAllReplicas(
    (SELECT cluster FROM system.clusters WHERE is_local = 1 LIMIT 1),
    merge('system', '^metric_log(_\\d+)?$')
  )
  PREWHERE event_date >= today()
        AND event_time >= now() - INTERVAL 1 MINUTE
        AND event_time < now()
  GROUP BY hostname
)
SETTINGS skip_unavailable_shards = 1;`}
                yAxisLabel="Various units"
                yAxisDescription="Success/Failed (count), Read/Write (bytes/s avg), Mem (bytes avg), Wait (ms avg)"
                aggregation="sum"
              />
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-2">
            <div className="grid grid-cols-3 gap-2">
              <MetricCell label="Success (count)" value={clusterMetrics.successQueries} loading={queriesLoading} />
              <MetricCell
                label="Failed (count)"
                value={clusterMetrics.failedQueries}
                loading={queriesLoading}
                alertClass={typeof clusterMetrics.failedQueries === 'number' ? clusterMetrics.failedQueries > 10 ? 'text-red-600 dark:text-red-400' : clusterMetrics.failedQueries > 5 ? 'text-yellow-600 dark:text-yellow-400' : undefined : undefined}
              />
              <MetricCell label="Read (avg)" value={clusterMetrics.readThroughput} loading={queriesLoading} />
              <MetricCell label="Write (avg)" value={clusterMetrics.writeThroughput} loading={queriesLoading} />
              <MetricCell label="Mem (avg)" value={clusterMetrics.avgQueryMemory} loading={queriesLoading} />
              <MetricCell label="Wait (avg) ms" value={clusterMetrics.queryWaitTime} loading={queriesLoading} />
            </div>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-600 gap-0">
          <ChartLoadingBar loading={storageLoading} showDelayMs={0} />
          <CardHeader className="pb-0 pt-4 px-4">
            <CardTitle className="text-sm font-semibold text-gray-800 dark:text-white flex items-center gap-1">
              <Database className="w-3 h-3" />
              Storage
              <ChartInfo
                title="Storage metrics"
                description=""
                query={`-- getAsyncMetricsOverviewSummary + getMetricLogOverviewSummary + getSystemMetricsOverviewSummary + getDetachedPartsOverviewSummary
-- [1] asynchronous_metrics (free disk, repl lag, memory)
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
    round(100 - (maxIf(value, metric = 'FilesystemMainPathUsedBytes') / nullIf(maxIf(value, metric = 'FilesystemMainPathTotalBytes'), 0) * 100), 2) as free_disk_space_percent,
    maxIf(value, metric = 'ReplicasMaxAbsoluteDelay') as replication_lag_value,
    maxIf(value, metric = 'ReplicasSumQueueSize') as replication_queue_value,
    avgIf(value, metric LIKE 'OSIdleTimeCPU%') as cpu_idle_ratio
  FROM clusterAllReplicas(
    (SELECT cluster FROM system.clusters WHERE is_local = 1 LIMIT 1),
    system.asynchronous_metrics
  )
  WHERE metric IN ('MemoryResident', 'OSMemoryTotal', 'FilesystemMainPathUsedBytes', 'FilesystemMainPathTotalBytes', 'ReplicasMaxAbsoluteDelay', 'ReplicasSumQueueSize')
  OR metric LIKE 'OSIdleTimeCPU%'
  GROUP BY node
)
SETTINGS skip_unavailable_shards = 1;

-- [2] metric_log (disk I/O, last 1 min)
SELECT
  COALESCE(round(avg(disk_io_bytes_per_sec), 2), 0) AS disk_io_bytes_per_sec
FROM (
  SELECT
    hostname,
    round((sum(ProfileEvent_OSReadBytes) + sum(ProfileEvent_OSWriteBytes)) / 60, 2) AS disk_io_bytes_per_sec
  FROM clusterAllReplicas(
    (SELECT cluster FROM system.clusters WHERE is_local = 1 LIMIT 1),
    merge('system', '^metric_log(_\\d+)?$')
  )
  PREWHERE event_date >= today()
        AND event_time >= now() - INTERVAL 1 MINUTE
        AND event_time < now()
  GROUP BY hostname
)
SETTINGS skip_unavailable_shards = 1;

-- [3] system.metrics (parts_count from PartsActive gauge)
SELECT toUInt64(COALESCE(sumIf(value, metric = 'PartsActive'), 0)) AS parts_count
FROM clusterAllReplicas(
  (SELECT cluster FROM system.clusters WHERE is_local = 1 LIMIT 1),
  system.metrics
)
WHERE metric = 'PartsActive'
SETTINGS skip_unavailable_shards = 1;

-- [4] system.detached_parts (broken + detached)
SELECT
  countIf(reason ILIKE '%broken%' OR reason ILIKE '%corrupt%' OR reason ILIKE '%checksum%') AS broken_parts,
  count() AS detached_parts
FROM clusterAllReplicas(
  (SELECT cluster FROM system.clusters WHERE is_local = 1 LIMIT 1),
  system.detached_parts
)
SETTINGS skip_unavailable_shards = 1;`}
                yAxisLabel="Various units"
                yAxisDescription="Free Disk (% avg), Disk I/O (bytes/s avg), Parts (sum), Broken (sum), Detached (sum)"
                aggregation="avg"
              />
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-2">
            <div className="grid grid-cols-3 gap-2">
              <MetricCell label="Free Disk (avg) %" value={clusterMetrics.freeDiskSpace} loading={storageLoading} />
              <MetricCell label="Disk I/O (avg)" value={clusterMetrics.diskIO} loading={storageLoading} />
              <MetricCell label="Parts (sum)" value={clusterMetrics.partsCount} loading={storageLoading} />
              <MetricCell
                label="Broken (sum)"
                value={clusterMetrics.brokenParts}
                loading={storageLoading}
                alertClass={typeof clusterMetrics.brokenParts === 'number' && clusterMetrics.brokenParts > 0 ? 'text-red-600 dark:text-red-400' : undefined}
              />
              <MetricCell
                label="Detached (sum)"
                value={clusterMetrics.detachedParts}
                loading={storageLoading}
                alertClass={typeof clusterMetrics.detachedParts === 'number' && clusterMetrics.detachedParts > 0 ? 'text-yellow-600 dark:text-yellow-400' : undefined}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-600 gap-0">
          <ChartLoadingBar loading={operationsLoading} showDelayMs={0} />
          <CardHeader className="pb-0 pt-4 px-4">
            <CardTitle className="text-sm font-semibold text-gray-800 dark:text-white flex items-center gap-1">
              <GitMerge className="w-3 h-3" />
              Operations
              <ChartInfo
                title="Operations metrics"
                description=""
                query={`-- getAsyncMetricsOverviewSummary + getSystemMetricsOverviewSummary
-- [1] asynchronous_metrics (repl lag, repl queue, memory, disk, cpu)
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
    round(100 - (maxIf(value, metric = 'FilesystemMainPathUsedBytes') / nullIf(maxIf(value, metric = 'FilesystemMainPathTotalBytes'), 0) * 100), 2) as free_disk_space_percent,
    maxIf(value, metric = 'ReplicasMaxAbsoluteDelay') as replication_lag_value,
    maxIf(value, metric = 'ReplicasSumQueueSize') as replication_queue_value,
    avgIf(value, metric LIKE 'OSIdleTimeCPU%') as cpu_idle_ratio
  FROM clusterAllReplicas(
    (SELECT cluster FROM system.clusters WHERE is_local = 1 LIMIT 1),
    system.asynchronous_metrics
  )
  WHERE metric IN ('MemoryResident', 'OSMemoryTotal', 'FilesystemMainPathUsedBytes', 'FilesystemMainPathTotalBytes', 'ReplicasMaxAbsoluteDelay', 'ReplicasSumQueueSize')
  OR metric LIKE 'OSIdleTimeCPU%'
  GROUP BY node
)
SETTINGS skip_unavailable_shards = 1;

-- [2] system.metrics (merges, mutations, dist queue, parts, connections, keeper)
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
  'Merge', 'PartMutation', 'DistributedFilesToInsert', 'MemoryTracking',
  'PartsActive', 'HTTPConnection', 'TCPConnection', 'InterserverConnection',
  'ZooKeeperSession', 'ZooKeeperSessionExpired'
)
SETTINGS skip_unavailable_shards = 1;`}
                yAxisLabel="Various units"
                yAxisDescription="Repl Lag (seconds, max), Repl Queue (sum), Merges/Mutations (sum), Pending Dist (sum)"
                aggregation="sum"
              />
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-2">
            <div className="grid grid-cols-3 gap-2">
              <MetricCell
                label="Repl Lag (max) s"
                value={clusterMetrics.replicationLag}
                loading={operationsLoading}
                alertClass={typeof clusterMetrics.replicationLag === 'number' && clusterMetrics.replicationLag >= 300
                  ? clusterMetrics.replicationLag >= 1800
                    ? 'text-red-700 dark:text-red-300'
                    : 'text-yellow-700 dark:text-yellow-300'
                  : undefined}
                alertBg={typeof clusterMetrics.replicationLag === 'number' && clusterMetrics.replicationLag >= 300
                  ? clusterMetrics.replicationLag >= 1800
                    ? 'bg-red-100 dark:bg-red-900/40 border-red-300 dark:border-red-700'
                    : 'bg-yellow-100 dark:bg-yellow-900/40 border-yellow-300 dark:border-yellow-700'
                  : undefined}
              />
              <MetricCell
                label="Repl Queue (sum)"
                value={clusterMetrics.replicationQueueCount}
                loading={operationsLoading}
                alertClass={typeof clusterMetrics.replicationQueueCount === 'number' ? clusterMetrics.replicationQueueCount > 100 ? 'text-red-600 dark:text-red-400' : clusterMetrics.replicationQueueCount > 50 ? 'text-yellow-600 dark:text-yellow-400' : undefined : undefined}
              />
              <MetricCell
                label="Merges (sum)"
                value={clusterMetrics.activeMerges}
                loading={operationsLoading}
                alertClass={typeof clusterMetrics.activeMerges === 'number' ? clusterMetrics.activeMerges > 15 ? 'text-red-600 dark:text-red-400' : clusterMetrics.activeMerges > 10 ? 'text-yellow-600 dark:text-yellow-400' : undefined : undefined}
              />
              <MetricCell
                label="Mutations (sum)"
                value={clusterMetrics.activeMutations}
                loading={operationsLoading}
                alertClass={typeof clusterMetrics.activeMutations === 'number' ? clusterMetrics.activeMutations > 5 ? 'text-red-600 dark:text-red-400' : clusterMetrics.activeMutations > 3 ? 'text-yellow-600 dark:text-yellow-400' : undefined : undefined}
              />
              <MetricCell
                label="Pending Dist (sum)"
                value={clusterMetrics.pendingDistribution}
                loading={operationsLoading}
                alertClass={typeof clusterMetrics.pendingDistribution === 'number' ? clusterMetrics.pendingDistribution > 200 ? 'text-red-600 dark:text-red-400' : clusterMetrics.pendingDistribution > 150 ? 'text-yellow-600 dark:text-yellow-400' : undefined : undefined}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-600 gap-0">
          <ChartLoadingBar loading={healthLoading} showDelayMs={0} />
          <CardHeader className="pb-0 pt-4 px-4">
            <CardTitle className="text-sm font-semibold text-gray-800 dark:text-white flex items-center gap-1">
              <Activity className="w-3 h-3" />
              Conn&amp;Keeper
              <ChartInfo
                title="Connection & Keeper metrics"
                description=""
                query={`-- getSystemMetricsOverviewSummary + getConnectionErrors + getMetricLogOverviewSummary
-- [1] system.metrics (connections, keeper sessions)
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
  'Merge', 'PartMutation', 'DistributedFilesToInsert', 'MemoryTracking',
  'PartsActive', 'HTTPConnection', 'TCPConnection', 'InterserverConnection',
  'ZooKeeperSession', 'ZooKeeperSessionExpired'
)
SETTINGS skip_unavailable_shards = 1;

-- [2] error_log (connection errors, last 1 min)
SELECT COALESCE(count(*), 0) AS connection_errors
FROM clusterAllReplicas(
  (SELECT cluster FROM system.clusters WHERE is_local = 1 LIMIT 1),
  merge('system', '^error_log(_\\d+)?$')
)
PREWHERE event_date >= toDate(now() - INTERVAL 1 DAY)
      AND event_time >= now() - INTERVAL 1 MINUTE
WHERE code = 210
SETTINGS skip_unavailable_shards = 1;

-- [3] metric_log (keeper requests, last 1 min)
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
  FROM clusterAllReplicas(
    (SELECT cluster FROM system.clusters WHERE is_local = 1 LIMIT 1),
    merge('system', '^metric_log(_\\d+)?$')
  )
  PREWHERE event_date >= today()
        AND event_time >= now() - INTERVAL 1 MINUTE
        AND event_time < now()
  GROUP BY hostname
)
SETTINGS skip_unavailable_shards = 1;`}
                yAxisLabel="Count"
                yAxisDescription="HTTP/TCP/InterServer/Err (sum), Keeper Sessions (sum), Keeper Req/min (sum)"
                aggregation="sum"
              />
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-2">
            <div className="grid grid-cols-3 gap-2">
              <MetricCell
                label="HTTP (sum)"
                value={clusterMetrics.httpConnections}
                loading={healthLoading}
                alertClass={typeof clusterMetrics.httpConnections === 'number' ? clusterMetrics.httpConnections > 1000 ? 'text-red-600 dark:text-red-400' : clusterMetrics.httpConnections > 800 ? 'text-yellow-600 dark:text-yellow-400' : undefined : undefined}
              />
              <MetricCell
                label="TCP (sum)"
                value={clusterMetrics.tcpConnections}
                loading={healthLoading}
                alertClass={typeof clusterMetrics.tcpConnections === 'number' ? clusterMetrics.tcpConnections > 1000 ? 'text-red-600 dark:text-red-400' : clusterMetrics.tcpConnections > 800 ? 'text-yellow-600 dark:text-yellow-400' : undefined : undefined}
              />
              <MetricCell
                label="InterServer (sum)"
                value={clusterMetrics.interserverConnections}
                loading={healthLoading}
                alertClass={typeof clusterMetrics.interserverConnections === 'number' ? clusterMetrics.interserverConnections > 500 ? 'text-red-600 dark:text-red-400' : clusterMetrics.interserverConnections > 300 ? 'text-yellow-600 dark:text-yellow-400' : undefined : undefined}
              />
              <MetricCell
                label="Conn Err (sum)"
                value={clusterMetrics.connectionErrors}
                loading={healthLoading}
                alertClass={typeof clusterMetrics.connectionErrors === 'number' ? clusterMetrics.connectionErrors > 10 ? 'text-red-600 dark:text-red-400' : clusterMetrics.connectionErrors > 5 ? 'text-yellow-600 dark:text-yellow-400' : undefined : undefined}
              />
              <MetricCell
                label="Keeper Ses (avg)"
                value={clusterMetrics.keeperSessions}
                loading={healthLoading}
                alertClass={typeof clusterMetrics.keeperSessions === 'number' && clusterMetrics.keeperSessions < 3 ? 'text-red-600 dark:text-red-400' : undefined}
              />
              <MetricCell
                label="Keeper Req (avg)"
                value={clusterMetrics.keeperRequests}
                loading={healthLoading}
                alertClass={typeof clusterMetrics.keeperRequests === 'number' && clusterMetrics.keeperRequests > 100 ? 'text-yellow-600 dark:text-yellow-400' : undefined}
              />
            </div>
          </CardContent>
        </Card>
      </div>

        <NodeListPanel
          clusterId={clusterId}
          cluster={cluster}
          isActive={isActive}
          timezone={timezone}
          timeRange={timeRange}
          onTimeRangeChange={handleTimeRangeChange}
          refreshNonce={refreshNonce}
          onRefresh={handleRefresh}
        />
      </div>
  );
}

function OverviewTabSkeleton() {
  return (
    <div className="space-y-2">
      <div>
        <Skeleton className="h-7 w-52" />
        <Skeleton className="h-4 w-72 mt-1" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <Card key={index} className="bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-600">
            <CardHeader className="pb-0 pt-4 px-4">
              <Skeleton className="h-4 w-20" />
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-2">
              <div className="grid grid-cols-3 gap-2">
                {Array.from({ length: 6 }).map((__, metricIndex) => (
                  <div
                    key={metricIndex}
                    className="p-0.5 bg-gray-50 dark:bg-slate-700 rounded border border-gray-100 dark:border-slate-600 min-h-[38px]"
                  >
                    <Skeleton className="h-4 w-10 mx-auto mt-1" />
                    <Skeleton className="h-3 w-16 mx-auto mt-1" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-600">
        <CardHeader className="pb-2 pt-2.5 px-3">
          <Skeleton className="h-5 w-36" />
        </CardHeader>
        <CardContent className="px-3 pb-3">
          <div className="flex gap-2 flex-wrap">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-7 w-20" />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

interface MetricCellProps {
  label: string;
  value: string | number | null;
  loading?: boolean;
  alertClass?: string;
  alertBg?: string;
}

function MetricCell({ label, value, loading = false, alertClass, alertBg }: MetricCellProps) {
  return (
    <div className={`text-center px-1 py-1.5 rounded border flex items-center justify-center ${alertBg ?? 'bg-gray-50 dark:bg-slate-700 border-gray-100 dark:border-slate-600'}`}>
      <div>
        {loading ? (
          <Skeleton className="h-3 w-8 mx-auto" />
        ) : (
          <span className={`text-xs leading-none ${value == null ? 'text-gray-400 dark:text-gray-500' : alertClass ?? 'text-gray-900 dark:text-white'}`}>{value ?? '—'}</span>
        )}
        <div className="text-[9px] text-gray-500 dark:text-gray-400 leading-none mt-px">{label}</div>
      </div>
    </div>
  );
}
