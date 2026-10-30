import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Terminal, Clock, TrendingUp, TrendingDown, Activity, Database } from "lucide-react";
import { ChartInfo } from "@/components/ChartInfo";
import { formatBytes, formatBytesPerSecond } from "@/lib/utils/format-bytes";
import { SummaryMetricValue } from "@/components/cluster-detail/shared/components/SummaryMetricValue";

interface SummaryMetrics {
  successQueries: number | null;
  failedQueries: number | null;
  readThroughput: number | null;
  writeThroughput: number | null;
  queryMemory: number | null;
  queryDuration: number | null;
}

interface QuerySummaryCardsProps {
  metrics: SummaryMetrics;
  loading?: boolean;
}

interface SummaryCardProps {
  icon: ReactNode;
  label: string;
  value: number | string | null;
  loading: boolean;
  valueClassName: string;
  unit?: string;
  chartInfoTitle: string;
  chartInfoQuery: string;
  yAxisLabel: string;
  yAxisDescription: string;
  aggregation: string;
}

function SummaryCard({
  icon, label, value, loading, valueClassName, unit,
  chartInfoTitle, chartInfoQuery, yAxisLabel, yAxisDescription, aggregation,
}: SummaryCardProps) {
  return (
    <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 flex flex-col">
      <CardContent className="px-4 py-3 !pb-3 flex flex-1 items-center justify-center">
        <div className="flex items-center gap-2">
          {icon}
          <div className="flex items-baseline gap-1.5">
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-200 whitespace-nowrap">{label}</p>
            <p className="text-[9px] text-gray-400 dark:text-gray-500">(avg)</p>
            <SummaryMetricValue value={value} loading={loading} className={valueClassName} />
            {unit && <p className="text-[9px] text-gray-500 dark:text-gray-400">{unit}</p>}
          </div>
          <ChartInfo
            title={chartInfoTitle}
            description=""
            query={chartInfoQuery}
            yAxisLabel={yAxisLabel}
            yAxisDescription={yAxisDescription}
            aggregation={aggregation}
          />
        </div>
      </CardContent>
    </Card>
  );
}

const QUERY_OVERVIEW_QUERY = `SELECT
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
SETTINGS skip_unavailable_shards = 1`;

const METRIC_LOG_OVERVIEW_QUERY = `SELECT
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
SETTINGS skip_unavailable_shards = 1`;

export function QuerySummaryCards({ metrics, loading = false }: QuerySummaryCardsProps) {
  return (
    <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
      <SummaryCard
        icon={<Terminal className="w-4 h-4 text-green-600 dark:text-green-500" aria-hidden="true" />}
        label="Success"
        value={metrics.successQueries == null ? null : Math.round(metrics.successQueries)}
        loading={loading}
        valueClassName="text-xs text-green-600 dark:text-green-500"
        chartInfoTitle="Success Queries"
        chartInfoQuery={QUERY_OVERVIEW_QUERY}
        yAxisLabel="Count"
        yAxisDescription="countIf(type='QueryFinish' AND initial_query_id=query_id) → per-node count of finished top-level queries in last 1 min, then cluster avg"
        aggregation="avg"
      />

      <SummaryCard
        icon={<Activity className="w-4 h-4 text-red-600 dark:text-red-500" aria-hidden="true" />}
        label="Failed"
        value={metrics.failedQueries == null ? null : Math.round(metrics.failedQueries)}
        loading={loading}
        valueClassName="text-xs text-red-600 dark:text-red-500"
        chartInfoTitle="Failed Queries"
        chartInfoQuery={QUERY_OVERVIEW_QUERY}
        yAxisLabel="Count"
        yAxisDescription="countIf(type IN ('ExceptionBeforeStart','ExceptionWhileProcessing') AND initial_query_id=query_id) → per-node failed top-level queries in last 1 min, then cluster avg"
        aggregation="avg"
      />

      <SummaryCard
        icon={<TrendingUp className="w-4 h-4 text-blue-600 dark:text-blue-500" aria-hidden="true" />}
        label="Read"
        value={metrics.readThroughput == null ? null : formatBytesPerSecond(metrics.readThroughput)}
        loading={loading}
        valueClassName="text-xs text-blue-600 dark:text-blue-500"
        chartInfoTitle="Read Throughput"
        chartInfoQuery={METRIC_LOG_OVERVIEW_QUERY}
        yAxisLabel="Throughput"
        yAxisDescription="sum(ProfileEvent_SelectedBytes)/60 → per-node average read throughput (bytes/s) over last 1 min, then cluster avg"
        aggregation="sum / time-normalized → avg"
      />

      <SummaryCard
        icon={<TrendingDown className="w-4 h-4 text-purple-600 dark:text-purple-500" aria-hidden="true" />}
        label="Write"
        value={metrics.writeThroughput == null ? null : formatBytesPerSecond(metrics.writeThroughput)}
        loading={loading}
        valueClassName="text-xs text-purple-600 dark:text-purple-500"
        chartInfoTitle="Write Throughput"
        chartInfoQuery={METRIC_LOG_OVERVIEW_QUERY}
        yAxisLabel="Throughput"
        yAxisDescription="sum(ProfileEvent_InsertedBytes)/60 → per-node average write throughput (bytes/s) over last 1 min, then cluster avg"
        aggregation="sum / time-normalized → avg"
      />

      <SummaryCard
        icon={<Database className="w-4 h-4 text-orange-600 dark:text-orange-500" aria-hidden="true" />}
        label="Memory"
        value={metrics.queryMemory == null ? null : formatBytes(metrics.queryMemory)}
        loading={loading}
        valueClassName="text-xs text-orange-600 dark:text-orange-500"
        chartInfoTitle="Query Memory"
        chartInfoQuery={QUERY_OVERVIEW_QUERY}
        yAxisLabel="Memory"
        yAxisDescription="avgIf(memory_usage, type='QueryFinish' AND memory_usage>0) → per-node avg memory of finished top-level queries in last 1 min, then cluster avg"
        aggregation="avg"
      />

      <SummaryCard
        icon={<Clock className="w-4 h-4 text-yellow-600 dark:text-yellow-500" aria-hidden="true" />}
        label="Avg Duration"
        value={metrics.queryDuration == null ? null : Math.round(metrics.queryDuration)}
        loading={loading}
        valueClassName="text-xs text-yellow-600 dark:text-yellow-500"
        unit="MS"
        chartInfoTitle="Avg Query Duration"
        chartInfoQuery={QUERY_OVERVIEW_QUERY}
        yAxisLabel="MS"
        yAxisDescription="avgIf(query_duration_ms, type='QueryFinish' AND initial_query_id=query_id) → per-node avg execution time of finished top-level queries in last 1 min, then cluster avg"
        aggregation="avg"
      />
    </div>
  );
}
