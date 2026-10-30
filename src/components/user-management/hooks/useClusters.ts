import { logger } from "@/lib/utils/logger";
import { useState, useEffect } from "react";
import type { ClusterOption } from "../types";

interface PhysicalCluster {
  id: string;
  name: string;
  environment?: string;
}

interface LogicalCluster {
  name: string;
  nodeCount: number;
}

export function useClusters() {
  const [clusterOptions, setClusterOptions] = useState<ClusterOption[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;

    async function fetchClusters() {
      try {
        const response = await fetch('/api/clusters', { signal });
        if (!response.ok) return;

        const physicalClusters: PhysicalCluster[] = await response.json();

        setClusterOptions(
          physicalClusters.map((cluster) => ({
            id: `physical:${cluster.id}`,
            name: cluster.name,
            displayName: cluster.name,
            isLogical: false,
            environment: cluster.environment,
            actualClusterName: undefined,
          }))
        );

        await Promise.all(
          physicalClusters.map(async (cluster) => {
            try {
              const logicalResponse = await fetch(`/api/clusters/${cluster.id}/logical-clusters`, { signal });
              if (!logicalResponse.ok) return;

              const logicalClusters: LogicalCluster[] = await logicalResponse.json();

            // Only a genuinely multi-node entry justifies ON CLUSTER — a
            // single-node entry (e.g. ClickHouse's built-in "default" cluster
            // on a standalone server) must never be auto-applied, since
            // distributed DDL fails there without Keeper coordination. No
            // fallback to the first entry: if nothing qualifies, leave this
            // physical cluster without an actualClusterName.
            const physicalClusterName = logicalClusters.find(
              (lc) => lc.name === cluster.name && lc.nodeCount > 1
            )?.name;

            const logicalOptions: ClusterOption[] = logicalClusters
              .filter((lc) => lc.name !== cluster.name && lc.nodeCount > 1)
              .map((lc) => ({
                id: `logical:${cluster.id}:${lc.name}`,
                name: lc.name,
                displayName: `${cluster.name} → ${lc.name}`,
                isLogical: true,
                environment: cluster.environment,
                physicalClusterId: cluster.id,
                actualClusterName: lc.name,
              }));

              setClusterOptions((prev) => {
                const withoutThis = prev.filter(
                  (opt) =>
                    opt.id !== `physical:${cluster.id}` &&
                    !opt.id.startsWith(`logical:${cluster.id}:`)
                );
                const updatedPhysical: ClusterOption = {
                  id: `physical:${cluster.id}`,
                  name: cluster.name,
                  displayName: cluster.name,
                  isLogical: false,
                  environment: cluster.environment,
                  actualClusterName: physicalClusterName,
                };
                return [...withoutThis, updatedPhysical, ...logicalOptions];
              });
            } catch (error) {
              if ((error as Error).name === 'AbortError') return;
              logger.error(`Error fetching logical clusters for ${cluster.name}:`, error);
            }
          })
        );
      } catch (error) {
        if ((error as Error).name === 'AbortError') return;
        logger.error('Error fetching clusters:', error);
      }
    }

    void fetchClusters();
    return () => controller.abort(new DOMException('Component unmounted', 'AbortError'));
  }, []);

  return { clusterOptions };
}
