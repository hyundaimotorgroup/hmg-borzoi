import type { DashboardTimeRange } from "@/lib/metrics/timeseries-range";
import type { TabTimeseriesRow, TimeRange } from "@/components/cluster-detail/shared/lib/chartConverters";
import { getChartMetricState, useChartMetricStates, type ChartMetricState } from "./useChartMetricStates";

const HEALTH_METRICS = [
  "httpConnections",
  "tcpConnections",
  "interserverConnections",
  "connectionErrors",
  "keeperSessions",
  "keeperRequests",
  "keeperExceptions",
] as const;

export type HealthChartState = ChartMetricState<TabTimeseriesRow>;

export interface HealthMetricsData {
  httpConnections:        HealthChartState;
  tcpConnections:         HealthChartState;
  interserverConnections: HealthChartState;
  connectionErrors:       HealthChartState;
  keeperSessions:         HealthChartState;
  keeperRequests:         HealthChartState;
  keeperExceptions:       HealthChartState;
}

export function useHealthData(
  clusterId: string,
  timeRange: TimeRange | DashboardTimeRange,
  timezone: string,
  refreshNonce: number,
  isActive: boolean = true
): HealthMetricsData {
  const enabled = isActive;
  const metricStates = useChartMetricStates(clusterId, HEALTH_METRICS, timeRange, { enabled, timezone, refreshNonce });

  return {
    httpConnections:        getChartMetricState<TabTimeseriesRow>(metricStates, "httpConnections", metricStates.httpConnections?.retry),
    tcpConnections:         getChartMetricState<TabTimeseriesRow>(metricStates, "tcpConnections", metricStates.tcpConnections?.retry),
    interserverConnections: getChartMetricState<TabTimeseriesRow>(metricStates, "interserverConnections", metricStates.interserverConnections?.retry),
    connectionErrors:       getChartMetricState<TabTimeseriesRow>(metricStates, "connectionErrors", metricStates.connectionErrors?.retry),
    keeperSessions:         getChartMetricState<TabTimeseriesRow>(metricStates, "keeperSessions", metricStates.keeperSessions?.retry),
    keeperRequests:         getChartMetricState<TabTimeseriesRow>(metricStates, "keeperRequests", metricStates.keeperRequests?.retry),
    keeperExceptions:       getChartMetricState<TabTimeseriesRow>(metricStates, "keeperExceptions", metricStates.keeperExceptions?.retry),
  };
}
