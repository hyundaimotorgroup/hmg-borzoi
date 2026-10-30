import { Card, CardContent } from "@/components/ui/card";
import {
  Globe,
  Wifi,
  Share2,
  XCircle,
  Users,
  Network,
  AlertTriangle,
} from "lucide-react";
import { ChartInfo } from "@/components/ChartInfo";
import { SummaryMetricValue } from "@/components/cluster-detail/shared/components/SummaryMetricValue";

interface HealthSummaryCardsProps {
  httpConnections: number | null;
  tcpConnections: number | null;
  interserverConnections: number | null;
  connectionErrors: number | null;
  keeperSessions: number | null;
  keeperRequests: number | null;
  keeperExceptions: number | null;
  loading?: boolean;
}

export function HealthSummaryCards({
  httpConnections,
  tcpConnections,
  interserverConnections,
  connectionErrors,
  keeperSessions,
  keeperRequests,
  keeperExceptions,
  loading = false,
}: HealthSummaryCardsProps) {
  return (
    <div className="grid grid-cols-3 md:grid-cols-7 gap-2">
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 flex flex-col">
        <CardContent className="px-4 py-3 !pb-3 flex flex-1 items-center justify-center">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <div className="flex items-baseline gap-1.5">
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">HTTP</p>
              <p className="text-[9px] text-gray-400 dark:text-gray-500">(sum)</p>
              <SummaryMetricValue
                value={httpConnections == null ? null : Math.round(httpConnections)}
                loading={loading}
                className="text-xs text-blue-600 dark:text-blue-400"
              />
              <ChartInfo
                title="HTTP Connections"
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
                yAxisLabel="Connections"
                yAxisDescription="Cluster-wide HTTP connection count (sum)"
                aggregation="sum"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 flex flex-col">
        <CardContent className="px-4 py-3 !pb-3 flex flex-1 items-center justify-center">
          <div className="flex items-center gap-2">
            <Wifi className="w-4 h-4 text-green-600 dark:text-green-400" />
            <div className="flex items-baseline gap-1.5">
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">TCP</p>
              <p className="text-[9px] text-gray-400 dark:text-gray-500">(sum)</p>
              <SummaryMetricValue
                value={tcpConnections == null ? null : Math.round(tcpConnections)}
                loading={loading}
                className="text-xs text-green-600 dark:text-green-400"
              />
              <ChartInfo
                title="TCP Connections"
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
                yAxisLabel="Connections"
                yAxisDescription="Cluster-wide TCP connection count (sum)"
                aggregation="sum"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 flex flex-col">
        <CardContent className="px-4 py-3 !pb-3 flex flex-1 items-center justify-center">
          <div className="flex items-center gap-2">
            <Share2 className="w-4 h-4 text-purple-600 dark:text-purple-400" />
            <div className="flex items-baseline gap-1.5">
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">InterSvr</p>
              <p className="text-[9px] text-gray-400 dark:text-gray-500">(sum)</p>
              <SummaryMetricValue
                value={interserverConnections == null ? null : Math.round(interserverConnections)}
                loading={loading}
                className="text-xs text-purple-600 dark:text-purple-400"
              />
              <ChartInfo
                title="InterServer Connections"
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
                yAxisLabel="Connections"
                yAxisDescription="Cluster-wide InterServer connection count (sum)"
                aggregation="sum"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 flex flex-col">
        <CardContent className="px-4 py-3 !pb-3 flex flex-1 items-center justify-center">
          <div className="flex items-center gap-2">
            <XCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
            <div className="flex items-baseline gap-1.5">
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">Errors</p>
              <p className="text-[9px] text-gray-400 dark:text-gray-500">(sum)</p>
              <SummaryMetricValue
                value={connectionErrors == null ? null : Math.round(connectionErrors)}
                loading={loading}
                className="text-xs text-red-600 dark:text-red-400"
              />
              <ChartInfo
                title="Connection Errors"
                description=""
                query={`-- snapshot: network connection errors in the last 1 minute
-- code=210 (NETWORK_ERROR)
SELECT COALESCE(count(*), 0) AS connection_errors
FROM clusterAllReplicas(
  (SELECT cluster FROM system.clusters
   WHERE is_local = 1 LIMIT 1),
  merge('system', '^error_log(_\\d+)?$')
)
PREWHERE event_date >= toDate(now() - INTERVAL 1 DAY)
     AND event_time >= now() - INTERVAL 1 MINUTE
WHERE code = 210
 SETTINGS skip_unavailable_shards = 1`}
                yAxisLabel="Error count"
                yAxisDescription="Cluster-wide connection error count (sum)"
                aggregation="sum"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 flex flex-col">
        <CardContent className="px-4 py-3 !pb-3 flex flex-1 items-center justify-center">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-orange-600 dark:text-orange-400" />
            <div className="flex items-baseline gap-1.5">
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">Keeper</p>
              <p className="text-[9px] text-gray-400 dark:text-gray-500">(avg)</p>
              <SummaryMetricValue
                value={keeperSessions == null ? null : Math.round(keeperSessions)}
                loading={loading}
                className="text-xs text-orange-600 dark:text-orange-400"
              />
              <ChartInfo
                title="Keeper Sessions"
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
                yAxisLabel="Sessions"
                yAxisDescription="Cluster-wide Keeper session count (sum)"
                aggregation="sum"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 flex flex-col">
        <CardContent className="px-4 py-3 !pb-3 flex flex-1 items-center justify-center">
          <div className="flex items-center gap-2">
            <Network className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
            <div className="flex items-baseline gap-1.5">
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">K.Reqs</p>
              <p className="text-[9px] text-gray-400 dark:text-gray-500">(avg)</p>
              <SummaryMetricValue
                value={keeperRequests == null ? null : Math.round(keeperRequests)}
                loading={loading}
                className="text-xs text-cyan-600 dark:text-cyan-400"
              />
              <p className="text-[9px] text-gray-500 dark:text-gray-400">/m</p>
              <ChartInfo
                title="Keeper Requests per Minute"
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
                yAxisLabel="Requests/min"
                yAxisDescription="Cluster-wide Keeper requests per minute (sum across nodes)"
                aggregation="avg"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 flex flex-col">
        <CardContent className="px-4 py-3 !pb-3 flex flex-1 items-center justify-center">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
            <div className="flex items-baseline gap-1.5">
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">K.Excpt</p>
              <p className="text-[9px] text-gray-400 dark:text-gray-500">(sum)</p>
              <SummaryMetricValue
                value={keeperExceptions == null ? null : Math.round(keeperExceptions)}
                loading={loading}
                className="text-xs text-yellow-600 dark:text-yellow-400"
              />
              <ChartInfo
                title="Keeper Session Expired"
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
                yAxisLabel="Expired sessions"
                yAxisDescription="Max expired Keeper sessions across the cluster (max)"
                aggregation="max"
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
