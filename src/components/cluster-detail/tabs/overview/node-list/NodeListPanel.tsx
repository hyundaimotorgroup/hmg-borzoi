"use client";

import { logger } from "@/lib/utils/logger";
import { formatBytes } from "@/lib/utils/format-bytes";

import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { Activity, Cpu, Database, GitMerge, HardDrive, Network, Server } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { DashboardTimeRange } from "@/lib/metrics/timeseries-range";
import type { ClusterWithMetrics } from "@/lib/services/cluster.service";
import { useOverviewTimeseries } from "@/components/cluster-detail/hooks/useOverviewTimeseries";
import { buildDisplayNodes, type NodeDisplay } from "@/components/cluster-detail/shared/lib/nodeDisplay";
import { NodeTimeseriesChart } from "@/components/cluster-detail/shared/charts/NodeTimeseriesChart";
import { buildOverviewNodeChartQueries } from "@/components/cluster-detail/shared/lib/displayTimeseriesQueries";
import { createClusterNodeNameResolver, getNodeLabelFromHost } from "@/components/cluster-detail/shared/lib/nodeHost";
import { TabChartGroupCard } from "@/components/cluster-detail/shared/components/TabChartGroupCard";

export type { NodeDisplay } from "@/components/cluster-detail/shared/lib/nodeDisplay";

const NODE_LIST_OVERVIEW_METRICS = [
  "memory",
  "cpu",
  "currentQueryMemory",
  "distributionQueue",
  "httpConnections",
  "tcpConnections",
  "disk",
  "partsCount",
] as const;

interface NodeListPanelProps {
  clusterId: string;
  cluster: ClusterWithMetrics;
  isActive?: boolean;
  timezone: string;
  timeRange: DashboardTimeRange;
  onTimeRangeChange: (range: DashboardTimeRange) => void;
  refreshNonce: number;
  onRefresh: () => void;
}

export function NodeListPanel({ clusterId, cluster, isActive = true, timezone, timeRange, onTimeRangeChange, refreshNonce, onRefresh }: NodeListPanelProps) {
  // selectedNodes: clicking a node chip filters the chart to show only that node (empty array = all)
  const [selectedNodes, setSelectedNodes] = useState<string[]>([]);
  // focusedNodes: clicking a legend/line renders that node fully opaque and dims the rest (empty array = all equal)
  const [focusedNodes, setFocusedNodes] = useState<string[]>([]);
  const [nodeDetails, setNodeDetails] = useState(cluster.nodeDetails || []);
  const [nodeDetailsLoading, setNodeDetailsLoading] = useState(!(cluster.nodeDetails && cluster.nodeDetails.length > 0));
  const [nodeDetailsError, setNodeDetailsError] = useState<string | null>(null);

  useEffect(() => {
    if (cluster.nodeDetails && cluster.nodeDetails.length > 0) {
      setNodeDetails(cluster.nodeDetails);
      setNodeDetailsLoading(false);
      setNodeDetailsError(null);
      return;
    }

    if (!isActive) {
      return;
    }

    setNodeDetails([]);

    const controller = new AbortController();

    async function fetchNodeDetails() {
      try {
        setNodeDetailsLoading(true);
        setNodeDetailsError(null);

        const response = await fetch(`/api/clusters/${clusterId}/nodes`, {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`Failed to fetch node details: ${response.status}`);
        }

        const data = (await response.json()) as { nodeDetails?: ClusterWithMetrics["nodeDetails"] };
        setNodeDetails(data.nodeDetails || []);
      } catch (error: unknown) {
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }

        logger.error("[NodeListPanel] Error fetching node details:", error);
        setNodeDetailsError("Failed to load node details.");
      } finally {
        if (!controller.signal.aborted) {
          setNodeDetailsLoading(false);
        }
      }
    }

    fetchNodeDetails();

    return () => {
      controller.abort();
    };
  }, [cluster.nodeDetails, clusterId, isActive]);

  const timeseriesData = useOverviewTimeseries(
    clusterId,
    timeRange,
    timezone,
    refreshNonce,
    cluster,
    { enabled: isActive, metrics: NODE_LIST_OVERVIEW_METRICS }
  );
  const deferredFocusedNodes = useDeferredValue(focusedNodes);
  const chartsRefreshing =
    isActive && (
      timeseriesData.memory.loading ||
      timeseriesData.cpu.loading ||
      timeseriesData.currentQueryMemory.loading ||
      timeseriesData.distributionQueue.loading ||
      timeseriesData.httpConnections.loading ||
      timeseriesData.tcpConnections.loading ||
      timeseriesData.disk.loading ||
      timeseriesData.partsCount.loading
    );
  const displayQueries = useMemo(() => buildOverviewNodeChartQueries(timeRange, timezone), [timeRange, timezone]);
  const clusterWithNodeDetails = useMemo(
    () => ({ ...cluster, nodeDetails }),
    [cluster, nodeDetails]
  );

  const nodes = useMemo(
    () => Array.from(new Set((cluster.nodeList || []).map((n) => getNodeLabelFromHost(n)).filter(Boolean))),
    [cluster.nodeList]
  );

  const displayNodes: NodeDisplay[] = useMemo(
    () => buildDisplayNodes(clusterWithNodeDetails),
    [clusterWithNodeDetails]
  );
  const chartNodes = useMemo(
    () => (displayNodes.length > 0 ? displayNodes.map((node) => node.name) : nodes),
    [displayNodes, nodes]
  );
  const nodeNameResolver = useMemo(
    () => createClusterNodeNameResolver(clusterWithNodeDetails),
    [clusterWithNodeDetails]
  );

  // Show single node detail view only when exactly one node is selected
  const singleNodeData: NodeDisplay | null = useMemo(() => {
    if (selectedNodes.length !== 1) return null;
    return displayNodes.find((n) => n.id === selectedNodes[0]) ?? null;
  }, [selectedNodes, displayNodes]);

  const toggleSelectedNode = useCallback((id: string) => {
    setSelectedNodes((prev) =>
      prev.includes(id) ? prev.filter((nodeId) => nodeId !== id) : [...prev, id]
    );
    setFocusedNodes([]);
  }, []);


  // Legend/line click → toggle focusedNodes (opacity control)
  // Parse node name from network/background pool line names
  const normalizeNodeName = useCallback((name: string) => {
    return name
      .replace(/-(receive|send)$/i, '')
      .replace(/ (Receive|Send|RX|TX|Active|Queued)$/i, '');
  }, []);

  const handleFocusNode = useCallback((rawName: string) => {
    const name = normalizeNodeName(rawName);
    setFocusedNodes((prev) => (prev.length === 1 && prev[0] === name ? [] : [name]));
  }, [normalizeNodeName]);

  const handleLegendClick = useCallback((dataKey: string) => {
    handleFocusNode(dataKey);
  }, [handleFocusNode]);

  const handleSummaryRowClick = useCallback((label: string) => {
    toggleSelectedNode(normalizeNodeName(label));
  }, [normalizeNodeName, toggleSelectedNode]);

  return (
    <TabChartGroupCard
      title="Overview"
      icon={<Server className="w-4 h-4" />}
      timeRange={timeRange}
      timezone={timezone}
      onTimeRangeChange={onTimeRangeChange}
      onRefresh={onRefresh}
      refreshing={chartsRefreshing}
      selectedNodes={selectedNodes}
      onNodesChange={(nodes) => { setSelectedNodes(nodes); setFocusedNodes([]); }}
      nodes={nodes}
      nodeItems={displayNodes.map((node) => ({ id: node.id, label: node.name, status: node.status, issueReasons: node.issueReasons }))}
      focusedNodes={focusedNodes}
      singleNodeData={singleNodeData}
      headerExtra={nodeDetailsLoading ? (
        <span className="text-[11px] text-gray-500 dark:text-gray-400">Node metadata loading…</span>
      ) : undefined}
    >
          {singleNodeData && nodeDetailsLoading && (
            <div className="pb-2 mb-4 border-b border-gray-300 dark:border-slate-600">
              <div className="flex gap-4 items-center">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-5 w-14" />
                <Skeleton className="h-5 w-14" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-24" />
              </div>
            </div>
          )}

          {nodeDetailsError && (
            <div className="text-xs text-red-600 dark:text-red-400 mb-2">
              {nodeDetailsError}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
              <NodeTimeseriesChart
                title="Memory Usage"
                icon={<Database className="w-4 h-4 text-blue-600" />}
                valueKey="memory_usage_percent"
                timeseries={timeseriesData.memory}
                nodes={chartNodes}
                selectedNodes={selectedNodes}
                focusedNodes={deferredFocusedNodes}
                onLegendClick={handleLegendClick}
                timeRange={timeRange}
                timezone={timezone}
                chartQuery={displayQueries.memory}
                yAxisLabel="%"
                yAxisDescription="avg(MemoryResident / MemoryVirtual) → average memory usage per interval (%)"
                aggregation="avg"
                yAxisDomain={[0, 100]}
                nodeNameResolver={nodeNameResolver}
                onSummaryRowClick={handleSummaryRowClick}
                keepUnselectedVisible
              />

              <NodeTimeseriesChart
                title="CPU Usage"
                icon={<Cpu className="w-4 h-4 text-purple-600" />}
                valueKey="cpu_usage_percent"
                timeseries={timeseriesData.cpu}
                nodes={chartNodes}
                selectedNodes={selectedNodes}
                focusedNodes={deferredFocusedNodes}
                onLegendClick={handleLegendClick}
                timeRange={timeRange}
                timezone={timezone}
                chartQuery={displayQueries.cpu}
                yAxisLabel="%"
                yAxisDescription="sum(CPUtime_μs) / interval_seconds / logical_cores × 100 → ClickHouse CPU utilization per interval (%)"
                aggregation="time-normalized, ratio against core count"
                unit="%"
                yAxisDomain={[0, 100]}
                nodeNameResolver={nodeNameResolver}
                onSummaryRowClick={handleSummaryRowClick}
                keepUnselectedVisible
              />

              <NodeTimeseriesChart
                title="Tracked Process Memory (byte)"
                icon={<Database className="w-4 h-4 text-orange-600" />}
                valueKey="current_memory_bytes"
                timeseries={timeseriesData.currentQueryMemory}
                nodes={chartNodes}
                selectedNodes={selectedNodes}
                focusedNodes={deferredFocusedNodes}
                onLegendClick={handleLegendClick}
                timeRange={timeRange}
                timezone={timezone}
                chartQuery={displayQueries.currentQueryMemory}
                yAxisLabel="Memory"
                yAxisDescription="max(CurrentMetric_MemoryTracking) → peak tracked process memory within the interval (bytes)"
                aggregation="max"
                yAxisFormatter={formatBytes}
                valueFormatter={formatBytes}
                nodeNameResolver={nodeNameResolver}
                onSummaryRowClick={handleSummaryRowClick}
                keepUnselectedVisible
              />

              <NodeTimeseriesChart
                title="Distribution Queue"
                icon={<GitMerge className="w-4 h-4 text-orange-600" />}
                valueKey="queue_files"
                timeseries={timeseriesData.distributionQueue}
                nodes={chartNodes}
                selectedNodes={selectedNodes}
                focusedNodes={deferredFocusedNodes}
                onLegendClick={handleLegendClick}
                timeRange={timeRange}
                timezone={timezone}
                chartQuery={displayQueries.distributionQueue}
                yAxisLabel="files"
                yAxisDescription="max(CurrentMetric_DistributedFilesToInsert) → peak distribution queue file count within the interval"
                aggregation="max"
                nodeNameResolver={nodeNameResolver}
                onSummaryRowClick={handleSummaryRowClick}
                keepUnselectedVisible
              />

              <NodeTimeseriesChart
                title="HTTP Connections"
                icon={<Network className="w-4 h-4 text-blue-600" />}
                valueKey="http_connections"
                timeseries={timeseriesData.httpConnections}
                nodes={chartNodes}
                selectedNodes={selectedNodes}
                focusedNodes={deferredFocusedNodes}
                onLegendClick={handleLegendClick}
                timeRange={timeRange}
                timezone={timezone}
                chartQuery={displayQueries.httpConnections}
                yAxisLabel="connections"
                yAxisDescription="max(CurrentMetric_HTTPConnection) → peak HTTP connection count within the interval"
                aggregation="max"
                nodeNameResolver={nodeNameResolver}
                onSummaryRowClick={handleSummaryRowClick}
                keepUnselectedVisible
              />

              <NodeTimeseriesChart
                title="TCP Connections"
                icon={<Activity className="w-4 h-4 text-green-600" />}
                valueKey="tcp_connections"
                timeseries={timeseriesData.tcpConnections}
                nodes={chartNodes}
                selectedNodes={selectedNodes}
                focusedNodes={deferredFocusedNodes}
                onLegendClick={handleLegendClick}
                timeRange={timeRange}
                timezone={timezone}
                chartQuery={displayQueries.tcpConnections}
                yAxisLabel="connections"
                yAxisDescription="max(CurrentMetric_TCPConnection) → peak TCP connection count within the interval"
                aggregation="max"
                nodeNameResolver={nodeNameResolver}
                onSummaryRowClick={handleSummaryRowClick}
                keepUnselectedVisible
              />

              <NodeTimeseriesChart
                title="Disk Usage"
                icon={<HardDrive className="w-4 h-4 text-orange-600" />}
                valueKey="disk_usage_percent"
                timeseries={timeseriesData.disk}
                nodes={chartNodes}
                selectedNodes={selectedNodes}
                focusedNodes={deferredFocusedNodes}
                onLegendClick={handleLegendClick}
                timeRange={timeRange}
                timezone={timezone}
                chartQuery={displayQueries.disk}
                yAxisLabel="%"
                yAxisDescription="avg(FilesystemMainPathUsedBytes / FilesystemMainPathTotalBytes × 100) → average disk usage per interval (%)"
                aggregation="avg"
                yAxisDomain={[0, 100]}
                nodeNameResolver={nodeNameResolver}
                onSummaryRowClick={handleSummaryRowClick}
                keepUnselectedVisible
              />

              <NodeTimeseriesChart
                title="Parts Count"
                icon={<Server className="w-4 h-4 text-sky-600" />}
                valueKey="parts_count"
                timeseries={timeseriesData.partsCount}
                nodes={chartNodes}
                selectedNodes={selectedNodes}
                focusedNodes={deferredFocusedNodes}
                onLegendClick={handleLegendClick}
                timeRange={timeRange}
                timezone={timezone}
                chartQuery={displayQueries.partsCount}
                yAxisLabel="parts"
                yAxisDescription="avg(CurrentMetric_PartsActive) → average active parts count within the interval"
                aggregation="avg"
                nodeNameResolver={nodeNameResolver}
                onSummaryRowClick={handleSummaryRowClick}
                keepUnselectedVisible
              />
            </div>
    </TabChartGroupCard>
  );
}
