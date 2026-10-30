import type { DashboardTimeRange } from "@/lib/metrics/timeseries-range";
import type { TabTimeseriesRow, TimeRange } from "@/components/cluster-detail/shared/lib/chartConverters";
import { getChartMetricState, useChartMetricStates, type ChartMetricState } from "./useChartMetricStates";
import { usePanelData, type PanelState } from "./usePanelData";

const STORAGE_METRICS = [
  "diskIO",
  "freeDiskSpace",
  "partsCount",
  "insertRateRows",
  "mergeRateRows",
] as const;

export interface PartsStatusItem {
  hostname: string;
  shard_num?: number;
  replica_num?: number;
  active_parts?: number;
  active_bytes_gb?: number;
  small_parts_ratio?: number;
  level0_parts?: number;
  level0_ratio?: number;
  inactive_parts?: number;
  max_refcount?: number;
  total_detached?: number;
  broken_parts?: number;
  // Fields merged from partition summary
  total_partitions?: number;
  avg_parts_per_partition?: number;
}

export interface DetachedSummaryItem {
  hostname: string;
  total_detached?: number;
  broken_parts?: number;
}

export interface DetachedByDbItem {
  hostname?: string;
  database?: string;
  total_detached?: number;
  broken_parts?: number;
}

export interface PartsStatusByDbItem {
  hostname?: string;
  database?: string;
  active_parts?: number;
  total_partitions?: number;
  avg_parts_per_partition?: number;
  level0_parts?: number;
  level0_ratio?: number;
  small_parts_ratio?: number;
  inactive_parts?: number;
  tables?: number;
  total_detached?: number;
  broken_parts?: number;
}

export interface DatabaseDiskUsageItem {
  hostname?: string;
  shard_num?: number;
  replica_num?: number;
  database?: string;
  active_size_gb?: number;
  active_parts?: number;
  tables?: number;
  total_disk_gb?: number;
  usage_pct?: number;
}

export interface PartitionCardinalitySummaryItem {
  hostname: string;
  total_active_parts?: number;
  total_partitions?: number;
  total_tables?: number;
  avg_parts_per_partition?: number;
  level0_parts?: number;
  level0_ratio?: number;
}

export type StorageChartState = ChartMetricState<TabTimeseriesRow>;

export interface StorageDataResult {
  diskIO:             StorageChartState;
  freeDiskSpace:      StorageChartState;
  partsCount:         StorageChartState;
  insertRateRows: StorageChartState;
  mergeRateRows:  StorageChartState;
  partsStatusPanel:        PanelState<PartsStatusItem>;
  partsStatusByDbPanel:    PanelState<PartsStatusByDbItem>;
  detachedSummaryPanel:    PanelState<DetachedSummaryItem>;
  detachedByDbPanel:       PanelState<DetachedByDbItem>;
  dbDiskUsagePanel:        PanelState<DatabaseDiskUsageItem>;
  partitionSummaryPanel:   PanelState<PartitionCardinalitySummaryItem>;
}

export function useStorageData(
  clusterId: string,
  timeRange: TimeRange | DashboardTimeRange,
  timezone: string,
  refreshNonce: number,
  isActive: boolean = true
): StorageDataResult {
  const enabled = isActive;
  const metricStates = useChartMetricStates(clusterId, STORAGE_METRICS, timeRange, { enabled, timezone, refreshNonce });

  const base = enabled ? `/api/clusters/${clusterId}/parts` : null;
  const deps = [clusterId, refreshNonce, isActive];

  const partsStatusPanel      = usePanelData<PartsStatusItem>(base ? `${base}/status` : null, enabled, deps);
  const partsStatusByDbPanel  = usePanelData<PartsStatusByDbItem>(base ? `${base}/status-by-db` : null, enabled, deps);
  const detachedSummaryPanel  = usePanelData<DetachedSummaryItem>(base ? `${base}/detached-summary` : null, enabled, deps);
  const detachedByDbPanel     = usePanelData<DetachedByDbItem>(base ? `${base}/detached-by-db` : null, enabled, deps);
  const dbDiskUsagePanel      = usePanelData<DatabaseDiskUsageItem>(base ? `${base}/db-disk-usage` : null, enabled, deps);
  const partitionSummaryPanel = usePanelData<PartitionCardinalitySummaryItem>(base ? `${base}/partition-summary` : null, enabled, deps);

  return {
    diskIO:             getChartMetricState<TabTimeseriesRow>(metricStates, "diskIO", metricStates.diskIO?.retry),
    freeDiskSpace:      getChartMetricState<TabTimeseriesRow>(metricStates, "freeDiskSpace", metricStates.freeDiskSpace?.retry),
    partsCount:         getChartMetricState<TabTimeseriesRow>(metricStates, "partsCount", metricStates.partsCount?.retry),
    insertRateRows: getChartMetricState<TabTimeseriesRow>(metricStates, "insertRateRows", metricStates.insertRateRows?.retry),
    mergeRateRows:  getChartMetricState<TabTimeseriesRow>(metricStates, "mergeRateRows", metricStates.mergeRateRows?.retry),
    partsStatusPanel,
    partsStatusByDbPanel,
    detachedSummaryPanel,
    detachedByDbPanel,
    dbDiskUsagePanel,
    partitionSummaryPanel,
  };
}
