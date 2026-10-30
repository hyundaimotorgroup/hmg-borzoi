"use client";

import { logger } from "@/lib/utils/logger";
import { usePathname, useSearchParams } from "next/navigation";

import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Activity, Terminal, Database, Clock, Server, GitMerge, Network } from "lucide-react";
import { OverviewTab } from "@/components/cluster-detail/tabs/overview/Tab";
import { OVERVIEW_CARD_FIELDS } from "@/components/cluster-detail/hooks/useOverviewData";
import { QueriesTab } from "@/components/cluster-detail/tabs/queries/Tab";
import { StorageTab } from "@/components/cluster-detail/tabs/storage/Tab";
import { OperationsTab } from "@/components/cluster-detail/tabs/operations/Tab";
import { HealthTab } from "@/components/cluster-detail/tabs/health/Tab";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import type { ClusterWithMetrics } from "@/lib/services/cluster.service";
import {
  buildNodeListFromNodeDetails,
  clusterHasMetric,
  type ClusterSnapshotPatch,
  getClusterMetricNumber,
  mergeClusterPatch,
  mergeClusterSnapshot,
} from "@/components/cluster-detail/shared/lib/clusterSnapshot";

const HEADER_METRIC_FIELDS = [
  "runningQueries",
  "qps",
  "memoryUsage",
  "diskUsage",
  "replicationLag",
] as const;
const HEADER_METRIC_FIELDS_PARAM = HEADER_METRIC_FIELDS.join(",");
const OVERVIEW_CARD_GROUPS = Object.entries(OVERVIEW_CARD_FIELDS) as Array<
  [keyof typeof OVERVIEW_CARD_FIELDS, readonly string[]]
>;

const CLUSTER_DETAIL_TABS = ["overview", "queries", "storage", "operations", "health"] as const;
type ClusterDetailTab = (typeof CLUSTER_DETAIL_TABS)[number];
type OverviewMetricGroup = keyof typeof OVERVIEW_CARD_FIELDS;

function isClusterDetailTab(value: string | null): value is ClusterDetailTab {
  return value != null && CLUSTER_DETAIL_TABS.includes(value as ClusterDetailTab);
}

function getClusterDetailTabFromSearchParams(searchParams: ReturnType<typeof useSearchParams>): ClusterDetailTab {
  const tab = searchParams.get("tab");
  return isClusterDetailTab(tab) ? tab : "overview";
}

interface ClusterDetailProps {
  clusterId: string;
  onBack: () => void;
  currentUser: string;
}

export function ClusterDetail({ clusterId, onBack, currentUser: _currentUser }: ClusterDetailProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeTabFromUrl = getClusterDetailTabFromSearchParams(searchParams);
  const [activeTab, setActiveTab] = useState<ClusterDetailTab>(activeTabFromUrl);
  const [cluster, setCluster] = useState<ClusterWithMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [headerMetricsLoading, setHeaderMetricsLoading] = useState(false);
  const [overviewLoadingGroups, setOverviewLoadingGroups] = useState<Partial<Record<OverviewMetricGroup, boolean>>>({});
  const fetchRequestIdRef = useRef(0);
  const pendingClusterPatchRef = useRef<ClusterSnapshotPatch | null>(null);
  const overviewGroupControllersRef = useRef<Map<OverviewMetricGroup, AbortController>>(new Map());

  const loadingMetricFields = useMemo(
    () =>
      new Set(
        OVERVIEW_CARD_GROUPS.flatMap(([group, fields]) =>
          overviewLoadingGroups[group] ? [...fields] : []
        )
      ),
    [overviewLoadingGroups]
  );

  const handleTabChange = useCallback(
    (nextTab: string) => {
      if (!isClusterDetailTab(nextTab)) {
        return;
      }

      const params = new URLSearchParams(searchParams.toString());
      if (nextTab === "overview") {
        params.delete("tab");
      } else {
        params.set("tab", nextTab);
      }

      const nextUrl = params.toString() ? `${pathname}?${params.toString()}` : pathname;

      setActiveTab(nextTab);
      window.history.replaceState(window.history.state, "", nextUrl);
    },
    [pathname, searchParams]
  );

  useEffect(() => {
    setActiveTab(activeTabFromUrl);
  }, [activeTabFromUrl]);

  useEffect(() => {
    const controller = new AbortController();
    const requestId = ++fetchRequestIdRef.current;
    let hasPrimarySnapshot = false;

    pendingClusterPatchRef.current = null;
    overviewGroupControllersRef.current.forEach((groupController) => groupController.abort());
    overviewGroupControllersRef.current.clear();
    setCluster(null);
    setLoading(true);
    setHeaderMetricsLoading(true);
    setOverviewLoadingGroups({});

    function applyClusterPatch(patch: Partial<ClusterWithMetrics>) {
      if (controller.signal.aborted || requestId !== fetchRequestIdRef.current) {
        return;
      }

      startTransition(() => {
        setCluster((current) => {
          if (!current) {
            pendingClusterPatchRef.current = pendingClusterPatchRef.current
              ? mergeClusterPatch(pendingClusterPatchRef.current, patch)
              : patch;
            return current;
          }

          return mergeClusterSnapshot(current, patch);
        });
      });
    }

    function applyPrimarySnapshot(snapshot: ClusterWithMetrics) {
      if (controller.signal.aborted || requestId !== fetchRequestIdRef.current) {
        return;
      }

      hasPrimarySnapshot = true;
      startTransition(() => {
        setCluster((current) => {
          const mergedSnapshot = current
            ? mergeClusterSnapshot(current, snapshot)
            : snapshot;

          const withPendingPatch = pendingClusterPatchRef.current
            ? mergeClusterSnapshot(mergedSnapshot, pendingClusterPatchRef.current)
            : mergedSnapshot;

          pendingClusterPatchRef.current = null;
          return withPendingPatch;
        });
        setLoading(false);
      });
    }

    async function fetchPrimarySnapshot(url: string, label: string) {
      try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: `Failed to fetch ${label}` }));
          throw new Error(errorData.error || errorData.details || `Failed to fetch ${label}`);
        }

        const data = await response.json() as ClusterWithMetrics;
        applyPrimarySnapshot(data);
      } catch (error: unknown) {
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }

        if (requestId !== fetchRequestIdRef.current) {
          return;
        }

        logger.error(`[ClusterDetail] Error fetching ${label}:`, error);
      }
    }

    async function fetchNodeMetadata() {
      try {
        const response = await fetch(`/api/clusters/${clusterId}/nodes`, {
          signal: controller.signal,
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: "Failed to fetch node details" }));
          throw new Error(errorData.error || errorData.details || "Failed to fetch node details");
        }

        const data = await response.json() as { nodeDetails?: ClusterWithMetrics["nodeDetails"] };
        const nodeDetails = data.nodeDetails ?? [];
        applyClusterPatch({
          nodeDetails,
          nodeList: buildNodeListFromNodeDetails(nodeDetails),
        });
      } catch (error: unknown) {
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }

        logger.error("[ClusterDetail] Error fetching node metadata:", error);
      }
    }

    const baseSnapshotPromise = fetchPrimarySnapshot(`/api/clusters/${clusterId}`, "cluster");
    const headerMetricsPromise = fetchPrimarySnapshot(
      `/api/clusters/${clusterId}?metrics=true&fields=${HEADER_METRIC_FIELDS_PARAM}`,
      "header metrics"
    ).finally(() => {
      if (!controller.signal.aborted && requestId === fetchRequestIdRef.current) {
        setHeaderMetricsLoading(false);
      }
    });

    void fetchNodeMetadata();

    Promise.allSettled([baseSnapshotPromise, headerMetricsPromise]).then(() => {
      if (
        controller.signal.aborted ||
        requestId !== fetchRequestIdRef.current ||
        hasPrimarySnapshot
      ) {
        return;
      }

      setLoading(false);
    });

    return () => {
      controller.abort();
    };
  }, [clusterId]);

  useEffect(() => {
    if (!cluster) {
      return;
    }

    const requestId = fetchRequestIdRef.current;

    const groupsToFetch = OVERVIEW_CARD_GROUPS.map(([group, fields]) => ({
      group,
      fields: fields.filter((field) => !clusterHasMetric(cluster, field)),
    })).filter(
      ({ group, fields }) =>
        fields.length > 0 && !overviewGroupControllersRef.current.has(group)
    );

    if (groupsToFetch.length === 0) {
      return;
    }

    setOverviewLoadingGroups((current) => ({
      ...current,
      ...Object.fromEntries(groupsToFetch.map(({ group }) => [group, true])),
    }));

    groupsToFetch.forEach(({ group, fields }) => {
      const groupController = new AbortController();
      overviewGroupControllersRef.current.set(group, groupController);

      const params = new URLSearchParams({
        metrics: "true",
        fields: fields.join(","),
      });

      fetch(`/api/clusters/${clusterId}?${params.toString()}`, { signal: groupController.signal })
        .then(async (response) => {
          if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: "Failed to fetch summary metrics" }));
            throw new Error(errorData.error || errorData.details || "Failed to fetch summary metrics");
          }

          const data = await response.json() as ClusterWithMetrics;
          if (groupController.signal.aborted || requestId !== fetchRequestIdRef.current) {
            return;
          }

          startTransition(() => {
            setCluster((current) => (current ? mergeClusterSnapshot(current, data) : data));
          });
        })
        .catch((error: unknown) => {
          if (error instanceof Error && error.name === "AbortError") {
            return;
          }

          logger.error(`[ClusterDetail] Error fetching ${group} summary metrics:`, error);
        })
        .finally(() => {
          overviewGroupControllersRef.current.delete(group);

          if (!groupController.signal.aborted && requestId === fetchRequestIdRef.current) {
            setOverviewLoadingGroups((current) => ({
              ...current,
              [group]: false,
            }));
          }
        });
    });
  }, [cluster, clusterId]);

  if (!cluster && !loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <div className="text-red-600">Cluster not found.</div>
      </div>
    );
  }

  const runningQueries = getClusterMetricNumber(cluster, "runningQueries");
  const qps = getClusterMetricNumber(cluster, "qps");
  const memoryUsage = getClusterMetricNumber(cluster, "memoryUsage");
  const diskUsage = getClusterMetricNumber(cluster, "diskUsage");
  const replicationLag = getClusterMetricNumber(cluster, "replicationLag");

  return (
    <div className="p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="sm" onClick={onBack}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <div>
            <div className="flex items-center gap-3">
              {cluster ? (
                <h1 className="text-xl text-gray-900 dark:text-white">{cluster.name}</h1>
              ) : (
                <Skeleton className="h-9 w-64" />
              )}
              
              {/* Inline Metrics */}
              <div className="flex items-center gap-3 text-xs border-l border-gray-300 dark:border-slate-600 pl-3 ml-1">
                <div className="flex items-center gap-1.5">
                  <Terminal className="w-3 h-3 text-gray-500 dark:text-gray-400" />
                  <span className="text-gray-500 dark:text-gray-400">Queries:</span>
                  {cluster ? (
                    <InlineMetricValue
                      value={runningQueries}
                      loading={headerMetricsLoading && !clusterHasMetric(cluster, "runningQueries")}
                    />
                  ) : (
                    <Skeleton className="h-3 w-8" />
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <Activity className="w-3 h-3 text-gray-500 dark:text-gray-400" />
                  <span className="text-gray-500 dark:text-gray-400">QPS:</span>
                  {cluster ? (
                    <InlineMetricValue
                      value={qps == null ? null : qps.toLocaleString()}
                      loading={headerMetricsLoading && !clusterHasMetric(cluster, "qps")}
                    />
                  ) : (
                    <Skeleton className="h-3 w-10" />
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <Database className="w-3 h-3 text-gray-500 dark:text-gray-400" />
                  <span className="text-gray-500 dark:text-gray-400">Memory:</span>
                  {cluster ? (
                    <InlineMetricValue
                      value={memoryUsage == null ? null : `${memoryUsage.toFixed(1)}%`}
                      loading={headerMetricsLoading && !clusterHasMetric(cluster, "memoryUsage")}
                      className={memoryUsage != null && memoryUsage > 80 ? 'text-red-600' : memoryUsage != null && memoryUsage > 70 ? 'text-yellow-600' : undefined}
                    />
                  ) : (
                    <Skeleton className="h-3 w-10" />
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <Server className="w-3 h-3 text-gray-500 dark:text-gray-400" />
                  <span className="text-gray-500 dark:text-gray-400">Disk:</span>
                  {cluster ? (
                    <InlineMetricValue
                      value={diskUsage == null ? null : `${diskUsage.toFixed(1)} TB`}
                      loading={headerMetricsLoading && !clusterHasMetric(cluster, "diskUsage")}
                    />
                  ) : (
                    <Skeleton className="h-3 w-12" />
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <Clock className="w-3 h-3 text-gray-500 dark:text-gray-400" />
                  <span className="text-gray-500 dark:text-gray-400">Lag:</span>
                  {cluster ? (
                    <InlineMetricValue
                      value={replicationLag == null ? null : `${replicationLag.toFixed(1)}s`}
                      loading={headerMetricsLoading && !clusterHasMetric(cluster, "replicationLag")}
                      className={replicationLag != null && replicationLag > 5 ? 'text-red-600' : replicationLag != null && replicationLag > 3 ? 'text-yellow-600' : undefined}
                    />
                  ) : (
                    <Skeleton className="h-3 w-10" />
                  )}
                </div>
              </div>
            </div>
            {cluster ? (
              <p className="text-gray-600 dark:text-gray-400 mt-1">
                {cluster.host}:{cluster.port} • Version {cluster.version || 'N/A'} •
                <span className="text-blue-600">
                  {" "}{cluster.environment}
                </span>
              </p>
            ) : (
              <div className="space-y-2 mt-2">
                <Skeleton className="h-4 w-80" />
                <Skeleton className="h-4 w-24" />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-3">
        <TabsList className="flex w-full overflow-x-auto">
          <TabsTrigger value="overview"><Server className="h-4 w-4" />Overview</TabsTrigger>
          <TabsTrigger value="queries"><Terminal className="h-4 w-4" />Queries</TabsTrigger>
          <TabsTrigger value="storage"><Database className="h-4 w-4" />Storage</TabsTrigger>
          <TabsTrigger value="operations"><GitMerge className="h-4 w-4" />Operations</TabsTrigger>
          <TabsTrigger value="health"><Network className="h-4 w-4" />Connection &amp; Keeper</TabsTrigger>
        </TabsList>

        <TabsContent forceMount value="overview" className={`space-y-3 ${activeTab !== 'overview' ? 'hidden' : ''}`}>
          <ErrorBoundary>
            <OverviewTab
              clusterId={clusterId}
              cluster={cluster ?? undefined}
              loadingMetricFields={loadingMetricFields}
              isActive={activeTab === 'overview'}
            />
          </ErrorBoundary>
        </TabsContent>

        <TabsContent forceMount value="queries" className={`space-y-6 ${activeTab !== 'queries' ? 'hidden' : ''}`}>
          <ErrorBoundary>
            <QueriesTab
              clusterId={clusterId}
              cluster={cluster}
              loadingMetricFields={loadingMetricFields}
              isActive={activeTab === 'queries'}
            />
          </ErrorBoundary>
        </TabsContent>

        <TabsContent forceMount value="storage" className={`space-y-6 ${activeTab !== 'storage' ? 'hidden' : ''}`}>
          <ErrorBoundary>
            <StorageTab
              clusterId={clusterId}
              cluster={cluster}
              loadingMetricFields={loadingMetricFields}
              isActive={activeTab === 'storage'}
            />
          </ErrorBoundary>
        </TabsContent>

        <TabsContent forceMount value="operations" className={`space-y-6 ${activeTab !== 'operations' ? 'hidden' : ''}`}>
          <ErrorBoundary>
            <OperationsTab
              clusterId={clusterId}
              cluster={cluster}
              loadingMetricFields={loadingMetricFields}
              isActive={activeTab === 'operations'}
            />
          </ErrorBoundary>
        </TabsContent>

        <TabsContent forceMount value="health" className={`space-y-6 ${activeTab !== 'health' ? 'hidden' : ''}`}>
          <ErrorBoundary>
            <HealthTab
              clusterId={clusterId}
              cluster={cluster}
              loadingMetricFields={loadingMetricFields}
              isActive={activeTab === 'health'}
            />
          </ErrorBoundary>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function InlineMetricValue({
  value,
  loading = false,
  className,
}: {
  value: string | number | null;
  loading?: boolean;
  className?: string;
}) {
  if (loading) {
    return <Skeleton className="h-3 w-10" />;
  }

  if (value == null) {
    return <span className="text-gray-400 dark:text-gray-500">—</span>;
  }

  return <span className={`${className ?? 'text-gray-900 dark:text-white'}`}>{value}</span>;
}
