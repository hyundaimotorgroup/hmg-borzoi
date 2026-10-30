import type { DashboardTimeRange } from "@/lib/metrics/timeseries-range";
import type { TimeRange, TabTimeseriesRow } from "@/components/cluster-detail/shared/lib/chartConverters";
import { getChartMetricState, useChartMetricStates, type ChartMetricState } from "./useChartMetricStates";
import { usePanelData, type PanelState } from "./usePanelData";

const OPERATIONS_METRICS = [
  "replicationLag",
  "activeMerges",
  "mergeBytes",
  "replicationQueue",
  "activeMutations",
  "mutationBytes",
  "distributionQueue",
] as const;

export interface ReplicationQueueItem {
  hostname?: string;
  database: string;
  table: string;
  queue?: number;
  inserts?: number;
  merges?: number;
  mutations?: number;
  postponed_merges?: number;
  last_queue?: string;
  shard_num?: number;
  replica_num?: number;
}

export interface BadReplicaItem {
  hostname?: string;
  node_is_readonly?: number;
  node_is_session_expired?: number;
  tables_future_parts?: number;
  tables_parts_check?: number;
  tables_queue_backlog?: number;
  tables_insert_backlog?: number;
  tables_log_delay?: number;
  tables_delay?: number;
  max_absolute_delay?: number;
  max_queue_size?: number;
  affected_tables?: number;
  issues?: string;
  shard_num?: number;
  replica_num?: number;
}

export interface DistributionQueueItem {
  hostname?: string;
  database: string;
  table: string;
  pending_files?: number;
  broken_files?: number;
  bytes?: string;
  oldest_age?: string;
  shard_num?: number;
  replica_num?: number;
}

export interface MutationItem {
  hostname?: string;
  shard_num?: number;
  replica_num?: number;
  database: string;
  table: string;
  mutation_id: string;
  command: string;
  create_time: string;
  parts_to_do: number;
  latest_fail_reason: string;
}

export interface DDLQueueItem {
  hostname?: string;
  cluster?: string;
  query?: string;
  initiator_host?: string;
  status?: string;
  create_time?: string;
  age_seconds?: number;
  age?: string;
  exception_text?: string;
}

export interface ActiveMergeItem {
  hostname?: string;
  shard_num?: number;
  replica_num?: number;
  database?: string;
  table?: string;
  elapsed_sec?: number;
  progress_pct?: number;
  num_parts?: number;
  is_mutation?: number;
  memory?: string;
  bytes_read?: string;
  rows_per_sec?: number;
  result_part_name?: string;
}

export type OpsChartState = ChartMetricState<TabTimeseriesRow>;

export interface OperationsDataState {
  replicationLag:    OpsChartState;
  activeMerges:      OpsChartState;
  mergeBytes:        OpsChartState;
  replicationQueue:  OpsChartState;
  activeMutations:   OpsChartState;
  mutationBytes:     OpsChartState;
  distributionQueue: OpsChartState;
  replicationQueuePanel:  PanelState<ReplicationQueueItem>;
  distributionQueuePanel: PanelState<DistributionQueueItem>;
  mutationsPanel:         PanelState<MutationItem>;
  activeMergesPanel:      PanelState<ActiveMergeItem>;
  ddlQueuePanel:          PanelState<DDLQueueItem>;
}

export function useOperationsData(
  clusterId: string,
  timeRange: TimeRange | DashboardTimeRange,
  timezone: string,
  refreshNonce: number,
  selectedNode: string,
  selectedNodeHostName: string,
  isActive: boolean = true
): OperationsDataState {
  const enabled = isActive;
  const metricStates = useChartMetricStates(clusterId, OPERATIONS_METRICS, timeRange, { enabled, timezone, refreshNonce });

  const base = enabled ? `/api/clusters/${clusterId}/operations` : null;
  const nodeParam = `node=${selectedNode}`;
  const nodeHostNameParam = `node=${selectedNodeHostName}`;

  const replicationQueuePanel = usePanelData<ReplicationQueueItem>(
    base ? `${base}/replication-queue?${nodeParam}` : null,
    enabled,
    [clusterId, selectedNode, refreshNonce, isActive]
  );

  const distributionQueuePanel = usePanelData<DistributionQueueItem>(
    base ? `${base}/distribution-queue?${nodeParam}` : null,
    enabled,
    [clusterId, selectedNode, refreshNonce, isActive]
  );

  const mutationsPanel = usePanelData<MutationItem>(
    base ? `${base}/mutations?${nodeParam}` : null,
    enabled,
    [clusterId, selectedNode, refreshNonce, isActive]
  );

  const activeMergesPanel = usePanelData<ActiveMergeItem>(
    base ? `${base}/active-merges` : null,
    enabled,
    [clusterId, refreshNonce, isActive]
  );

  const ddlQueuePanel = usePanelData<DDLQueueItem>(
    base ? `${base}/ddl-queue?${nodeHostNameParam}` : null,
    enabled,
    [clusterId, selectedNodeHostName, refreshNonce, isActive]
  );

  return {
    replicationLag:    getChartMetricState<TabTimeseriesRow>(metricStates, "replicationLag", metricStates.replicationLag?.retry),
    activeMerges:      getChartMetricState<TabTimeseriesRow>(metricStates, "activeMerges", metricStates.activeMerges?.retry),
    mergeBytes:        getChartMetricState<TabTimeseriesRow>(metricStates, "mergeBytes", metricStates.mergeBytes?.retry),
    replicationQueue:  getChartMetricState<TabTimeseriesRow>(metricStates, "replicationQueue", metricStates.replicationQueue?.retry),
    activeMutations:   getChartMetricState<TabTimeseriesRow>(metricStates, "activeMutations", metricStates.activeMutations?.retry),
    mutationBytes:     getChartMetricState<TabTimeseriesRow>(metricStates, "mutationBytes", metricStates.mutationBytes?.retry),
    distributionQueue: getChartMetricState<TabTimeseriesRow>(metricStates, "distributionQueue", metricStates.distributionQueue?.retry),
    replicationQueuePanel,
    distributionQueuePanel,
    mutationsPanel,
    activeMergesPanel,
    ddlQueuePanel,
  };
}
