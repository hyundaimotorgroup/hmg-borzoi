import type { ClusterMetrics, ClusterWithMetrics } from "@/lib/services/cluster.service";
import { getNodeLabelFromHost } from "./nodeHost";

type PartialClusterMetrics = Partial<ClusterMetrics>;
export type ClusterSnapshotPatch = Omit<Partial<ClusterWithMetrics>, "metrics"> & {
  metrics?: PartialClusterMetrics | null;
};

function resolveClusterVersion(
  currentVersion?: string,
  nextVersion?: string,
  nodeDetails?: ClusterWithMetrics["nodeDetails"]
): string | undefined {
  if (nextVersion && nextVersion !== "N/A") {
    return nextVersion;
  }

  const nodeVersion = nodeDetails?.find((node) => node.version && node.version !== "N/A")?.version;
  if (nodeVersion) {
    return nodeVersion;
  }

  return currentVersion;
}

function mergeMetrics(
  currentMetrics?: PartialClusterMetrics | null,
  nextMetrics?: PartialClusterMetrics | null
): PartialClusterMetrics | null {
  if (!currentMetrics && !nextMetrics) {
    return null;
  }

  return {
    ...(currentMetrics ?? {}),
    ...(nextMetrics ?? {}),
  };
}

export function mergeRequestedMetricFields(
  currentFields?: string[],
  nextFields?: string[]
): string[] | undefined {
  if (!currentFields?.length) {
    return nextFields;
  }

  if (!nextFields?.length) {
    return currentFields;
  }

  return Array.from(new Set([...currentFields, ...nextFields]));
}

export function mergeClusterPatch(
  current: ClusterSnapshotPatch,
  next: ClusterSnapshotPatch
): ClusterSnapshotPatch {
  const mergedNodeDetails = next.nodeDetails !== undefined ? next.nodeDetails : current.nodeDetails;

  return {
    ...current,
    ...next,
    version: resolveClusterVersion(current.version, next.version, mergedNodeDetails),
    metrics: mergeMetrics(current.metrics, next.metrics),
    requestedMetricFields: mergeRequestedMetricFields(
      current.requestedMetricFields,
      next.requestedMetricFields
    ),
    nodeList: next.nodeList !== undefined ? next.nodeList : current.nodeList,
    nodeDetails: mergedNodeDetails,
    metricsError: next.metricsError ?? current.metricsError,
  };
}

export function mergeClusterSnapshot(
  current: ClusterWithMetrics,
  next: ClusterSnapshotPatch
): ClusterWithMetrics {
  const mergedNodeDetails = next.nodeDetails !== undefined ? next.nodeDetails : current.nodeDetails;

  return {
    ...current,
    ...next,
    version: resolveClusterVersion(current.version, next.version, mergedNodeDetails),
    metrics: mergeMetrics(current.metrics, next.metrics) as ClusterWithMetrics["metrics"],
    requestedMetricFields: mergeRequestedMetricFields(
      current.requestedMetricFields,
      next.requestedMetricFields
    ),
    nodeList: next.nodeList !== undefined ? next.nodeList : current.nodeList,
    nodeDetails: mergedNodeDetails,
    metricsError: next.metricsError ?? current.metricsError,
  };
}

export function buildNodeListFromNodeDetails(
  nodeDetails?: ClusterWithMetrics["nodeDetails"]
): string[] | undefined {
  if (!nodeDetails?.length) {
    return undefined;
  }

  return Array.from(
    new Set(
      nodeDetails
        .map((node) => getNodeLabelFromHost(node.host_name))
        .filter(Boolean)
    )
  );
}

export function clusterHasMetric(
  cluster: ClusterWithMetrics | null | undefined,
  field: keyof ClusterMetrics | string
): boolean {
  if (!cluster?.metrics) {
    return false;
  }

  if (cluster.requestedMetricFields?.length) {
    return cluster.requestedMetricFields.includes(field);
  }

  return Object.prototype.hasOwnProperty.call(cluster.metrics, field);
}

export function getClusterMetricNumber(
  cluster: ClusterWithMetrics | null | undefined,
  field: keyof ClusterMetrics
): number | null {
  if (!clusterHasMetric(cluster, field)) {
    return null;
  }

  const value = cluster?.metrics?.[field];
  if (typeof value === "number") {
    return value;
  }

  return value == null ? null : Number(value);
}
