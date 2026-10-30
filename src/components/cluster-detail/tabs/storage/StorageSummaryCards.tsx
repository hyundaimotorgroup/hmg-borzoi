import { Card, CardContent } from "@/components/ui/card";
import { Database, TrendingUp, Layers, FileX } from "lucide-react";
import { ChartInfo } from "@/components/ChartInfo";
import { formatBytesPerSecond } from "@/lib/utils/format-bytes";
import { SummaryMetricValue } from "@/components/cluster-detail/shared/components/SummaryMetricValue";

interface StorageSummaryMetrics {
  freeDiskSpace: number | null;
  diskIO: number | null;
  partsCount: number | null;
  brokenParts: number | null;
  detachedParts: number | null;
}

interface StorageSummaryCardsProps {
  metrics: StorageSummaryMetrics;
  loading?: boolean;
}

export function StorageSummaryCards({ metrics, loading = false }: StorageSummaryCardsProps) {
  return (
    <div className="grid grid-cols-5 md:grid-cols-5 gap-2">
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 flex flex-col">
        <CardContent className="px-4 py-3 !pb-3 flex flex-1 items-center justify-center">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-green-600 dark:text-green-400" />
            <div className="flex items-baseline gap-1.5">
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">Free Disk Space</p>
              <p className="text-[9px] text-gray-400 dark:text-gray-500">(avg)</p>
              <SummaryMetricValue
                value={metrics.freeDiskSpace == null ? null : metrics.freeDiskSpace.toFixed(2)}
                loading={loading}
                className="text-xs text-green-600 dark:text-green-400"
              />
              <p className="text-[9px] text-gray-500 dark:text-gray-400">%</p>
            </div>
            <ChartInfo
              title="Free Disk Space"
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
              yAxisLabel="%"
              yAxisDescription="Free disk space ratio (average across nodes)"
              aggregation="avg"
            />
          </div>
        </CardContent>
      </Card>

      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 flex flex-col">
        <CardContent className="px-4 py-3 !pb-3 flex flex-1 items-center justify-center">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-purple-600 dark:text-purple-400" />
            <div className="flex items-baseline gap-1.5">
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">Disk I/O</p>
              <p className="text-[9px] text-gray-400 dark:text-gray-500">(avg)</p>
              <SummaryMetricValue
                value={metrics.diskIO == null ? null : formatBytesPerSecond(metrics.diskIO)}
                loading={loading}
                className="text-xs text-purple-600 dark:text-purple-400"
              />
            </div>
            <ChartInfo
              title="Disk I/O"
              description=""
              query={`SELECT
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
SETTINGS skip_unavailable_shards = 1`}
              yAxisLabel="Throughput"
              yAxisDescription="Current disk I/O throughput (average, bytes/s)"
              aggregation="avg"
            />
          </div>
        </CardContent>
      </Card>

      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 flex flex-col">
        <CardContent className="px-4 py-3 !pb-3 flex flex-1 items-center justify-center">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-orange-600 dark:text-orange-400" />
            <div className="flex items-baseline gap-1.5">
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">Parts Count</p>
              <p className="text-[9px] text-gray-400 dark:text-gray-500">(sum)</p>
              <SummaryMetricValue
                value={metrics.partsCount == null ? null : Math.round(metrics.partsCount)}
                loading={loading}
                className="text-xs text-orange-600 dark:text-orange-400"
              />
              <p className="text-[9px] text-gray-500 dark:text-gray-400">parts</p>
            </div>
            <ChartInfo
              title="Parts Count"
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
              yAxisLabel="Count"
              yAxisDescription="Total count of currently active parts"
              aggregation="sum"
            />
          </div>
        </CardContent>
      </Card>

      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 flex flex-col">
        <CardContent className="px-4 py-3 !pb-3 flex flex-1 items-center justify-center">
          <div className="flex items-center gap-2">
            <FileX className="w-4 h-4 text-red-600 dark:text-red-400" />
            <div className="flex items-baseline gap-1.5">
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">Broken</p>
              <p className="text-[9px] text-gray-400 dark:text-gray-500">(sum)</p>
              <SummaryMetricValue
                value={metrics.brokenParts == null ? null : Math.round(metrics.brokenParts)}
                loading={loading}
                className={`text-xs ${metrics.brokenParts != null && metrics.brokenParts > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-600 dark:text-gray-400'}`}
              />
              <p className="text-[9px] text-gray-500 dark:text-gray-400">parts</p>
            </div>
            <ChartInfo
              title="Broken Parts"
              description=""
              query={`SELECT
  countIf(reason ILIKE '%broken%' OR reason ILIKE '%corrupt%' OR reason ILIKE '%checksum%') AS broken_parts,
  count() AS detached_parts
FROM clusterAllReplicas(
  (SELECT cluster FROM system.clusters WHERE is_local = 1 LIMIT 1),
  system.detached_parts
)
SETTINGS skip_unavailable_shards = 1`}
              yAxisLabel="Count"
              yAxisDescription="Total count of currently broken parts"
              aggregation="sum"
            />
          </div>
        </CardContent>
      </Card>

      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 flex flex-col">
        <CardContent className="px-4 py-3 !pb-3 flex flex-1 items-center justify-center">
          <div className="flex items-center gap-2">
            <FileX className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
            <div className="flex items-baseline gap-1.5">
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">Detached</p>
              <p className="text-[9px] text-gray-400 dark:text-gray-500">(sum)</p>
              <SummaryMetricValue
                value={metrics.detachedParts == null ? null : Math.round(metrics.detachedParts)}
                loading={loading}
                className={`text-xs ${metrics.detachedParts != null && metrics.detachedParts > 0 ? 'text-yellow-600 dark:text-yellow-400' : 'text-gray-600 dark:text-gray-400'}`}
              />
              <p className="text-[9px] text-gray-500 dark:text-gray-400">parts</p>
            </div>
            <ChartInfo
              title="Detached Parts"
              description=""
              query={`SELECT
  countIf(reason ILIKE '%broken%' OR reason ILIKE '%corrupt%' OR reason ILIKE '%checksum%') AS broken_parts,
  count() AS detached_parts
FROM clusterAllReplicas(
  (SELECT cluster FROM system.clusters WHERE is_local = 1 LIMIT 1),
  system.detached_parts
)
SETTINGS skip_unavailable_shards = 1`}
              yAxisLabel="Count"
              yAxisDescription="Total count of currently detached parts"
              aggregation="sum"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
