import type { ClusterWithMetrics } from "@/lib/services/cluster.service";
import { getNodeLabelFromHost } from "@/components/cluster-detail/shared/lib/nodeHost";

export interface NodeDisplay {
  id: string;
  name: string;
  status: "healthy" | "critical" | "warning";
  issueReasons?: string[];
  ip: string;
  port: number;
  shard: number;
  replica: number;
  uptime: string;
  version: string;
  cpu: number;
  memory: number;
  disk: number;
}

export function buildDisplayNodes(cluster: ClusterWithMetrics): NodeDisplay[] {
  const uniqueNodes = new Map<string, NodeDisplay>();

  if (!cluster.nodeDetails || cluster.nodeDetails.length === 0) {
    const fallbackNodes = Array.from(
      new Set((cluster.nodeList || []).map((node) => getNodeLabelFromHost(node)).filter(Boolean))
    );

    return fallbackNodes.map((node) => ({
      id: node,
      name: node,
      status: "healthy",
      issueReasons: [],
      ip: "N/A",
      port: 9000,
      shard: 1,
      replica: 1,
      uptime: "—",
      version: "N/A",
      cpu: 0,
      memory: 0,
      disk: 0,
    }));
  }

  (cluster.nodeDetails as Array<{
    host_name: string;
    host_address: string;
    port: number;
    shard_num: number;
    replica_num: number;
    version: string;
    uptime_seconds: number;
    health?: "healthy" | "warning" | "critical";
  }>).forEach((node) => {
    const shortHostname = getNodeLabelFromHost(node.host_name);
    if (uniqueNodes.has(shortHostname)) return;

    const uptimeSeconds = node.uptime_seconds || 0;
    const days = Math.floor(uptimeSeconds / (24 * 3600));
    const hours = Math.floor((uptimeSeconds % (24 * 3600)) / 3600);

    uniqueNodes.set(shortHostname, {
      id: shortHostname,
      name: shortHostname,
      status: node.health || "healthy",
      issueReasons: [],
      ip: node.host_address || "N/A",
      port: node.port || 9000,
      shard: node.shard_num || 1,
      replica: node.replica_num || 1,
      uptime: `${days}d ${hours}h`,
      version: node.version || "N/A",
      cpu: 0,
      memory: 0,
      disk: 0,
    });
  });

  return Array.from(uniqueNodes.values());
}
