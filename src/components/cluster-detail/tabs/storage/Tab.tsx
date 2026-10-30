import { useMemo } from "react";
import { type DashboardTimeRange } from "@/lib/metrics/timeseries-range";
import { useDashboardControls } from "@/lib/hooks/use-dashboard-controls";
import type { ClusterWithMetrics } from "@/lib/services/cluster.service";
import { Database, TrendingUp, Layers, ArrowUpDown, GitMerge } from "lucide-react";
import { useSettings } from "@/contexts/SettingsContext";
import { formatBytesPerSecond } from "@/lib/utils/format-bytes";
import { convertTabTimeseriesForChart, type TimeRange } from "@/components/cluster-detail/shared/lib/chartConverters";
import { OVERVIEW_CARD_FIELDS } from "@/components/cluster-detail/hooks/useOverviewData";
import { useStorageData } from "@/components/cluster-detail/hooks/useStorageData";
import { useOverviewTimeseries } from "@/components/cluster-detail/hooks/useOverviewTimeseries";
import { StorageSummaryCards } from "./StorageSummaryCards";
import { MetricChart } from "@/components/cluster-detail/shared/charts/MetricChart";
import { NodeTimeseriesChart } from "@/components/cluster-detail/shared/charts/NodeTimeseriesChart";
import { DatabaseDiskUsageTable } from "./DatabaseDiskUsageTable";
import { PartsStatusTable } from "./PartsStatusTable";
import { useNodeSelectionFocus } from "@/components/cluster-detail/shared/hooks/useNodeSelectionFocus";
import { TabChartGroupCard } from "@/components/cluster-detail/shared/components/TabChartGroupCard";
import { buildNodeSelectionItems } from "@/components/cluster-detail/shared/lib/nodeSelectionItems";
import { buildDisplayNodes } from "@/components/cluster-detail/shared/lib/nodeDisplay";
import { buildOverviewNodeChartQueries, buildStorageChartQueries } from "@/components/cluster-detail/shared/lib/displayTimeseriesQueries";
import { createClusterNodeNameResolver } from "@/components/cluster-detail/shared/lib/nodeHost";
import { getClusterMetricNumber } from "@/components/cluster-detail/shared/lib/clusterSnapshot";

const NODE_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];
const STORAGE_OVERVIEW_METRICS = ["fileDescriptors", "backgroundPool"] as const;

interface StorageTabProps {
  cluster?: ClusterWithMetrics | null;
  clusterId: string;
  loadingMetricFields?: ReadonlySet<string>;
  isActive?: boolean;
}

export function StorageTab({
  clusterId,
  cluster: clusterProp,
  loadingMetricFields,
  isActive = true,
}: StorageTabProps) {
  const { timeRange, setTimeRange, refreshNonce, handleRefresh } = useDashboardControls();
  const { selectedNodes, focusedNodes, handleLegendClick, handleNodesChange, handleNodeToggle } = useNodeSelectionFocus();

  const { generalSettings } = useSettings();
  const timezone = generalSettings.timezone || "UTC";

  const cluster = clusterProp;
  const nodeItems = buildNodeSelectionItems(cluster);
  const nodes = nodeItems.map((item) => item.id);
  const displayNodes = useMemo(() => (cluster ? buildDisplayNodes(cluster) : []), [cluster]);
  const singleNodeData = selectedNodes.length === 1
    ? displayNodes.find((n) => n.id === selectedNodes[0]) ?? null
    : null;
  const nodeNameResolver = useMemo(() => createClusterNodeNameResolver(cluster), [cluster]);
  const shardReplicaMap = useMemo(() => {
    const map = new Map<string, { shard_num: number; replica_num: number }>();
    const details = (cluster?.nodeDetails ?? []) as Array<{ host_name: string; shard_num: number; replica_num: number }>;
    for (const node of details) {
      const key = nodeNameResolver(node.host_name);
      if (key) map.set(key, { shard_num: node.shard_num, replica_num: node.replica_num });
    }
    return map;
  }, [cluster?.nodeDetails, nodeNameResolver]);

  const displayQueries = useMemo(() => buildStorageChartQueries(timeRange, timezone), [timeRange, timezone]);
  const overviewDisplayQueries = useMemo(() => buildOverviewNodeChartQueries(timeRange, timezone), [timeRange, timezone]);

  const {
    diskIO,
    freeDiskSpace,
    partsCount,
    insertRateRows,
    mergeRateRows,
    partsStatusPanel,
    partsStatusByDbPanel,
    detachedSummaryPanel,
    detachedByDbPanel,
    dbDiskUsagePanel,
    partitionSummaryPanel,
  } = useStorageData(clusterId, timeRange, timezone, refreshNonce, isActive);

  const overviewTimeseries = useOverviewTimeseries(clusterId, timeRange, timezone, refreshNonce, cluster, {
    enabled: isActive,
    metrics: STORAGE_OVERVIEW_METRICS,
  });

  if (!cluster) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-gray-600 dark:text-gray-400">Loading…</div>
      </div>
    );
  }

  const summaryMetrics = {
    freeDiskSpace: getClusterMetricNumber(cluster, "freeDiskSpace"),
    diskIO: getClusterMetricNumber(cluster, "diskIO"),
    partsCount: getClusterMetricNumber(cluster, "partsCount"),
    brokenParts: getClusterMetricNumber(cluster, "brokenParts"),
    detachedParts: getClusterMetricNumber(cluster, "detachedParts"),
  };
  const summaryLoading = OVERVIEW_CARD_FIELDS.storage.some((field) => loadingMetricFields?.has(field));

  const freeDiskSpaceData = convertTabTimeseriesForChart(freeDiskSpace.data, "free_disk_space_percent", timezone, timeRange, nodeNameResolver);
  const diskIOData = convertTabTimeseriesForChart(diskIO.data, "disk_io_bytes_per_sec", timezone, timeRange, nodeNameResolver);
  const partsCountData = convertTabTimeseriesForChart(partsCount.data, "parts_count", timezone, timeRange, nodeNameResolver);
  const insertRateRowsData = convertTabTimeseriesForChart(insertRateRows.data, "inserted_rows_per_sec", timezone, timeRange, nodeNameResolver);
  const mergeRateRowsData = convertTabTimeseriesForChart(mergeRateRows.data, "merged_rows_per_sec", timezone, timeRange, nodeNameResolver);

  // Detached summary → convert to map keyed by hostname
  const filteredDetachedSummary =
    selectedNodes.length === 0
      ? detachedSummaryPanel.data
      : detachedSummaryPanel.data.filter((item) => selectedNodes.includes(nodeNameResolver(item.hostname)));
  const detachedMap = new Map(filteredDetachedSummary.map((item) => [item.hostname, item]));

  // Partition summary → convert to map keyed by hostname
  const filteredPartitionSummary =
    selectedNodes.length === 0
      ? partitionSummaryPanel.data
      : partitionSummaryPanel.data.filter((item) => selectedNodes.includes(nodeNameResolver(item.hostname)));
  const partitionSummaryMap = new Map(filteredPartitionSummary.map((item) => [item.hostname, item]));

  // Merged parts status (node + partition summary + detached)
  const filteredPartsStatus =
    selectedNodes.length === 0
      ? partsStatusPanel.data
      : partsStatusPanel.data.filter((item) => selectedNodes.includes(nodeNameResolver(item.hostname)));
  const partsStatusData = filteredPartsStatus.map((item) => {
    const shardReplica = shardReplicaMap.get(nodeNameResolver(item.hostname));
    const partInfo = partitionSummaryMap.get(item.hostname);
    return {
      ...item,
      shard_num: shardReplica?.shard_num,
      replica_num: shardReplica?.replica_num,
      total_detached: detachedMap.get(item.hostname)?.total_detached ?? 0,
      broken_parts: detachedMap.get(item.hostname)?.broken_parts ?? 0,
      total_partitions: partInfo?.total_partitions,
      avg_parts_per_partition: partInfo?.avg_parts_per_partition,
    };
  });

  // detached-by-db → convert to map keyed by "hostname|database" (node filter applied first)
  const filteredDetachedByDb =
    selectedNodes.length === 0
      ? detachedByDbPanel.data
      : detachedByDbPanel.data.filter((item) => selectedNodes.includes(nodeNameResolver(item.hostname ?? "")));
  const detachedByDbMap = new Map(filteredDetachedByDb.map((item) => [`${item.hostname}|${item.database}`, item]));

  // Parts status by DB + detached/broken merge
  const filteredPartsStatusByDb = (
    selectedNodes.length === 0
      ? partsStatusByDbPanel.data
      : partsStatusByDbPanel.data.filter((item) => selectedNodes.includes(nodeNameResolver(item.hostname ?? "")))
  ).map((item) => {
    const detached = detachedByDbMap.get(`${item.hostname}|${item.database}`);
    return {
      ...item,
      total_detached: detached?.total_detached ?? 0,
      broken_parts:   detached?.broken_parts   ?? 0,
    };
  });

  // DB disk usage
  const filteredDbDiskUsage = (
    selectedNodes.length === 0
      ? dbDiskUsagePanel.data
      : dbDiskUsagePanel.data.filter((item) => selectedNodes.includes(nodeNameResolver(item.hostname)))
  ).map((item) => {
    const shardReplica = shardReplicaMap.get(nodeNameResolver(item.hostname ?? ""));
    return { ...item, shard_num: shardReplica?.shard_num, replica_num: shardReplica?.replica_num };
  });

  const chartCommonProps = {
    nodes,
    selectedNodes,
    colors: NODE_COLORS,
    focusedNodes,
    onLegendClick: handleLegendClick,
    onSummaryRowClick: handleNodeToggle,
    timeRange,
    timezone,
  };

  function handleTimeRangeChange(range: TimeRange | DashboardTimeRange) {
    if (typeof range !== 'string') {
      setTimeRange(range);
    }
  }

  const tableLoading =
    partsStatusPanel.loading ||
    partsStatusByDbPanel.loading ||
    detachedSummaryPanel.loading ||
    detachedByDbPanel.loading ||
    partitionSummaryPanel.loading;

  const refreshing =
    tableLoading ||
    dbDiskUsagePanel.loading ||
    diskIO.loading ||
    freeDiskSpace.loading ||
    partsCount.loading ||
    insertRateRows.loading ||
    mergeRateRows.loading ||
    overviewTimeseries.fileDescriptors.loading ||
    overviewTimeseries.backgroundPool.loading;

  return (
    <div className="space-y-4">
      <StorageSummaryCards metrics={summaryMetrics} loading={summaryLoading} />

      <TabChartGroupCard
        title="Storage"
        icon={<Database className="w-4 h-4" />}
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
        <div className="grid grid-cols-1 gap-4 mb-3">
          <PartsStatusTable
            partsStatusData={partsStatusData}
            byDbData={filteredPartsStatusByDb}
            selectedNodes={selectedNodes}
            loading={tableLoading}
            nodeNameResolver={nodeNameResolver}
          />
          <DatabaseDiskUsageTable
            data={filteredDbDiskUsage}
            selectedNodes={selectedNodes}
            loading={dbDiskUsagePanel.loading}
            nodeNameResolver={nodeNameResolver}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <MetricChart
            {...chartCommonProps}
            title="Free Disk Space"
            icon={<Database className="w-5 h-5 text-green-600 dark:text-green-400" />}
            data={freeDiskSpaceData}
            unit="%"
            yAxisDomain={[0, 100]}
            yAxisFormatter={(value) => `${value}%`}
            loading={freeDiskSpace.loading}
            error={freeDiskSpace.error}
            onRetry={freeDiskSpace.retry}
            chartQuery={displayQueries.freeDiskSpace}
            yAxisLabel="%"
            yAxisDescription="avg(FilesystemMainPathAvailableBytes / FilesystemMainPathTotalBytes × 100) → average free disk space per interval (%)"
            aggregation="avg"
          />

          <MetricChart
            {...chartCommonProps}
            title="Disk I/O"
            icon={<TrendingUp className="w-5 h-5 text-purple-600 dark:text-purple-400" />}
            data={diskIOData}
            valueFormatter={formatBytesPerSecond}
            loading={diskIO.loading}
            error={diskIO.error}
            onRetry={diskIO.retry}
            chartQuery={displayQueries.diskIO}
            yAxisFormatter={formatBytesPerSecond}
            yAxisLabel="Throughput"
            yAxisDescription="(sum(OSReadBytes) + sum(OSWriteBytes)) / intervalSeconds → average disk I/O throughput (bytes/s)"
            aggregation="sum / time-normalized"
          />

          <MetricChart
            {...chartCommonProps}
            title="Parts Count"
            icon={<Layers className="w-5 h-5 text-orange-600 dark:text-orange-400" />}
            data={partsCountData}
            unit=" parts"
            loading={partsCount.loading}
            error={partsCount.error}
            onRetry={partsCount.retry}
            chartQuery={displayQueries.partsCount}
            yAxisLabel="Count"
            yAxisDescription="avg(CurrentMetric_PartsActive) → average active parts count per interval"
            aggregation="avg"
          />

          <MetricChart
            {...chartCommonProps}
            title="INSERT Rate (Rows/s)"
            icon={<ArrowUpDown className="w-5 h-5 text-blue-600 dark:text-blue-400" />}
            data={insertRateRowsData}
            unit=" rows/s"
            loading={insertRateRows.loading}
            error={insertRateRows.error}
            onRetry={insertRateRows.retry}
            chartQuery={displayQueries.insertRateRows}
            yAxisLabel="Rows/s"
            yAxisDescription="sum(ProfileEvent_InsertedRows) / intervalSeconds → row ingestion rate via INSERT. If higher than Merge Rate, parts will accumulate."
            aggregation="sum / time-normalized"
          />

          <MetricChart
            {...chartCommonProps}
            title="Merge Rate (Rows/s)"
            icon={<GitMerge className="w-5 h-5 text-green-600 dark:text-green-400" />}
            data={mergeRateRowsData}
            unit=" rows/s"
            loading={mergeRateRows.loading}
            error={mergeRateRows.error}
            onRetry={mergeRateRows.retry}
            chartQuery={displayQueries.mergeRateRows}
            yAxisLabel="Rows/s"
            yAxisDescription="sum(ProfileEvent_MergedRows) / intervalSeconds → row throughput processed by merges. If lower than INSERT Rate, level-0 parts accumulate → Too Many Parts risk."
            aggregation="sum / time-normalized"
          />

          <NodeTimeseriesChart
            title="File Descriptors"
            icon={<Database className="w-5 h-5 text-orange-600 dark:text-orange-400" />}
            valueKey="file_descriptors"
            timeseries={overviewTimeseries.fileDescriptors}
            nodes={nodes}
            selectedNodes={selectedNodes}
            focusedNodes={focusedNodes}
            onLegendClick={handleLegendClick}
            timeRange={timeRange}
            timezone={timezone}
            chartQuery={overviewDisplayQueries.fileDescriptors}
            yAxisLabel="FDs"
            yAxisDescription="avg(CurrentMetric_OpenFileForRead + CurrentMetric_OpenFileForWrite) → average open file descriptor count per interval"
            aggregation="avg"
            nodeNameResolver={nodeNameResolver}
            onSummaryRowClick={handleNodeToggle}
          />

          <NodeTimeseriesChart
            title="Background Pool"
            icon={<TrendingUp className="w-5 h-5 text-blue-600 dark:text-blue-400" />}
            valueKey="background_tasks"
            timeseries={overviewTimeseries.backgroundPool}
            nodes={nodes}
            selectedNodes={selectedNodes}
            focusedNodes={focusedNodes}
            onLegendClick={handleLegendClick}
            timeRange={timeRange}
            timezone={timezone}
            chartQuery={overviewDisplayQueries.backgroundPool}
            yAxisLabel="Tasks"
            yAxisDescription="sum of max tasks per background pool type → total background pool utilization"
            aggregation="sum of per-pool max"
            nodeNameResolver={nodeNameResolver}
            onSummaryRowClick={handleNodeToggle}
          />
        </div>
      </TabChartGroupCard>
    </div>
  );
}
