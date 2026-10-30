import { useMemo } from "react";
import { GitMerge, Zap, Clock, Share2, Database, RefreshCw } from "lucide-react";
import type { DashboardTimeRange } from "@/lib/metrics/timeseries-range";
import { formatBytesPerSecond } from "@/lib/utils/format-bytes";
import { MetricChart } from "@/components/cluster-detail/shared/charts/MetricChart";
import type { TimeRange } from "@/components/cluster-detail/shared/lib/chartConverters";
import { buildOperationsChartQueries } from "@/components/cluster-detail/shared/lib/displayTimeseriesQueries";

interface ChartDataWithState {
  data: Record<string, unknown>[];
  loading?: boolean;
  error?: string | null;
  retry?: () => void;
}

interface OperationsMetricsPanelProps {
  activeMerges:      ChartDataWithState;
  mergeBytes:        ChartDataWithState;
  activeMutations:   ChartDataWithState;
  mutationBytes:     ChartDataWithState;
  replicationLag:    ChartDataWithState;
  replicationQueue:  ChartDataWithState;
  distributionQueue: ChartDataWithState;
  nodes: string[];
  selectedNodes: string[];
  focusedNodes: string[];
  onLegendClick: (dataKey: string) => void;
  onSummaryRowClick?: (label: string) => void;
  timeRange: TimeRange | DashboardTimeRange;
  timezone: string;
}

const NODE_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];

export function OperationsMetricsPanel({
  activeMerges,
  mergeBytes,
  activeMutations,
  mutationBytes,
  replicationLag,
  replicationQueue,
  distributionQueue,
  timeRange,
  timezone,
  nodes,
  selectedNodes,
  focusedNodes,
  onLegendClick,
  onSummaryRowClick,
}: OperationsMetricsPanelProps) {
  const common = { nodes, selectedNodes, colors: NODE_COLORS, chartType: "line" as const, focusedNodes, onLegendClick, onSummaryRowClick, timeRange, timezone };
  const displayQueries = useMemo(() => buildOperationsChartQueries(timeRange, timezone), [timeRange, timezone]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <MetricChart
        {...common}
        title="Active Merges"
        icon={<GitMerge className="w-5 h-5 text-purple-600 dark:text-purple-400" />}
        data={activeMerges.data}
        loading={activeMerges.loading}
        error={activeMerges.error}
        onRetry={activeMerges.retry}
        unit=""
        chartQuery={displayQueries.activeMerges}
        yAxisLabel="Count"
        yAxisDescription="max(CurrentMetric_Merge) → peak active merge count within the interval (ongoing part merges)"
        aggregation="max"
      />

      <MetricChart
        {...common}
        title="Merge Throughput"
        icon={<Database className="w-5 h-5 text-purple-600 dark:text-purple-400" />}
        data={mergeBytes.data}
        loading={mergeBytes.loading}
        error={mergeBytes.error}
        onRetry={mergeBytes.retry}
        valueFormatter={formatBytesPerSecond}
        chartQuery={displayQueries.mergeBytes}
        yAxisFormatter={formatBytesPerSecond}
        yAxisLabel="Throughput"
        yAxisDescription="sum(ProfileEvent_MergedUncompressedBytes) / intervalSeconds → average merge throughput (bytes/s)"
        aggregation="sum / time-normalized"
      />

      <MetricChart
        {...common}
        title="Active Mutations"
        icon={<Zap className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />}
        data={activeMutations.data}
        loading={activeMutations.loading}
        error={activeMutations.error}
        onRetry={activeMutations.retry}
        unit=""
        chartQuery={displayQueries.activeMutations}
        yAxisLabel="Count"
        yAxisDescription="max(CurrentMetric_PartMutation) → peak active mutation count within the interval (ongoing ALTER UPDATE/DELETE)"
        aggregation="max"
      />

      <MetricChart
        {...common}
        title="Mutation Throughput"
        icon={<Database className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />}
        data={mutationBytes.data}
        loading={mutationBytes.loading}
        error={mutationBytes.error}
        onRetry={mutationBytes.retry}
        valueFormatter={formatBytesPerSecond}
        chartQuery={displayQueries.mutationBytes}
        yAxisFormatter={formatBytesPerSecond}
        yAxisLabel="Throughput"
        yAxisDescription="sum(ProfileEvent_MutatedUncompressedBytes) / intervalSeconds → average mutation throughput (bytes/s)"
        aggregation="sum / time-normalized"
      />

      <MetricChart
        {...common}
        title="Replication Lag"
        icon={<Clock className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />}
        data={replicationLag.data}
        loading={replicationLag.loading}
        error={replicationLag.error}
        onRetry={replicationLag.retry}
        unit="s"
        chartQuery={displayQueries.replicationLag}
        yAxisLabel="Seconds"
        yAxisDescription="max(ReplicasMaxAbsoluteDelay) → peak absolute replication lag within the interval (seconds); worst replica across the cluster"
        aggregation="max"
      />

      <MetricChart
        {...common}
        title="Replication Queue"
        icon={<RefreshCw className="w-5 h-5 text-green-600 dark:text-green-400" />}
        data={replicationQueue.data}
        loading={replicationQueue.loading}
        error={replicationQueue.error}
        onRetry={replicationQueue.retry}
        unit=""
        chartQuery={displayQueries.replicationQueue}
        yAxisLabel="Queue Size"
        yAxisDescription="max(ReplicasSumQueueSize) → peak replication queue depth within the interval (sum across all replicas)"
        aggregation="max"
      />

      <MetricChart
        {...common}
        title="Distribution Queue (Pending Files)"
        icon={<Share2 className="w-5 h-5 text-orange-600 dark:text-orange-400" />}
        data={distributionQueue.data}
        loading={distributionQueue.loading}
        error={distributionQueue.error}
        onRetry={distributionQueue.retry}
        unit=""
        chartQuery={displayQueries.distributionQueue}
        yAxisLabel="Pending Files"
        yAxisDescription="max(CurrentMetric_DistributedFilesToInsert) → peak pending distributed insert file count within the interval (distributed table insert queue)"
        aggregation="max"
      />

      <div className="hidden lg:block" />
    </div>
  );
}
