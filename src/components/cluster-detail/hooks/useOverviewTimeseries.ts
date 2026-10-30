import type { DashboardTimeRange } from "@/lib/metrics/timeseries-range";
import type { ClusterWithMetrics } from "@/lib/services/cluster.service";
import { getChartMetricState, useChartMetricStates, type ChartMetricState } from "./useChartMetricStates";

export interface TimeseriesBasePoint {
  time: string;
  hostname: string;
}

export interface MemoryPoint extends TimeseriesBasePoint {
  memory_usage_percent: number;
}

export interface CpuPoint extends TimeseriesBasePoint {
  cpu_usage_percent: number;
}

export interface CurrentQueryMemoryPoint extends TimeseriesBasePoint {
  current_memory_bytes: number;
}

export interface DistributionQueuePoint extends TimeseriesBasePoint {
  queue_files: number;
}

export interface HttpConnectionsPoint extends TimeseriesBasePoint {
  http_connections: number;
}

export interface TcpConnectionsPoint extends TimeseriesBasePoint {
  tcp_connections: number;
}

export interface DiskPoint extends TimeseriesBasePoint {
  disk_usage_percent: number;
}

export interface PartsCountPoint extends TimeseriesBasePoint {
  parts_count: number;
}

export interface NetworkPoint extends TimeseriesBasePoint {
  network_receive_bytes_per_sec: number;
  network_send_bytes_per_sec: number;
}

export interface FileDescriptorPoint extends TimeseriesBasePoint {
  file_descriptors: number;
}

export interface BackgroundPoolPoint extends TimeseriesBasePoint {
  background_tasks: number;
}

export interface TimeseriesData {
  memory:          ChartMetricState<MemoryPoint>;
  cpu:             ChartMetricState<CpuPoint>;
  currentQueryMemory: ChartMetricState<CurrentQueryMemoryPoint>;
  distributionQueue: ChartMetricState<DistributionQueuePoint>;
  httpConnections: ChartMetricState<HttpConnectionsPoint>;
  tcpConnections: ChartMetricState<TcpConnectionsPoint>;
  disk:            ChartMetricState<DiskPoint>;
  partsCount:      ChartMetricState<PartsCountPoint>;
  network:         ChartMetricState<NetworkPoint>;
  fileDescriptors: ChartMetricState<FileDescriptorPoint>;
  backgroundPool:  ChartMetricState<BackgroundPoolPoint>;
}

const DISABLED = <T,>(): ChartMetricState<T> => ({ data: [], loading: false, error: null });

const DISABLED_DATA: TimeseriesData = {
  memory:          DISABLED<MemoryPoint>(),
  cpu:             DISABLED<CpuPoint>(),
  currentQueryMemory: DISABLED<CurrentQueryMemoryPoint>(),
  distributionQueue: DISABLED<DistributionQueuePoint>(),
  httpConnections: DISABLED<HttpConnectionsPoint>(),
  tcpConnections: DISABLED<TcpConnectionsPoint>(),
  disk:            DISABLED<DiskPoint>(),
  partsCount:      DISABLED<PartsCountPoint>(),
  network:         DISABLED<NetworkPoint>(),
  fileDescriptors: DISABLED<FileDescriptorPoint>(),
  backgroundPool:  DISABLED<BackgroundPoolPoint>(),
};

const OVERVIEW_METRICS = [
  "memory",
  "cpu",
  "currentQueryMemory",
  "distributionQueue",
  "httpConnections",
  "tcpConnections",
  "disk",
  "partsCount",
  "network",
  "fileDescriptors",
  "backgroundPool",
] as const;

export type OverviewTimeseriesMetric = (typeof OVERVIEW_METRICS)[number];

export function useOverviewTimeseries(
  clusterId: string,
  timeRange: DashboardTimeRange,
  timezone: string,
  refreshNonce: number,
  cluster: ClusterWithMetrics | null | undefined,
  options?: { enabled?: boolean; metrics?: readonly OverviewTimeseriesMetric[] }
): TimeseriesData {
  const enabled = !!cluster && (options?.enabled ?? true);
  const requestedMetrics = options?.metrics ?? OVERVIEW_METRICS;
  const requestedMetricSet = new Set<OverviewTimeseriesMetric>(requestedMetrics);
  const metricStates = useChartMetricStates(clusterId, requestedMetrics, timeRange, {
    enabled,
    timezone,
    refreshNonce,
    preserveStateWhenDisabled: true,
  });

  if (!cluster) return DISABLED_DATA;

  const getRequestedMetricState = <T,>(metric: OverviewTimeseriesMetric): ChartMetricState<T> => {
    if (!requestedMetricSet.has(metric)) {
      return DISABLED<T>();
    }

    return getChartMetricState<T>(metricStates, metric, metricStates[metric]?.retry);
  };

  return {
    memory: getRequestedMetricState<MemoryPoint>("memory"),
    cpu: getRequestedMetricState<CpuPoint>("cpu"),
    currentQueryMemory: getRequestedMetricState<CurrentQueryMemoryPoint>("currentQueryMemory"),
    distributionQueue: getRequestedMetricState<DistributionQueuePoint>("distributionQueue"),
    httpConnections: getRequestedMetricState<HttpConnectionsPoint>("httpConnections"),
    tcpConnections: getRequestedMetricState<TcpConnectionsPoint>("tcpConnections"),
    disk: getRequestedMetricState<DiskPoint>("disk"),
    partsCount: getRequestedMetricState<PartsCountPoint>("partsCount"),
    network: getRequestedMetricState<NetworkPoint>("network"),
    fileDescriptors: getRequestedMetricState<FileDescriptorPoint>("fileDescriptors"),
    backgroundPool: getRequestedMetricState<BackgroundPoolPoint>("backgroundPool"),
  };
}
