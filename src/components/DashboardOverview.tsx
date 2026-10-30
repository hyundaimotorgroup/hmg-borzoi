"use client";

import { logger } from "@/lib/utils/logger";
import { startTransition, useCallback, useEffect, useState } from "react";
import { ClusterCard, ClusterMetricsData, MetricsState } from "@/components/ClusterCard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { RefreshCw } from "lucide-react";

const METRICS_FIELDS = "qps,runningQueries,memoryUsage,cpuUsagePercent,diskUsage,replicationLag,nodeCount";

interface BaseCluster {
  id: string;
  name: string;
}

interface ApiClusterMetricsResponse {
  metrics: ClusterMetricsData | null;
}

function buildLoadingMetricsMap(clusters: BaseCluster[]) {
  return Object.fromEntries(clusters.map((cluster) => [cluster.id, "loading" as MetricsState]));
}

function buildErrorMetricsMap(clusterIds: string[]) {
  return Object.fromEntries(clusterIds.map((clusterId) => [clusterId, "error" as MetricsState]));
}

function buildClusterMetricsUrl(clusterId: string, skipCache: boolean) {
  const params = new URLSearchParams({
    metrics: "true",
    fields: METRICS_FIELDS,
    profile: "dashboard-overview",
  });

  if (skipCache) {
    params.set("cache", "skip");
  }

  return `/api/clusters/${clusterId}?${params.toString()}`;
}

function ClusterCardSkeleton() {
  return (
    <div className="rounded-lg border bg-card p-4 space-y-3 h-full">
      <div className="flex items-center justify-between pb-1">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="flex items-center gap-2">
            <Skeleton className="h-4 w-4 shrink-0" />
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-4 w-8" />
          </div>
        ))}
      </div>
      <div className="space-y-2 pt-1">
        {[0, 1, 2].map(i => (
          <div key={i}>
            <div className="flex justify-between mb-1">
              <Skeleton className="h-3 w-10" />
              <Skeleton className="h-3 w-14" />
            </div>
            <Skeleton className="h-1.5 w-full rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function DashboardOverview({ currentUser }: { currentUser: string }) {
  const [clusters, setClusters] = useState<BaseCluster[]>([]);
  const [metricsMap, setMetricsMap] = useState<Record<string, MetricsState>>({});
  const [phase1Loading, setPhase1Loading] = useState(true);
  const [metricsRefreshing, setMetricsRefreshing] = useState(false);
  const [clustersError, setClustersError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  const retry = useCallback(() => {
    setClustersError(null);
    setRetryKey(k => k + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    const shouldSkipCache = retryKey > 0;

    setClustersError(null);
    setPhase1Loading(true);
    setClusters([]);
    setMetricsMap({});

    async function run() {
      let hasResolvedClusterList = false;

      try {
        const res = await fetch('/api/clusters', { signal });
        if (!res.ok) {
          const body = await res.json().catch(() => ({})) as { error?: string };
          throw new Error(body.error ?? 'Failed to fetch clusters');
        }
        const baseClusters = await res.json() as BaseCluster[];

        hasResolvedClusterList = true;
        setClusters(baseClusters);
        setMetricsMap(buildLoadingMetricsMap(baseClusters));
        setPhase1Loading(false);

        if (baseClusters.length === 0) {
          return;
        }

        setMetricsRefreshing(true);

        await Promise.all(
          baseClusters.map(async (cluster) => {
            try {
              const metricsRes = await fetch(buildClusterMetricsUrl(cluster.id, shouldSkipCache), { signal });
              if (!metricsRes.ok) {
                throw new Error(`HTTP ${metricsRes.status}`);
              }

              const clusterDetail = await metricsRes.json() as ApiClusterMetricsResponse;
              if (signal.aborted) {
                return;
              }

              startTransition(() => {
                setMetricsMap((current) => ({
                  ...current,
                  [cluster.id]: clusterDetail.metrics ?? "error",
                }));
              });
            } catch (error) {
              if ((error as Error).name === "AbortError") {
                return;
              }

              logger.error(`[DashboardOverview] Metrics fetch failed for cluster ${cluster.id}:`, error);
              if (signal.aborted) {
                return;
              }

              startTransition(() => {
                setMetricsMap((current) => ({
                  ...current,
                  [cluster.id]: "error",
                }));
              });
            }
          })
        );
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setMetricsMap((current) => {
          if (Object.keys(current).length === 0) {
            return current;
          }

          return buildErrorMetricsMap(Object.keys(current));
        });

        if (!hasResolvedClusterList) {
          setClustersError("Failed to load cluster list.");
          setPhase1Loading(false);
          logger.error("[DashboardOverview] Phase 1 fetch failed:", err);
        } else {
          logger.error("[DashboardOverview] Overview metrics fetch failed:", err);
        }
      } finally {
        if (!signal.aborted) {
          setMetricsRefreshing(false);
        }
      }
    }

    run();
    return () => controller.abort();
  }, [currentUser, retryKey]);

  if (clustersError) {
    return (
      <div className="pt-4 px-6 flex items-center justify-center gap-3 text-red-600 dark:text-red-400">
        <span>{clustersError}</span>
        <button onClick={retry} className="underline text-sm">Retry</button>
      </div>
    );
  }

  return (
    <div className="pt-4 px-6 pb-6 space-y-6">
      <div>
        <div className="flex justify-end mb-4">
          <Button variant="outline" size="sm" onClick={retry} disabled={phase1Loading || metricsRefreshing} className="gap-2">
            <RefreshCw className={`h-4 w-4 ${metricsRefreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {phase1Loading
            ? [0, 1, 2].map(i => (
                <div key={i} style={{ height: 240 }}>
                  <ClusterCardSkeleton />
                </div>
              ))
            : clusters.map(cluster => (
                <div key={cluster.id} style={{ height: 240 }}>
                  <ClusterCard
                    cluster={cluster}
                    metrics={metricsMap[cluster.id] ?? "loading"}
                  />
                </div>
              ))
          }
        </div>
      </div>
    </div>
  );
}
