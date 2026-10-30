import { useMemo } from "react";
import {
  describeDashboardTimeRange,
  type DashboardTimeRange,
} from "@/lib/metrics/timeseries-range";
import { useDashboardControls } from "@/lib/hooks/use-dashboard-controls";
import type { ClusterWithMetrics } from "@/lib/services/cluster.service";
import { Terminal, Clock, TrendingUp, TrendingDown, Activity, Database } from "lucide-react";
import type { TimeRange } from "@/components/cluster-detail/shared/lib/chartConverters";
import { useSettings } from "@/contexts/SettingsContext";
import { formatBytes, formatBytesPerSecond } from "@/lib/utils/format-bytes";
import { MetricChart } from "@/components/cluster-detail/shared/charts/MetricChart";
import { OVERVIEW_CARD_FIELDS } from "@/components/cluster-detail/hooks/useOverviewData";
import { useQueriesData } from "@/components/cluster-detail/hooks/useQueriesData";
import { QuerySummaryCards } from "./QuerySummaryCards";
import { QueryTypeChart } from "./QueryTypeChart";
import { FailedQueriesTable } from "./FailedQueriesTable";
import { NodeQueryDistributionTable } from "./NodeQueryDistributionTable";
import { useNodeSelectionFocus } from "@/components/cluster-detail/shared/hooks/useNodeSelectionFocus";
import { TabChartGroupCard } from "@/components/cluster-detail/shared/components/TabChartGroupCard";
import { buildNodeSelectionItems } from "@/components/cluster-detail/shared/lib/nodeSelectionItems";
import { buildDisplayNodes } from "@/components/cluster-detail/shared/lib/nodeDisplay";
import { buildQueriesChartQueries, buildQueriesPanelDisplayQueries } from "@/components/cluster-detail/shared/lib/displayTimeseriesQueries";
import { createClusterNodeNameResolver } from "@/components/cluster-detail/shared/lib/nodeHost";
import { getClusterMetricNumber } from "@/components/cluster-detail/shared/lib/clusterSnapshot";

interface QueriesTabProps {
  clusterId: string;
  cluster?: ClusterWithMetrics | null;
  loadingMetricFields?: ReadonlySet<string>;
  isActive?: boolean;
}

const NODE_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];

export function QueriesTab({
  clusterId,
  cluster: clusterProp,
  loadingMetricFields,
  isActive = true,
}: QueriesTabProps) {
  const { timeRange, setTimeRange, refreshNonce, handleRefresh } = useDashboardControls();
  const { selectedNodes, focusedNodes, handleLegendClick, handleNodesChange, handleNodeToggle } = useNodeSelectionFocus();

  const { generalSettings } = useSettings();
  const timezone = generalSettings.timezone || "UTC";

  const cluster = clusterProp;
  const loading = !cluster;

  const nodeItems = buildNodeSelectionItems(cluster);
  const nodes = nodeItems.map((item) => item.id);
  const displayNodes = useMemo(() => (cluster ? buildDisplayNodes(cluster) : []), [cluster]);
  const singleNodeData = selectedNodes.length === 1
    ? displayNodes.find((n) => n.id === selectedNodes[0]) ?? null
    : null;
  const nodeNameResolver = useMemo(() => createClusterNodeNameResolver(cluster), [cluster]);
  const effectiveNode = selectedNodes.length === 1 ? selectedNodes[0] : "all";
  const metrics = {
    successQueries: getClusterMetricNumber(cluster, "successQueries"),
    failedQueries: getClusterMetricNumber(cluster, "failedQueries"),
    readThroughput: getClusterMetricNumber(cluster, "readThroughput"),
    writeThroughput: getClusterMetricNumber(cluster, "writeThroughput"),
    avgQueryMemory: getClusterMetricNumber(cluster, "avgQueryMemory"),
    avgQueryDuration: getClusterMetricNumber(cluster, "avgQueryDuration"),
  };
  const summaryLoading = OVERVIEW_CARD_FIELDS.queries.some((field) => loadingMetricFields?.has(field));

  const {
    failedQueriesPanel,
    queryDistributionPanel,
    successQueriesData,
    failedQueriesData,
    readThroughputData,
    writeThroughputData,
    queryMemoryData,
    queryDurationData,
    queryTypeData,
    readRowCountData,
    writeRowCountData,
    queryQueueData,
    currentQueryMemoryData,
    chartStates,
  } = useQueriesData(clusterId, timeRange, selectedNodes, timezone, refreshNonce, !!cluster, nodeNameResolver, isActive);
  const displayQueries = useMemo(() => buildQueriesChartQueries(timeRange, timezone), [timeRange, timezone]);
  const panelDisplayQueries = useMemo(() => buildQueriesPanelDisplayQueries(timeRange, timezone), [timeRange, timezone]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-gray-600 dark:text-gray-400">Loading…</div>
      </div>
    );
  }

  const summaryMetrics = {
    successQueries: metrics.successQueries == null ? null : Math.round(metrics.successQueries),
    failedQueries: metrics.failedQueries == null ? null : Math.round(metrics.failedQueries),
    readThroughput: metrics.readThroughput,
    writeThroughput: metrics.writeThroughput,
    queryMemory: metrics.avgQueryMemory,
    queryDuration: metrics.avgQueryDuration == null ? null : Math.round(metrics.avgQueryDuration),
  };

  function handleTimeRangeChange(range: TimeRange | DashboardTimeRange) {
    if (typeof range !== 'string') {
      setTimeRange(range);
    }
  }

  const refreshing = Object.values(chartStates).some((state) => state.loading);
  const timeRangeLabel = describeDashboardTimeRange(timeRange);
  const chartCommonProps = {
    nodes,
    selectedNodes,
    colors: NODE_COLORS,
    focusedNodes,
    onLegendClick: handleLegendClick,
    onSummaryRowClick: handleNodeToggle,
  };

  return (
    <div className="space-y-4">
      <QuerySummaryCards metrics={summaryMetrics} loading={summaryLoading} />

      <TabChartGroupCard
        title="Queries"
        icon={<Terminal className="w-4 h-4" />}
        timeRange={timeRange}
        timezone={timezone}
        onTimeRangeChange={handleTimeRangeChange}
        onRefresh={handleRefresh}
        refreshing={refreshing}
        selectedNodes={selectedNodes}
        onNodesChange={handleNodesChange}
        nodes={nodes}
        nodeItems={nodeItems}
        focusedNodes={focusedNodes}
        singleNodeData={singleNodeData}
      >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <QueryTypeChart
          data={queryTypeData}
          selectedNode={effectiveNode}
          loading={chartStates.queryType.loading}
          error={chartStates.queryType.error}
          onRetry={chartStates.queryType.retry}
          query={displayQueries.queryType}
        />

        <div className="lg:col-span-2">
          <FailedQueriesTable
            failedQueries={failedQueriesPanel.data}
            loadingFailed={failedQueriesPanel.loading}
            timezone={timezone}
            selectedNode={effectiveNode}
            timeRangeLabel={timeRangeLabel}
            nodeNameResolver={nodeNameResolver}
            chartQuery={panelDisplayQueries.failedQueries}
          />
        </div>

        <MetricChart
          {...chartCommonProps}
          title="Success Queries"
          icon={<Terminal className="w-5 h-5 text-green-600" />}
          data={successQueriesData}
          unit=""
          loading={chartStates.successQueries.loading}
          error={chartStates.successQueries.error}
          onRetry={chartStates.successQueries.retry}
          chartQuery={displayQueries.successQueries}
          yAxisLabel="Count"
          yAxisDescription="countIf(type='QueryFinish') → finished queries per time interval (including sub-queries)"
          aggregation="sum"
        />

        <MetricChart
          {...chartCommonProps}
          title="Failed Queries"
          icon={<Activity className="w-5 h-5 text-red-600" />}
          data={failedQueriesData}
          unit=""
          loading={chartStates.failedQueriesTs.loading}
          error={chartStates.failedQueriesTs.error}
          onRetry={chartStates.failedQueriesTs.retry}
          chartQuery={displayQueries.failedQueries}
          yAxisLabel="Count"
          yAxisDescription="countIf(Exception*) → failed queries per time interval (including sub-queries)"
          aggregation="sum"
        />

        <MetricChart
          {...chartCommonProps}
          title="Query Duration"
          icon={<Clock className="w-5 h-5 text-yellow-600" />}
          data={queryDurationData}
          unit=" MS"
          loading={chartStates.queryDuration.loading}
          error={chartStates.queryDuration.error}
          onRetry={chartStates.queryDuration.retry}
          chartQuery={displayQueries.queryDuration}
          yAxisLabel="MS"
          yAxisDescription="avgIf(query_duration_ms, type='QueryFinish') → average execution time of finished queries"
          aggregation="avg"
        />

        <MetricChart
          {...chartCommonProps}
          title="Running Query Count"
          icon={<Activity className="w-5 h-5 text-orange-600" />}
          data={queryQueueData}
          unit=""
          loading={chartStates.queryQueue.loading}
          error={chartStates.queryQueue.error}
          onRetry={chartStates.queryQueue.retry}
          chartQuery={displayQueries.queryQueue}
          yAxisLabel="Count"
          yAxisDescription="avg(CurrentMetric_Query) → Gauge metric, average number of concurrently running queries per interval"
          aggregation="avg"
        />

        <MetricChart
          {...chartCommonProps}
          title="Read Throughput"
          icon={<TrendingUp className="w-5 h-5 text-blue-600" />}
          data={readThroughputData}
          valueFormatter={formatBytesPerSecond}
          loading={chartStates.readThroughput.loading}
          error={chartStates.readThroughput.error}
          onRetry={chartStates.readThroughput.retry}
          chartQuery={displayQueries.readThroughput}
          yAxisFormatter={formatBytesPerSecond}
          yAxisLabel="Throughput"
          yAxisDescription="sum(ProfileEvent_SelectedBytes) / intervalSeconds → average read throughput per second (bytes/s)"
          aggregation="sum / time-normalized"
        />

        <MetricChart
          {...chartCommonProps}
          title="Write Throughput"
          icon={<TrendingDown className="w-5 h-5 text-purple-600" />}
          data={writeThroughputData}
          valueFormatter={formatBytesPerSecond}
          loading={chartStates.writeThroughput.loading}
          error={chartStates.writeThroughput.error}
          onRetry={chartStates.writeThroughput.retry}
          chartQuery={displayQueries.writeThroughput}
          yAxisFormatter={formatBytesPerSecond}
          yAxisLabel="Throughput"
          yAxisDescription="sum(ProfileEvent_InsertedBytes) / intervalSeconds → average write throughput per second (bytes/s)"
          aggregation="sum / time-normalized"
        />

        <MetricChart
          {...chartCommonProps}
          title="Read Row Count"
          icon={<TrendingUp className="w-5 h-5 text-blue-600" />}
          data={readRowCountData}
          unit=" rows"
          loading={chartStates.readRowCount.loading}
          error={chartStates.readRowCount.error}
          onRetry={chartStates.readRowCount.retry}
          chartQuery={displayQueries.readRowCount}
          yAxisLabel="Rows"
          yAxisDescription="sum(ProfileEvent_SelectedRows) → total rows read by SELECT within the interval (delta sum)"
          aggregation="sum"
        />

        <MetricChart
          {...chartCommonProps}
          title="Write Row Count"
          icon={<TrendingDown className="w-5 h-5 text-green-600" />}
          data={writeRowCountData}
          unit=" rows"
          loading={chartStates.writeRowCount.loading}
          error={chartStates.writeRowCount.error}
          onRetry={chartStates.writeRowCount.retry}
          chartQuery={displayQueries.writeRowCount}
          yAxisLabel="Rows"
          yAxisDescription="sum(ProfileEvent_InsertedRows) → total rows written by INSERT within the interval (delta sum)"
          aggregation="sum"
        />

        <MetricChart
          {...chartCommonProps}
          title="Query Memory Usage"
          icon={<Database className="w-5 h-5 text-orange-600" />}
          data={queryMemoryData}
          valueFormatter={formatBytes}
          loading={chartStates.queryMemoryUsage.loading}
          error={chartStates.queryMemoryUsage.error}
          onRetry={chartStates.queryMemoryUsage.retry}
          chartQuery={displayQueries.queryMemoryUsage}
          yAxisFormatter={formatBytes}
          yAxisLabel="Memory"
          yAxisDescription="maxIf(memory_usage, memory_usage>0) → peak memory usage of finished/failed queries (bytes)"
          aggregation="max"
        />

        <MetricChart
          {...chartCommonProps}
          title="Tracked Process Memory"
          icon={<Terminal className="w-5 h-5 text-blue-600" />}
          data={currentQueryMemoryData}
          valueFormatter={formatBytes}
          loading={chartStates.currentQueryMemory.loading}
          error={chartStates.currentQueryMemory.error}
          onRetry={chartStates.currentQueryMemory.retry}
          chartQuery={displayQueries.currentQueryMemory}
          yAxisFormatter={formatBytes}
          yAxisLabel="Memory"
          yAxisDescription="max(CurrentMetric_MemoryTracking) → Gauge, peak tracked process memory within the interval (bytes)"
          aggregation="max"
        />
      </div>
      </TabChartGroupCard>

      <div className="grid grid-cols-1 gap-4">
        <NodeQueryDistributionTable
          data={queryDistributionPanel.data}
          loading={queryDistributionPanel.loading}
          selectedNode={effectiveNode}
          timeRangeLabel={timeRangeLabel}
          nodeNameResolver={nodeNameResolver}
          chartQuery={panelDisplayQueries.queryDistribution}
        />
      </div>
    </div>
  );
}
