import { GitMerge, Zap, Clock, Share2, RefreshCw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { ChartInfo } from "@/components/ChartInfo";
import { SummaryMetricValue } from "@/components/cluster-detail/shared/components/SummaryMetricValue";

interface OperationsSummaryCardsProps {
  activeMerges: number | null;
  activeMutations: number | null;
  replicationLag: number | null;
  replicationQueue: number | null;
  distributionQueue: number | null;
  loading?: boolean;
}

export function OperationsSummaryCards({
  activeMerges,
  activeMutations,
  replicationLag,
  replicationQueue,
  distributionQueue,
  loading = false,
}: OperationsSummaryCardsProps) {
  return (
    <div className="grid grid-cols-5 gap-2">
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 flex flex-col">
        <CardContent className="px-4 py-3 !pb-3 flex flex-1 items-center justify-center">
          <div className="flex items-center gap-1.5">
            <GitMerge className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <div className="flex items-baseline gap-1">
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">Merges</p>
              <p className="text-[9px] text-gray-400 dark:text-gray-500">(sum)</p>
            </div>
            <ChartInfo
              title="Active Merges"
              description=""
              query={`SELECT
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
SETTINGS skip_unavailable_shards = 1`}
              yAxisLabel="Operations"
              yAxisDescription="Cluster-wide count of active merge operations (real-time)"
              aggregation="sum"
            />
            <SummaryMetricValue
              value={activeMerges == null ? null : Math.round(activeMerges)}
              loading={loading}
              className="text-xs text-blue-600 dark:text-blue-400 ml-auto"
            />
          </div>
        </CardContent>
      </Card>

      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 flex flex-col">
        <CardContent className="px-4 py-3 !pb-3 flex flex-1 items-center justify-center">
          <div className="flex items-center gap-1.5">
            <Zap className="w-4 h-4 text-purple-600 dark:text-purple-400" />
            <div className="flex items-baseline gap-1">
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">Mutations</p>
              <p className="text-[9px] text-gray-400 dark:text-gray-500">(sum)</p>
            </div>
            <ChartInfo
              title="Active Mutations"
              description=""
              query={`SELECT
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
SETTINGS skip_unavailable_shards = 1`}
              yAxisLabel="Operations"
              yAxisDescription="Cluster-wide count of active mutation operations (real-time)"
              aggregation="sum"
            />
            <SummaryMetricValue
              value={activeMutations == null ? null : Math.round(activeMutations)}
              loading={loading}
              className="text-xs text-purple-600 dark:text-purple-400 ml-auto"
            />
          </div>
        </CardContent>
      </Card>

      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 flex flex-col">
        <CardContent className="px-4 py-3 !pb-3 flex flex-1 items-center justify-center">
          <div className="flex items-center gap-1.5">
            <Clock className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
            <div className="flex items-baseline gap-1">
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">Repl Lag</p>
              <p className="text-[9px] text-gray-400 dark:text-gray-500">(max)</p>
            </div>
            <ChartInfo
              title="Replication Lag"
              description=""
              query={`SELECT
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
    'MemoryResident', 'OSMemoryTotal',
    'FilesystemMainPathUsedBytes', 'FilesystemMainPathTotalBytes',
    'ReplicasMaxAbsoluteDelay', 'ReplicasSumQueueSize'
  )
  OR metric LIKE 'OSIdleTimeCPU%'
  GROUP BY node
)
SETTINGS skip_unavailable_shards = 1`}
              yAxisLabel="Lag (seconds)"
              yAxisDescription="Maximum replication lag across all cluster replicas (real-time)"
              aggregation="max"
            />
            <SummaryMetricValue
              value={replicationLag == null ? null : replicationLag.toFixed(1)}
              loading={loading}
              className="text-xs text-cyan-600 dark:text-cyan-400 ml-auto"
            />
          </div>
        </CardContent>
      </Card>

      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 flex flex-col">
        <CardContent className="px-4 py-3 !pb-3 flex flex-1 items-center justify-center">
          <div className="flex items-center gap-1.5">
            <RefreshCw className="w-4 h-4 text-green-600 dark:text-green-400" />
            <div className="flex items-baseline gap-1">
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">Repl Queue</p>
              <p className="text-[9px] text-gray-400 dark:text-gray-500">(sum)</p>
            </div>
            <ChartInfo
              title="Replication Queue"
              description=""
              query={`SELECT
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
    'MemoryResident', 'OSMemoryTotal',
    'FilesystemMainPathUsedBytes', 'FilesystemMainPathTotalBytes',
    'ReplicasMaxAbsoluteDelay', 'ReplicasSumQueueSize'
  )
  OR metric LIKE 'OSIdleTimeCPU%'
  GROUP BY node
)
SETTINGS skip_unavailable_shards = 1`}
              yAxisLabel="Queue size"
              yAxisDescription="Total replication queue size across the cluster (real-time)"
              aggregation="sum"
            />
            <SummaryMetricValue
              value={replicationQueue == null ? null : Math.round(replicationQueue)}
              loading={loading}
              className="text-xs text-green-600 dark:text-green-400 ml-auto"
            />
          </div>
        </CardContent>
      </Card>

      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 flex flex-col">
        <CardContent className="px-4 py-3 !pb-3 flex flex-1 items-center justify-center">
          <div className="flex items-center gap-1.5">
            <Share2 className="w-4 h-4 text-orange-600 dark:text-orange-400" />
            <div className="flex items-baseline gap-1">
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">Dist Queue</p>
              <p className="text-[9px] text-gray-400 dark:text-gray-500">(sum)</p>
            </div>
            <ChartInfo
              title="Distribution Queue"
              description=""
              query={`SELECT
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
SETTINGS skip_unavailable_shards = 1`}
              yAxisLabel="Pending files"
              yAxisDescription="Cluster-wide distribution queue file count (real-time)"
              aggregation="sum"
            />
            <SummaryMetricValue
              value={distributionQueue == null ? null : Math.round(distributionQueue)}
              loading={loading}
              className="text-xs text-orange-600 dark:text-orange-400 ml-auto"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
