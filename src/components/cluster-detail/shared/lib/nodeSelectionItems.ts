import type { ClusterWithMetrics } from "@/lib/services/cluster.service";
import { buildDisplayNodes } from "@/components/cluster-detail/shared/lib/nodeDisplay";
import type { NodeSelectionItem } from "@/components/cluster-detail/shared/components/NodeSelectionChips";

export function buildNodeSelectionItems(cluster: ClusterWithMetrics | null | undefined): NodeSelectionItem[] {
  if (!cluster) {
    return [];
  }

  return buildDisplayNodes(cluster).map((node) => ({
    id: node.id,
    label: node.name,
    status: node.status,
    issueReasons: node.issueReasons,
  }));
}
