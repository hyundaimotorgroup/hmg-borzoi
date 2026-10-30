import { useState, useCallback, useEffect } from "react";
import { logger } from "@/lib/utils/logger";
import type { Cluster } from "@/lib/services/cluster.service";
import type {
  ClusterConnectionTestInput,
  CreateClusterInput,
  UpdateClusterInput,
} from "@/lib/validation";

interface ClusterSummaryResponse {
  status: Cluster['status'];
  nodes: number | null;
  version: string | null;
  uptime: string | null;
}

export interface ApiClusterRaw {
  id: string;
  name: string;
  host: string;
  port: number;
  protocol: 'http';
  username: string;
  password?: string;
  useTLS?: boolean;
  environment: 'dev' | 'staging' | 'prod';
  version?: string;
  nodes?: number;
  uptime?: string;
  createdAt: string;
}

export interface ApiNodeDetail {
  host_name: string;
  host_address: string;
  port: number;
  shard_num: number;
  replica_num: number;
  version: string;
  uptime_seconds: number;
  health: "healthy" | "warning" | "critical";
}

export interface NodeInfo {
  hostname: string;
  address: string;
  port: number;
  shard: number;
  replica: number;
  version: string;
  uptime: string;
  diskUsed: number;
  diskTotal: number;
  diskUsagePercent: number;
  status: "healthy" | "warning" | "critical";
}

export interface DetailData {
  nodes: NodeInfo[];
  loading: boolean;
}

export interface ConnectionTestResult {
  success: boolean;
  message: string;
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${days}d ${hours}h ${minutes}m`;
}

export function useClusterManagement() {
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [loading, setLoading] = useState(true);
  const [summaryLoadingIds, setSummaryLoadingIds] = useState<Set<string>>(new Set());
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [connectionTestResult, setConnectionTestResult] = useState<ConnectionTestResult | null>(null);
  const [detailData, setDetailData] = useState<DetailData>({ nodes: [], loading: false });

  const fetchClusters = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setSummaryLoadingIds(new Set());

    let formattedClusters: Cluster[] = [];

    try {
      const response = await fetch('/api/clusters', { signal });
      if (response.ok) {
        const data: ApiClusterRaw[] = await response.json();
        formattedClusters = data.map((cluster) => ({
          id: cluster.id,
          name: cluster.name,
          host: cluster.host,
          port: cluster.port,
          protocol: cluster.protocol,
          username: cluster.username,
          password: cluster.password ?? '',
          useTLS: cluster.useTLS ?? false,
          environment: cluster.environment,
          nodes: cluster.nodes ?? 0,
          version: cluster.version ?? 'N/A',
          uptime: cluster.uptime,
          createdAt: cluster.createdAt,
        }));
        setClusters(formattedClusters);
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
      logger.error('[ClusterManagement] Error fetching clusters:', error);
    } finally {
      setLoading(false);
    }

    if (formattedClusters.length === 0 || signal?.aborted) return;

    setSummaryLoadingIds(new Set(formattedClusters.map((c) => c.id)));

    formattedClusters.forEach(async (cluster) => {
      try {
        const res = await fetch(`/api/clusters/${cluster.id}/summary`, { signal });
        if (signal?.aborted) return;

        if (res.ok) {
          const summary: ClusterSummaryResponse = await res.json();
          setClusters((prev) =>
            prev.map((c) =>
              c.id === cluster.id
                ? {
                    ...c,
                    status: summary.status,
                    nodes: summary.nodes ?? c.nodes,
                    version: summary.version ?? c.version,
                    uptime: summary.uptime ?? c.uptime,
                  }
                : c
            )
          );
        } else {
          setClusters((prev) =>
            prev.map((c) => (c.id === cluster.id ? { ...c, status: 'unreachable' } : c))
          );
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        logger.error(`[ClusterManagement] Error fetching summary for ${cluster.id}:`, err);
        setClusters((prev) =>
          prev.map((c) => (c.id === cluster.id ? { ...c, status: 'unreachable' } : c))
        );
      } finally {
        if (!signal?.aborted) {
          setSummaryLoadingIds((prev) => {
            const next = new Set(prev);
            next.delete(cluster.id);
            return next;
          });
        }
      }
    });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchClusters(controller.signal);
    return () => controller.abort();
  }, [fetchClusters]);

  const handleAddCluster = async (formData: CreateClusterInput) => {
    const response = await fetch('/api/clusters', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Failed to create cluster' }));
      throw new Error(errorData.error || errorData.details || 'Failed to create cluster');
    }

    await fetchClusters();
  };

  const handleEditCluster = async (selectedCluster: Cluster, formData: UpdateClusterInput) => {
    const body: Record<string, unknown> = {
      name: formData.name,
      host: formData.host,
      port: formData.port,
      protocol: formData.protocol,
      username: formData.username,
      useTLS: formData.useTLS,
      environment: formData.environment,
    };
    if (formData.password) {
      body.password = formData.password;
    }

    const response = await fetch(`/api/clusters/${selectedCluster.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Failed to update cluster' }));
      throw new Error(errorData.error || errorData.details || 'Failed to update cluster');
    }

    await fetchClusters();
  };

  const handleDeleteCluster = async (selectedCluster: Cluster) => {
    const response = await fetch(`/api/clusters/${selectedCluster.id}`, { method: 'DELETE' });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Failed to delete cluster' }));
      throw new Error(errorData.error || errorData.details || 'Failed to delete cluster');
    }

    await fetchClusters();
  };

  const handleTestConnection = async (formData: ClusterConnectionTestInput) => {
    setIsTestingConnection(true);
    setConnectionTestResult(null);

    try {
      const response = await fetch('/api/clusters/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Connection test failed' }));
        setConnectionTestResult({ success: false, message: errorData.error || errorData.details || 'Connection test failed' });
        return;
      }

      const result = await response.json();
      setConnectionTestResult(result);
    } catch (error) {
      logger.error('[ClusterManagement] Error testing connection:', error);
      const message = error instanceof Error ? error.message : "Connection test failed. Please check your settings.";
      setConnectionTestResult({ success: false, message });
    } finally {
      setIsTestingConnection(false);
    }
  };

  const openDetailDialog = async (cluster: Cluster) => {
    setDetailData({ nodes: [], loading: true });

    try {
      const response = await fetch(`/api/clusters/${cluster.id}/nodes`);
      if (!response.ok) throw new Error('Failed to fetch node list');

      const { nodeDetails } = await response.json() as { nodeDetails: ApiNodeDetail[] };
      const nodes: NodeInfo[] = (nodeDetails || []).map((node) => ({
        hostname: node.host_name,
        address: node.host_address,
        port: node.port,
        shard: node.shard_num,
        replica: node.replica_num,
        version: node.version,
        uptime: formatUptime(node.uptime_seconds),
        diskUsed: 0,
        diskTotal: 0,
        diskUsagePercent: 0,
        status: node.health,
      }));

      setDetailData({ nodes, loading: false });
    } catch (error) {
      logger.error('[ClusterManagement] Error fetching node list:', error);
      setDetailData({ nodes: [], loading: false });
    }
  };

  return {
    clusters,
    loading,
    summaryLoadingIds,
    isTestingConnection,
    connectionTestResult,
    setConnectionTestResult,
    detailData,
    fetchClusters,
    handleAddCluster,
    handleEditCluster,
    handleDeleteCluster,
    handleTestConnection,
    openDetailDialog,
  };
}
