export interface ReplicaIssueSignal {
  issues?: string;
  total_replicas?: number;
  active_replicas?: number;
}

export const EXPECTED_SINGLE_REPLICA_LABEL = "Expected single replica";

const ISSUE_LABELS: Record<string, string> = {
  ReadOnly: "Read-only replica",
  SessionExpired: "Keeper session expired",
  "FutureParts>20": "Too many future parts (>20)",
  "PartsToCheck>10": "Too many parts to check (>10)",
  "QueueSize>20": "Replication queue is large (>20)",
  "InsertsQueue>10": "Insert queue is large (>10)",
  "LogDelay>10": "Replication log delay is high (>10)",
  LowReplicas: "Replica count is low",
  InactiveReplicas: "Some replicas are inactive",
  "AbsoluteDelay>=300": "Absolute replication delay is high (>=300s)",
};

export function parseReplicaIssues(issues?: string) {
  return String(issues || "")
    .split(", ")
    .map((issue) => issue.trim())
    .filter(Boolean);
}

export function isExpectedSingleReplica(signal: ReplicaIssueSignal) {
  const totalReplicas = Number(signal.total_replicas || 0);
  const activeReplicas = Number(signal.active_replicas || 0);

  return totalReplicas === 1 && activeReplicas >= totalReplicas;
}

export function formatReplicaIssueLabel(issue: string, signal: ReplicaIssueSignal = {}) {
  if (issue === "LowReplicas" && isExpectedSingleReplica(signal)) {
    return EXPECTED_SINGLE_REPLICA_LABEL;
  }

  return ISSUE_LABELS[issue] || issue;
}
