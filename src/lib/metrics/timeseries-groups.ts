export type TimeseriesMetricGroup =
  | "metric_log"
  | "async_metric_log"
  | "query_log"
  | "error_log";

const METRIC_GROUPS = new Map<string, TimeseriesMetricGroup>([
  ["httpConnections", "metric_log"],
  ["tcpConnections", "metric_log"],
  ["interserverConnections", "metric_log"],
  ["keeperSessions", "metric_log"],
  ["keeperRequests", "metric_log"],
  ["keeperExceptions", "metric_log"],
  ["cpu", "metric_log"],
  ["network", "metric_log"],
  ["fileDescriptors", "metric_log"],
  ["backgroundPool", "metric_log"],
  ["readThroughput", "metric_log"],
  ["writeThroughput", "metric_log"],
  ["readRowCount", "metric_log"],
  ["writeRowCount", "metric_log"],
  ["queryQueue", "metric_log"],
  ["diskIO", "metric_log"],
  ["activeMerges", "metric_log"],
  ["activeMutations", "metric_log"],
  ["distributionQueue", "metric_log"],
  ["partsCount", "metric_log"],
  ["mergeBytes", "metric_log"],
  ["mutationBytes", "metric_log"],
  ["currentQueryMemory", "metric_log"],
  ["memory", "async_metric_log"],
  ["disk", "async_metric_log"],
  ["diskUsage", "async_metric_log"],
  ["freeDiskSpace", "async_metric_log"],
  ["replicationLag", "async_metric_log"],
  ["replicationQueue", "async_metric_log"],
  ["successQueries", "query_log"],
  ["failedQueries", "query_log"],
  ["queryMemoryUsage", "query_log"],
  ["queryDuration", "query_log"],
  ["queryType", "query_log"],
  ["connectionErrors", "error_log"],
  ["insertRateRows", "metric_log"],
  ["mergeRateRows", "metric_log"],
]);

export function getTimeseriesMetricGroup(metric: string): TimeseriesMetricGroup | null {
  return METRIC_GROUPS.get(metric.trim()) ?? null;
}
