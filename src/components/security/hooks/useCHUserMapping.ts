import { useState, useEffect } from "react";
import { logger } from "@/lib/utils/logger";
import type { ClusterBasic, ChUser } from "../types";

interface CHUserMappingState {
  clusters: ClusterBasic[];
  chUsers: Record<string, ChUser[]>;
  isLoadingChUsers: boolean;
}

export function useCHUserMapping(): CHUserMappingState {
  const [clusters, setClusters] = useState<ClusterBasic[]>([]);
  const [chUsers, setChUsers] = useState<Record<string, ChUser[]>>({});
  const [isLoadingChUsers, setIsLoadingChUsers] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const signal = controller.signal;

    async function fetchClusters() {
      try {
        const response = await fetch('/api/app-users/clusters', { signal });
        if (!response.ok) return;

        const data: ClusterBasic[] = await response.json();
        setClusters(data);

        if (data.length === 0) return;

        setIsLoadingChUsers(true);
        let remaining = data.length;

        data.forEach(async (cluster) => {
          try {
            const chUsersRes = await fetch(`/api/clusters/${cluster.id}/ch-users`, { signal });
            if (chUsersRes.ok) {
              const users = await chUsersRes.json();
              setChUsers(prev => ({ ...prev, [cluster.id]: users || [] }));
            } else {
              const errorData = await chUsersRes.json().catch(() => ({ error: 'Unknown error' }));
              logger.error(
                `[SecurityManagement] Failed to fetch CH users for cluster ${cluster.name}:`,
                chUsersRes.status,
                errorData
              );
              setChUsers(prev => ({ ...prev, [cluster.id]: [] }));
            }
          } catch (err) {
            if (err instanceof Error && err.name === 'AbortError') return;
            logger.error(`[SecurityManagement] Exception fetching CH users for cluster ${cluster.id}:`, err);
            setChUsers(prev => ({ ...prev, [cluster.id]: [] }));
          } finally {
            remaining -= 1;
            if (remaining <= 0) setIsLoadingChUsers(false);
          }
        });
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return;
        logger.error('[SecurityManagement] Error fetching clusters:', error);
        setIsLoadingChUsers(false);
      }
    }

    fetchClusters();
    return () => controller.abort();
  }, []);

  return { clusters, chUsers, isLoadingChUsers };
}
