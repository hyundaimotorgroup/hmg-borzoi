import { useEffect, useMemo, useState } from "react";
import { type DashboardTimeRange } from "@/lib/metrics/timeseries-range";
import { useDashboardControls } from "@/lib/hooks/use-dashboard-controls";
import type { ClusterWithMetrics } from "@/lib/services/cluster.service";
import { useSettings } from "@/contexts/SettingsContext";
import { convertTabTimeseriesForChart, type TimeRange } from "@/components/cluster-detail/shared/lib/chartConverters";
import { OVERVIEW_CARD_FIELDS } from "@/components/cluster-detail/hooks/useOverviewData";
import { useOperationsData, type BadReplicaItem } from "@/components/cluster-detail/hooks/useOperationsData";
import { DDLQueuePanel } from "./DDLQueuePanel";
import { DistributionQueuePanel } from "./DistributionQueuePanel";
import { MutationsPanel } from "./MutationsPanel";
import { ProblemReplicasPanel } from "./ProblemReplicasPanel";
import { ReplicationQueuePanel } from "./ReplicationQueuePanel";
import { OperationsSummaryCards } from "./OperationsSummaryCards";
import { OperationsMetricsPanel } from "./OperationsMetricsPanel";
import { ActiveMergesPanel } from "./ActiveMergesPanel";
import { useNodeSelectionFocus } from "@/components/cluster-detail/shared/hooks/useNodeSelectionFocus";
import { GitMerge } from "lucide-react";
import { TabChartGroupCard } from "@/components/cluster-detail/shared/components/TabChartGroupCard";
import { buildNodeSelectionItems } from "@/components/cluster-detail/shared/lib/nodeSelectionItems";
import { buildDisplayNodes } from "@/components/cluster-detail/shared/lib/nodeDisplay";
import { createClusterNodeNameResolver, getNodeLabelFromHost } from "@/components/cluster-detail/shared/lib/nodeHost";
import { getClusterMetricNumber } from "@/components/cluster-detail/shared/lib/clusterSnapshot";

interface OperationsTabProps {
  cluster?: ClusterWithMetrics | null;
  clusterId: string;
  loadingMetricFields?: ReadonlySet<string>;
  isActive?: boolean;
}

export function OperationsTab({
  clusterId,
  cluster: clusterProp,
  loadingMetricFields,
  isActive = true,
}: OperationsTabProps) {
  const { timeRange, setTimeRange, refreshNonce, handleRefresh } = useDashboardControls();
  const [lazyBadReplicasDetail, setLazyBadReplicasDetail] = useState<BadReplicaItem[]>([]);
  const { selectedNodes, focusedNodes, handleLegendClick, handleNodesChange, handleNodeToggle } = useNodeSelectionFocus();

  const { generalSettings } = useSettings();
  const timezone = generalSettings.timezone || "UTC";

  const selectedNodeQueryValue = useMemo(() => {
    if (selectedNodes.length !== 1) return "all";

    const selectedNodeName = selectedNodes[0];
    const details = (clusterProp?.nodeDetails || []) as Array<{ host_name?: string; host_address?: string; runtime_host_name?: string }>;
    const matched = details.find((node) => getNodeLabelFromHost(node.host_name) === selectedNodeName);

    return matched?.runtime_host_name || matched?.host_address || matched?.host_name || selectedNodeName;
  }, [clusterProp?.nodeDetails, selectedNodes]);

  // DDL queue host column stores the same FQDN as system.clusters.host_name
  const selectedNodeHostNameQueryValue = useMemo(() => {
    if (selectedNodes.length !== 1) return "all";

    const selectedNodeName = selectedNodes[0];
    const details = (clusterProp?.nodeDetails || []) as Array<{ host_name?: string }>;
    const matched = details.find((node) => getNodeLabelFromHost(node.host_name) === selectedNodeName);

    return matched?.host_name || selectedNodeName;
  }, [clusterProp?.nodeDetails, selectedNodes]);

  const {
    replicationLag,
    activeMerges,
    mergeBytes,
    replicationQueue,
    activeMutations,
    mutationBytes,
    distributionQueue,
    replicationQueuePanel,
    distributionQueuePanel,
    mutationsPanel,
    activeMergesPanel,
    ddlQueuePanel,
  } = useOperationsData(clusterId, timeRange, timezone, refreshNonce, selectedNodeQueryValue, selectedNodeHostNameQueryValue, isActive);

  function handleTimeRangeChange(range: TimeRange | DashboardTimeRange) {
    if (typeof range !== 'string') {
      setTimeRange(range);
    }
  }


  useEffect(() => {
    if (!clusterProp) {
      return;
    }

    if (!isActive) {
      return;
    }

    const controller = new AbortController();

    fetch(`/api/clusters/${clusterId}/bad-replicas`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Failed to fetch bad replicas: ${response.status}`);
        }

        const json = await response.json() as { badReplicasDetail?: BadReplicaItem[] };
        setLazyBadReplicasDetail(json.badReplicasDetail || []);
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }

        setLazyBadReplicasDetail([]);
      });

    return () => controller.abort();
  }, [clusterId, clusterProp, isActive, refreshNonce]);

  const displayNodes = useMemo(() => (clusterProp ? buildDisplayNodes(clusterProp) : []), [clusterProp]);
  const nodeNameResolver = useMemo(() => createClusterNodeNameResolver(clusterProp), [clusterProp]);
  const shardReplicaMap = useMemo(() => {
    const map = new Map<string, { shard_num: number; replica_num: number }>();
    const details = (clusterProp?.nodeDetails ?? []) as Array<{ host_name: string; shard_num: number; replica_num: number }>;
    for (const node of details) {
      const key = nodeNameResolver(node.host_name);
      if (key) map.set(key, { shard_num: node.shard_num, replica_num: node.replica_num });
    }
    return map;
  }, [clusterProp?.nodeDetails, nodeNameResolver]);

  if (!clusterProp) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-gray-600 dark:text-gray-400">Loading…</div>
      </div>
    );
  }

  const cluster = clusterProp;
  const badReplicasDetail = lazyBadReplicasDetail;

  const nodeItems = buildNodeSelectionItems(cluster);
  const nodes = nodeItems.map((item) => item.id);
  const singleNodeData = selectedNodes.length === 1
    ? displayNodes.find((n) => n.id === selectedNodes[0]) ?? null
    : null;
  const summaryLoading = OVERVIEW_CARD_FIELDS.operations.some((field) => loadingMetricFields?.has(field));

  const replicationLagData = convertTabTimeseriesForChart(replicationLag.data, "replication_delay_seconds", timezone, timeRange, nodeNameResolver);
  const activeMergesData = convertTabTimeseriesForChart(activeMerges.data, "active_merges", timezone, timeRange, nodeNameResolver);
  const mergeBytesData = convertTabTimeseriesForChart(mergeBytes.data, "merge_bytes_per_sec", timezone, timeRange, nodeNameResolver);
  const replicationQueueData = convertTabTimeseriesForChart(replicationQueue.data, "queue_size", timezone, timeRange, nodeNameResolver);
  const activeMutationsData = convertTabTimeseriesForChart(activeMutations.data, "active_mutations", timezone, timeRange, nodeNameResolver);
  const mutationBytesData = convertTabTimeseriesForChart(mutationBytes.data, "mutation_bytes_per_sec", timezone, timeRange, nodeNameResolver);
  const distributionQueueData = convertTabTimeseriesForChart(distributionQueue.data, "queue_files", timezone, timeRange, nodeNameResolver);
  const refreshing =
    replicationQueuePanel.loading ||
    distributionQueuePanel.loading ||
    mutationsPanel.loading ||
    activeMergesPanel.loading ||
    activeMerges.loading ||
    mergeBytes.loading ||
    activeMutations.loading ||
    mutationBytes.loading ||
    replicationLag.loading ||
    replicationQueue.loading ||
    distributionQueue.loading;

  return (
    <div className="space-y-4">
      <OperationsSummaryCards
        activeMerges={getClusterMetricNumber(cluster, "activeMerges")}
        activeMutations={getClusterMetricNumber(cluster, "activeMutations")}
        replicationLag={getClusterMetricNumber(cluster, "replicationLag")}
        replicationQueue={getClusterMetricNumber(cluster, "replicationQueueCount")}
        distributionQueue={getClusterMetricNumber(cluster, "pendingDistribution")}
        loading={summaryLoading}
      />

      <TabChartGroupCard
        title="Operations"
        icon={<GitMerge className="w-4 h-4" />}
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
        <div className="space-y-4">
          <OperationsMetricsPanel
            activeMerges={{ data: activeMergesData, loading: activeMerges.loading, error: activeMerges.error, retry: activeMerges.retry }}
            mergeBytes={{ data: mergeBytesData, loading: mergeBytes.loading, error: mergeBytes.error, retry: mergeBytes.retry }}
            activeMutations={{ data: activeMutationsData, loading: activeMutations.loading, error: activeMutations.error, retry: activeMutations.retry }}
            mutationBytes={{ data: mutationBytesData, loading: mutationBytes.loading, error: mutationBytes.error, retry: mutationBytes.retry }}
            replicationLag={{ data: replicationLagData, loading: replicationLag.loading, error: replicationLag.error, retry: replicationLag.retry }}
            replicationQueue={{ data: replicationQueueData, loading: replicationQueue.loading, error: replicationQueue.error, retry: replicationQueue.retry }}
            distributionQueue={{ data: distributionQueueData, loading: distributionQueue.loading, error: distributionQueue.error, retry: distributionQueue.retry }}
            nodes={nodes}
            selectedNodes={selectedNodes}
            focusedNodes={focusedNodes}
            onLegendClick={handleLegendClick}
            onSummaryRowClick={handleNodeToggle}
            timeRange={timeRange}
            timezone={timezone}
          />

          <div className="grid grid-cols-1 gap-4">
            <DistributionQueuePanel
              data={distributionQueuePanel.data.map((item) => {
                const sr = shardReplicaMap.get(nodeNameResolver(item.hostname));
                return { ...item, shard_num: sr?.shard_num, replica_num: sr?.replica_num };
              })}
              selectedNodes={selectedNodes}
              loading={distributionQueuePanel.loading}
              nodeNameResolver={nodeNameResolver}
            />

            <DDLQueuePanel
              data={ddlQueuePanel.data}
              loading={ddlQueuePanel.loading}
              selectedNodes={selectedNodes}
              nodeNameResolver={nodeNameResolver}
            />

            <ActiveMergesPanel
              data={activeMergesPanel.data.map((item) => {
                const sr = shardReplicaMap.get(nodeNameResolver(item.hostname ?? ""));
                return { ...item, shard_num: sr?.shard_num, replica_num: sr?.replica_num };
              })}
              selectedNodes={selectedNodes}
              loading={activeMergesPanel.loading}
              nodeNameResolver={nodeNameResolver}
            />

            <MutationsPanel
              data={mutationsPanel.data.map((item) => {
                const sr = shardReplicaMap.get(nodeNameResolver(item.hostname ?? ""));
                return { ...item, shard_num: sr?.shard_num, replica_num: sr?.replica_num };
              })}
              selectedNodes={selectedNodes}
              loading={mutationsPanel.loading}
              nodeNameResolver={nodeNameResolver}
            />

            <ProblemReplicasPanel
              badReplicasDetail={badReplicasDetail.map((item) => {
                const sr = shardReplicaMap.get(nodeNameResolver(item.hostname));
                return { ...item, shard_num: sr?.shard_num, replica_num: sr?.replica_num };
              })}
              selectedNodes={selectedNodes}
              loading={false}
              nodeNameResolver={nodeNameResolver}
            />

            <ReplicationQueuePanel
              data={replicationQueuePanel.data.map((item) => {
                const sr = shardReplicaMap.get(nodeNameResolver(item.hostname));
                return { ...item, shard_num: sr?.shard_num, replica_num: sr?.replica_num };
              })}
              selectedNodes={selectedNodes}
              loading={replicationQueuePanel.loading}
              nodeNameResolver={nodeNameResolver}
            />
          </div>
        </div>
      </TabChartGroupCard>
    </div>
  );
}
