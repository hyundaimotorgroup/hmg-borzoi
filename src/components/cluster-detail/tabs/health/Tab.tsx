import { useMemo } from "react";
import { type DashboardTimeRange } from "@/lib/metrics/timeseries-range";
import { useDashboardControls } from "@/lib/hooks/use-dashboard-controls";
import type { ClusterWithMetrics } from "@/lib/services/cluster.service";
import {
  Network,
  Users,
  XCircle,
  Globe,
  Wifi,
  Share2,
  AlertTriangle,
} from "lucide-react";
import { useSettings } from "@/contexts/SettingsContext";
import { convertTabTimeseriesForChart, type TimeRange } from "@/components/cluster-detail/shared/lib/chartConverters";
import { OVERVIEW_CARD_FIELDS } from "@/components/cluster-detail/hooks/useOverviewData";
import { useHealthData } from "@/components/cluster-detail/hooks/useHealthData";
import { useOverviewTimeseries } from "@/components/cluster-detail/hooks/useOverviewTimeseries";
import { MetricChart } from "@/components/cluster-detail/shared/charts/MetricChart";
import { HealthSummaryCards } from "./HealthSummaryCards";
import { NetworkIOMetricChart } from "./NetworkIOMetricChart";
import { useNodeSelectionFocus } from "@/components/cluster-detail/shared/hooks/useNodeSelectionFocus";
import { TabChartGroupCard } from "@/components/cluster-detail/shared/components/TabChartGroupCard";
import { buildNodeSelectionItems } from "@/components/cluster-detail/shared/lib/nodeSelectionItems";
import { buildDisplayNodes } from "@/components/cluster-detail/shared/lib/nodeDisplay";
import { buildHealthChartQueries, buildOverviewNodeChartQueries } from "@/components/cluster-detail/shared/lib/displayTimeseriesQueries";
import { createClusterNodeNameResolver } from "@/components/cluster-detail/shared/lib/nodeHost";
import { getClusterMetricNumber } from "@/components/cluster-detail/shared/lib/clusterSnapshot";

interface HealthTabProps {
  cluster?: ClusterWithMetrics | null;
  clusterId: string;
  loadingMetricFields?: ReadonlySet<string>;
  isActive?: boolean;
}

const nodeColors = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];
const HEALTH_OVERVIEW_METRICS = ["network"] as const;

export function HealthTab({
  clusterId,
  cluster: clusterProp,
  loadingMetricFields,
  isActive = true,
}: HealthTabProps) {
  const { timeRange, setTimeRange, refreshNonce, handleRefresh } = useDashboardControls();
  const { selectedNodes, focusedNodes, handleLegendClick, handleNodesChange, handleNodeToggle } = useNodeSelectionFocus();
  const { generalSettings } = useSettings();
  const timezone = generalSettings.timezone || "UTC";

  const cluster = clusterProp;
  const nodeNameResolver = createClusterNodeNameResolver(cluster);
  const displayQueries = useMemo(() => buildHealthChartQueries(timeRange, timezone), [timeRange, timezone]);
  const overviewDisplayQueries = useMemo(() => buildOverviewNodeChartQueries(timeRange, timezone), [timeRange, timezone]);
  const metricsData = useHealthData(clusterId, timeRange, timezone, refreshNonce, isActive);
  const overviewTimeseries = useOverviewTimeseries(clusterId, timeRange, timezone, refreshNonce, cluster, {
    enabled: isActive,
    metrics: HEALTH_OVERVIEW_METRICS,
  });

  function handleTimeRangeChange(range: TimeRange | DashboardTimeRange) {
    if (typeof range !== 'string') {
      setTimeRange(range);
    }
  }


  const displayNodes = useMemo(() => (cluster ? buildDisplayNodes(cluster) : []), [cluster]);

  if (!cluster) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-gray-600 dark:text-gray-400">Loading…</div>
      </div>
    );
  }

  const nodeItems = buildNodeSelectionItems(cluster);
  const nodes = nodeItems.map((item) => item.id);
  const singleNodeData = selectedNodes.length === 1
    ? displayNodes.find((n) => n.id === selectedNodes[0]) ?? null
    : null;
  const summaryLoading = OVERVIEW_CARD_FIELDS.health.some((field) => loadingMetricFields?.has(field));

  const httpConnectionsData = convertTabTimeseriesForChart(metricsData.httpConnections.data, "http_connections", timezone, timeRange, nodeNameResolver);
  const tcpConnectionsData = convertTabTimeseriesForChart(metricsData.tcpConnections.data, "tcp_connections", timezone, timeRange, nodeNameResolver);
  const interserverConnectionsData = convertTabTimeseriesForChart(metricsData.interserverConnections.data, "interserver_connections", timezone, timeRange, nodeNameResolver);
  const connectionErrorsData = convertTabTimeseriesForChart(metricsData.connectionErrors.data, "connection_errors", timezone, timeRange, nodeNameResolver);
  const keeperSessionsData = convertTabTimeseriesForChart(metricsData.keeperSessions.data, "keeper_sessions", timezone, timeRange, nodeNameResolver);
  const keeperRequestsData = convertTabTimeseriesForChart(metricsData.keeperRequests.data, "keeper_requests_per_min", timezone, timeRange, nodeNameResolver);
  const keeperExceptionsData = convertTabTimeseriesForChart(metricsData.keeperExceptions.data, "keeper_exceptions", timezone, timeRange, nodeNameResolver);
  const refreshing =
    metricsData.httpConnections.loading ||
    metricsData.tcpConnections.loading ||
    metricsData.interserverConnections.loading ||
    metricsData.connectionErrors.loading ||
    metricsData.keeperSessions.loading ||
    metricsData.keeperRequests.loading ||
    metricsData.keeperExceptions.loading ||
    overviewTimeseries.network.loading;

  const chartCommonProps = {
    nodes,
    selectedNodes,
    colors: nodeColors,
    focusedNodes,
    onLegendClick: handleLegendClick,
    onSummaryRowClick: handleNodeToggle,
    timeRange,
    timezone,
  };

  return (
    <div className="space-y-4">
      <HealthSummaryCards
        httpConnections={getClusterMetricNumber(cluster, "httpConnections")}
        tcpConnections={getClusterMetricNumber(cluster, "tcpConnections")}
        interserverConnections={getClusterMetricNumber(cluster, "interserverConnections")}
        connectionErrors={getClusterMetricNumber(cluster, "connectionErrors")}
        keeperSessions={getClusterMetricNumber(cluster, "keeperSessions")}
        keeperRequests={getClusterMetricNumber(cluster, "keeperRequests")}
        keeperExceptions={getClusterMetricNumber(cluster, "keeperExceptions")}
        loading={summaryLoading}
      />

      <TabChartGroupCard
        title="Connection & Keeper"
        icon={<Network className="w-4 h-4" />}
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
        <MetricChart
          {...chartCommonProps}
          title="HTTP Connections"
          icon={<Globe className="w-5 h-5 text-blue-600 dark:text-blue-400" />}
          data={httpConnectionsData}
          loading={metricsData.httpConnections.loading}
          error={metricsData.httpConnections.error}
          onRetry={metricsData.httpConnections.retry}
          chartQuery={displayQueries.httpConnections}
          yAxisLabel="Connections"
          yAxisDescription="HTTP connection count per interval (CurrentMetric_HTTPConnection Gauge)"
          aggregation="max"
        />

        <MetricChart
          {...chartCommonProps}
          title="TCP Connections"
          icon={<Wifi className="w-5 h-5 text-green-600 dark:text-green-400" />}
          data={tcpConnectionsData}
          loading={metricsData.tcpConnections.loading}
          error={metricsData.tcpConnections.error}
          onRetry={metricsData.tcpConnections.retry}
          chartQuery={displayQueries.tcpConnections}
          yAxisLabel="Connections"
          yAxisDescription="TCP connection count per interval (CurrentMetric_TCPConnection Gauge)"
          aggregation="max"
        />

        <MetricChart
          {...chartCommonProps}
          title="InterServer Connections"
          icon={<Share2 className="w-5 h-5 text-purple-600 dark:text-purple-400" />}
          data={interserverConnectionsData}
          loading={metricsData.interserverConnections.loading}
          error={metricsData.interserverConnections.error}
          onRetry={metricsData.interserverConnections.retry}
          chartQuery={displayQueries.interserverConnections}
          yAxisLabel="Connections"
          yAxisDescription="Inter-node connection count per interval (CurrentMetric_InterserverConnection Gauge)"
          aggregation="max"
        />

        <MetricChart
          {...chartCommonProps}
          title="Connection Errors"
          icon={<XCircle className="w-5 h-5 text-red-600 dark:text-red-400" />}
          data={connectionErrorsData}
          unit=""
          loading={metricsData.connectionErrors.loading}
          error={metricsData.connectionErrors.error}
          onRetry={metricsData.connectionErrors.retry}
          chartQuery={displayQueries.errorLog}
          yAxisLabel="Count"
          yAxisDescription="count(*) / (intervalSeconds / 60) → average connection errors per minute within the interval"
          aggregation="count / time-normalized"
        />

        <MetricChart
          {...chartCommonProps}
          title="Keeper Sessions"
          icon={<Users className="w-5 h-5 text-orange-600 dark:text-orange-400" />}
          data={keeperSessionsData}
          loading={metricsData.keeperSessions.loading}
          error={metricsData.keeperSessions.error}
          onRetry={metricsData.keeperSessions.retry}
          chartQuery={displayQueries.keeperSessions}
          yAxisLabel="Sessions"
          yAxisDescription="average Keeper session count per interval (CurrentMetric_ZooKeeperSession Gauge)"
          aggregation="avg"
        />

        <MetricChart
          {...chartCommonProps}
          title="Keeper Requests"
          icon={<Network className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />}
          data={keeperRequestsData}
          unit=""
          loading={metricsData.keeperRequests.loading}
          error={metricsData.keeperRequests.error}
          onRetry={metricsData.keeperRequests.retry}
          chartQuery={displayQueries.keeperRequests}
          yAxisLabel="Count"
          yAxisDescription="sum(ProfileEvent_ZooKeeperTransactions) / (intervalSeconds / 60) → average Keeper transactions per minute within the interval"
          aggregation="sum / time-normalized"
        />

        <MetricChart
          {...chartCommonProps}
          title="Keeper Session Expired"
          icon={<AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />}
          data={keeperExceptionsData}
          loading={metricsData.keeperExceptions.loading}
          error={metricsData.keeperExceptions.error}
          onRetry={metricsData.keeperExceptions.retry}
          chartQuery={displayQueries.keeperExceptions}
          yAxisLabel="Expired Sessions"
          yAxisDescription="peak expired Keeper session count per interval (CurrentMetric_ZooKeeperSessionExpired Gauge)"
          aggregation="max"
        />

        <NetworkIOMetricChart
          title="Network I/O"
          icon={<Network className="w-5 h-5 text-green-600 dark:text-green-400" />}
          timeseries={overviewTimeseries.network}
          nodes={nodes}
          selectedNodes={selectedNodes}
          focusedNodes={focusedNodes}
          onLegendClick={handleLegendClick}
          onSummaryRowClick={handleNodeToggle}
          timeRange={timeRange}
          timezone={timezone}
          chartQuery={overviewDisplayQueries.network}
          yAxisLabel="Bytes/s"
          yAxisDescription="sum(OSNetworkReceiveBytes + OSNetworkSendBytes) / intervalSeconds → average network I/O throughput (bytes/s)"
          aggregation="sum / time-normalized"
          nodeNameResolver={nodeNameResolver}
        />
      </div>
      </TabChartGroupCard>
    </div>
  );
}
