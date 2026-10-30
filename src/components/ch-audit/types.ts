export interface AuditCluster {
  id: string;
  name: string;
  status?: string;
  environment?: string;
  host?: string;
  port?: number;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  clusterId: string;
  clusterName: string;
  username: string;
  queryType: string; // CREATE, DROP, ALTER, etc.
  eventType: string; // QueryFinish, ExceptionBeforeStart, ExceptionWhileProcessing
  query: string;
  database: string;
  table?: string;
  success: boolean;
  exception?: string;
  duration_ms: number;
  hostname: string;
}

export interface DdlAuditSummary {
  total: number;
  successCount: number;
  failedCount: number;
  errorCount: number;
  uniqueUsers: number;
}

export interface DdlAuditPage {
  items: AuditLog[];
  total: number;
  page: number;
  pageSize: number;
  summary: DdlAuditSummary;
}

export interface RunningQuery {
  queryId: string;
  user: string;
  query: string;
  elapsed: number;
  readRows: number;
  readBytes: number;
  memoryUsage: number;
}

export interface HistoryQuery {
  queryId: string;
  user: string;
  query: string;
  status: "completed" | "failed";
  durationMs: number;
  readRows: number;
  readBytes: number;
  memoryUsage: number;
  exception: string;
  eventTime: string;
}

export interface QueryHistoryPage {
  items: HistoryQuery[];
  total: number;
  page: number;
  pageSize: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapRunningQuery(q: any): RunningQuery {
  return {
    queryId: q.query_id,
    user: q.user || "System",
    query: q.query,
    elapsed: Number(q.elapsed) || 0,
    readRows: Number(q.read_rows) || 0,
    readBytes: Number(q.read_bytes) || 0,
    memoryUsage: (Number(q.memory_usage) || 0) / (1024 * 1024),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapHistoryQuery(q: any): HistoryQuery {
  const failedTypes = ["ExceptionBeforeStart", "ExceptionWhileProcessing"];
  return {
    queryId: q.query_id,
    user: q.user || "System",
    query: q.query,
    status: failedTypes.includes(q.type) ? "failed" : "completed",
    durationMs: Number(q.query_duration_ms) || 0,
    readRows: Number(q.read_rows) || 0,
    readBytes: Number(q.read_bytes) || 0,
    memoryUsage: (Number(q.memory_usage) || 0) / (1024 * 1024),
    exception: q.exception || "",
    eventTime: q.event_time || "",
  };
}
