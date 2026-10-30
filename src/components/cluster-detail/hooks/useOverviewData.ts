"use client";

import { useMemo } from "react";
import { formatBytes, formatBytesPerSecond } from "@/lib/utils/format-bytes";
import type { ClusterWithMetrics } from "@/lib/services/cluster.service";
import {
  clusterHasMetric,
  getClusterMetricNumber,
} from "@/components/cluster-detail/shared/lib/clusterSnapshot";

export const OVERVIEW_CARD_FIELDS = {
  queries: [
    "successQueries",
    "failedQueries",
    "readThroughput",
    "writeThroughput",
    "avgQueryMemory",
    "avgQueryDuration",
  ],
  storage: ["freeDiskSpace", "diskIO", "partsCount", "brokenParts", "detachedParts"],
  operations: ["replicationLag", "activeMerges", "activeMutations", "replicationQueueCount", "pendingDistribution"],
  health: [
    "httpConnections",
    "tcpConnections",
    "interserverConnections",
    "connectionErrors",
    "keeperSessions",
    "keeperRequests",
    "keeperExceptions",
  ],
} as const;

export interface OverviewClusterMetrics {
  successQueries: number | null;
  failedQueries: number | null;
  readThroughput: string | null;
  writeThroughput: string | null;
  avgQueryMemory: string | null;
  queryWaitTime: number | null;
  replicationLag: number | null;
  activeMerges: number | null;
  activeMutations: number | null;
  replicationQueueCount: number | null;
  pendingDistribution: number | null;
  freeDiskSpace: number | null;
  diskIO: string | null;
  partsCount: number | null;
  brokenParts: number | null;
  detachedParts: number | null;
  httpConnections: number | null;
  tcpConnections: number | null;
  interserverConnections: number | null;
  connectionErrors: number | null;
  keeperSessions: number | null;
  keeperRequests: number | null;
  keeperExceptions: number | null;
}

interface UseOverviewDataResult {
  cluster: ClusterWithMetrics | undefined;
  clusterMetrics: OverviewClusterMetrics;
  isCardLoading: (fields: readonly string[]) => boolean;
}

const EMPTY_METRICS: OverviewClusterMetrics = {
  successQueries: null,
  failedQueries: null,
  readThroughput: null,
  writeThroughput: null,
  avgQueryMemory: null,
  queryWaitTime: null,
  replicationLag: null,
  activeMerges: null,
  activeMutations: null,
  replicationQueueCount: null,
  pendingDistribution: null,
  freeDiskSpace: null,
  diskIO: null,
  partsCount: null,
  brokenParts: null,
  detachedParts: null,
  httpConnections: null,
  tcpConnections: null,
  interserverConnections: null,
  connectionErrors: null,
  keeperSessions: null,
  keeperRequests: null,
  keeperExceptions: null,
};

export function useOverviewData(
  clusterProp?: ClusterWithMetrics,
  loadingMetricFields?: ReadonlySet<string>
): UseOverviewDataResult {
  const cluster = clusterProp;

  const clusterMetrics = useMemo<OverviewClusterMetrics>(() => {
    if (!cluster) {
      return EMPTY_METRICS;
    }

    const getRoundedMetric = (field: string, value: number | null | undefined) => {
      if (!clusterHasMetric(cluster, field) || value == null) return null;
      return Math.round(value);
    };
    const getFixedMetric = (field: string, value: number | null | undefined, digits = 1) => {
      if (!clusterHasMetric(cluster, field) || value == null) return null;
      return Number(value.toFixed(digits));
    };
    const getBytesMetric = (field: string, value: number | null | undefined) => {
      if (!clusterHasMetric(cluster, field) || value == null) return null;
      return formatBytes(value);
    };
    const getBytesPerSecondMetric = (field: string, value: number | null | undefined) => {
      if (!clusterHasMetric(cluster, field) || value == null) return null;
      return formatBytesPerSecond(value);
    };

    return {
      successQueries: getRoundedMetric("successQueries", getClusterMetricNumber(cluster, "successQueries")),
      failedQueries: getRoundedMetric("failedQueries", getClusterMetricNumber(cluster, "failedQueries")),
      readThroughput: getBytesPerSecondMetric("readThroughput", getClusterMetricNumber(cluster, "readThroughput")),
      writeThroughput: getBytesPerSecondMetric("writeThroughput", getClusterMetricNumber(cluster, "writeThroughput")),
      avgQueryMemory: getBytesMetric("avgQueryMemory", getClusterMetricNumber(cluster, "avgQueryMemory")),
      queryWaitTime: getRoundedMetric("avgQueryDuration", getClusterMetricNumber(cluster, "avgQueryDuration")),
      replicationLag: getFixedMetric("replicationLag", getClusterMetricNumber(cluster, "replicationLag")),
      activeMerges: getRoundedMetric("activeMerges", getClusterMetricNumber(cluster, "activeMerges")),
      activeMutations: getRoundedMetric("activeMutations", getClusterMetricNumber(cluster, "activeMutations")),
      replicationQueueCount: getRoundedMetric(
        "replicationQueueCount",
        getClusterMetricNumber(cluster, "replicationQueueCount")
      ),
      pendingDistribution: getRoundedMetric(
        "pendingDistribution",
        getClusterMetricNumber(cluster, "pendingDistribution")
      ),
      freeDiskSpace: getFixedMetric("freeDiskSpace", getClusterMetricNumber(cluster, "freeDiskSpace"), 2),
      diskIO: getBytesPerSecondMetric("diskIO", getClusterMetricNumber(cluster, "diskIO")),
      partsCount: getRoundedMetric("partsCount", getClusterMetricNumber(cluster, "partsCount")),
      brokenParts: getRoundedMetric("brokenParts", getClusterMetricNumber(cluster, "brokenParts")),
      detachedParts: getRoundedMetric("detachedParts", getClusterMetricNumber(cluster, "detachedParts")),
      httpConnections: getRoundedMetric("httpConnections", getClusterMetricNumber(cluster, "httpConnections")),
      tcpConnections: getRoundedMetric("tcpConnections", getClusterMetricNumber(cluster, "tcpConnections")),
      interserverConnections: getRoundedMetric(
        "interserverConnections",
        getClusterMetricNumber(cluster, "interserverConnections")
      ),
      connectionErrors: getRoundedMetric(
        "connectionErrors",
        getClusterMetricNumber(cluster, "connectionErrors")
      ),
      keeperSessions: getRoundedMetric("keeperSessions", getClusterMetricNumber(cluster, "keeperSessions")),
      keeperRequests: getRoundedMetric("keeperRequests", getClusterMetricNumber(cluster, "keeperRequests")),
      keeperExceptions: getRoundedMetric(
        "keeperExceptions",
        getClusterMetricNumber(cluster, "keeperExceptions")
      ),
    };
  }, [cluster]);

  const isCardLoading = (fields: readonly string[]) =>
    fields.some((field) => loadingMetricFields?.has(field));

  return { cluster, clusterMetrics, isCardLoading };
}
