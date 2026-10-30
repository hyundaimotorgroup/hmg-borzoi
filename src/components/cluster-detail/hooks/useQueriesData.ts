import { buildTimeseriesSearchParams, type DashboardTimeRange } from "@/lib/metrics/timeseries-range";
import { usePanelData } from "./usePanelData";
import type { TimeRange, TabTimeseriesRow } from "@/components/cluster-detail/shared/lib/chartConverters";
import { convertTabTimeseriesForChart, shouldShowDate, formatChartTimestamp } from "@/components/cluster-detail/shared/lib/chartConverters";
import { getChartMetricState, useChartMetricStates } from "./useChartMetricStates";
import type { NodeNameResolver } from "@/components/cluster-detail/shared/lib/nodeHost";
import { getNodeLabelFromHost } from "@/components/cluster-detail/shared/lib/nodeHost";

const QUERY_METRICS = [
  "successQueries",
  "failedQueries",
  "readThroughput",
  "writeThroughput",
  "queryMemoryUsage",
  "queryDuration",
  "queryType",
  "readRowCount",
  "writeRowCount",
  "queryQueue",
  "currentQueryMemory",
] as const;

export interface QueryDistributionRow {
  node: string;
  user: string;
  client_hostname: string;
  query_count: number;
  running_count: number;
  avg_ms: number;
}

export interface FailedQuery {
  query_id: string;
  event_time: string;
  hostname: string;
  user: string;
  query: string;
  exception: string;
  readable_memory_usage: string;
  query_duration_ms: number;
}

interface QueryTypeRow {
  time: string;
  hostname?: string;
  query_type?: string;
  count?: number;
}

interface QueryTypeChartPoint extends Record<string, unknown> {
  time: string;
  timestamp: number;
  SELECT: number;
  INSERT: number;
  ALTER: number;
  CREATE: number;
  DROP: number;
}

interface ChartState {
  loading: boolean;
  error: string | null;
  retry?: () => void;
}

interface QueriesDataResult {
  failedQueriesPanel: { data: FailedQuery[]; loading: boolean; error: string | null };
  queryDistributionPanel: { data: QueryDistributionRow[]; loading: boolean; error: string | null };
  successQueriesData: Record<string, unknown>[];
  failedQueriesData: Record<string, unknown>[];
  readThroughputData: Record<string, unknown>[];
  writeThroughputData: Record<string, unknown>[];
  queryMemoryData: Record<string, unknown>[];
  queryDurationData: Record<string, unknown>[];
  queryTypeData: Record<string, unknown>[];
  readRowCountData: Record<string, unknown>[];
  writeRowCountData: Record<string, unknown>[];
  queryQueueData: Record<string, unknown>[];
  currentQueryMemoryData: Record<string, unknown>[];
  chartStates: {
    successQueries:      ChartState;
    failedQueriesTs:     ChartState;
    readThroughput:      ChartState;
    writeThroughput:     ChartState;
    queryMemoryUsage:    ChartState;
    queryDuration:       ChartState;
    queryType:           ChartState;
    readRowCount:        ChartState;
    writeRowCount:       ChartState;
    queryQueue:          ChartState;
    currentQueryMemory:  ChartState;
  };
}

function convertQueryTypeTimeseries(
  tsData: QueryTypeRow[],
  selectedNodes: string[],
  timeRange: TimeRange | DashboardTimeRange,
  timezone: string,
  nodeNameResolver?: NodeNameResolver
): QueryTypeChartPoint[] {
  if (!tsData || tsData.length === 0) return [];

  const parseCH = (t: string) => {
    const n = t.includes("Z") || t.includes("+") ? t : t.replace(" ", "T") + "Z";
    return new Date(n).getTime();
  };

  const firstTs = parseCH(tsData[0].time);
  const lastTs  = parseCH(tsData[tsData.length - 1].time);
  const showDate = shouldShowDate(timeRange, firstTs, lastTs, timezone);

  const grouped: Record<string, QueryTypeChartPoint> = {};

  tsData.forEach((row) => {
    const timestamp = parseCH(row.time);
    const timeKey   = String(timestamp);
    const timeStr   = formatChartTimestamp(timestamp, timezone, showDate);
    const shortHostname = nodeNameResolver?.(row.hostname) || getNodeLabelFromHost(row.hostname);

    if (selectedNodes.length > 0 && !selectedNodes.includes(shortHostname)) return;

    if (!grouped[timeKey]) {
      grouped[timeKey] = { time: timeStr, timestamp, SELECT: 0, INSERT: 0, ALTER: 0, CREATE: 0, DROP: 0 };
    }

    const queryType = row.query_type;
    if (queryType && ["SELECT", "INSERT", "ALTER", "CREATE", "DROP"].includes(queryType)) {
      grouped[timeKey][queryType as "SELECT" | "INSERT" | "ALTER" | "CREATE" | "DROP"] =
        (grouped[timeKey][queryType as "SELECT" | "INSERT" | "ALTER" | "CREATE" | "DROP"] || 0) + (row.count || 0);
    }
  });

  return Object.values(grouped).sort((a, b) => a.timestamp - b.timestamp);
}

export function useQueriesData(
  clusterId: string,
  timeRange: TimeRange | DashboardTimeRange,
  selectedNodes: string[],
  timezone: string,
  refreshNonce: number,
  hasCluster: boolean,
  nodeNameResolver?: NodeNameResolver,
  isActive: boolean = true
): QueriesDataResult {
  const enabled = hasCluster && isActive;
  const metricStates = useChartMetricStates(clusterId, QUERY_METRICS, timeRange, { enabled, timezone, refreshNonce });
  const successQueriesTs = getChartMetricState<TabTimeseriesRow>(metricStates, "successQueries");
  const failedQueriesTs = getChartMetricState<TabTimeseriesRow>(metricStates, "failedQueries");
  const readThroughputTs = getChartMetricState<TabTimeseriesRow>(metricStates, "readThroughput");
  const writeThroughputTs = getChartMetricState<TabTimeseriesRow>(metricStates, "writeThroughput");
  const queryMemoryUsageTs = getChartMetricState<TabTimeseriesRow>(metricStates, "queryMemoryUsage");
  const queryDurationTs = getChartMetricState<TabTimeseriesRow>(metricStates, "queryDuration");
  const queryTypeTs = getChartMetricState<TabTimeseriesRow>(metricStates, "queryType");
  const readRowCountTs = getChartMetricState<TabTimeseriesRow>(metricStates, "readRowCount");
  const writeRowCountTs = getChartMetricState<TabTimeseriesRow>(metricStates, "writeRowCount");
  const queryQueueTs = getChartMetricState<TabTimeseriesRow>(metricStates, "queryQueue");
  const currentQueryMemoryTs = getChartMetricState<TabTimeseriesRow>(metricStates, "currentQueryMemory");

  const deps = [clusterId, hasCluster, isActive, refreshNonce, timeRange, timezone];

  const failedParams = (() => {
    const p = buildTimeseriesSearchParams(timeRange, timezone);
    p.set('type', 'failed');
    p.set('limit', '100');
    return p.toString();
  })();

  const distributionParams = (() => {
    const p = buildTimeseriesSearchParams(timeRange, timezone);
    p.set('type', 'distribution');
    return p.toString();
  })();

  const failedQueriesPanel = usePanelData<FailedQuery>(
    enabled ? `/api/clusters/${clusterId}/queries?${failedParams}` : null,
    enabled,
    deps
  );

  const queryDistributionPanel = usePanelData<QueryDistributionRow>(
    enabled ? `/api/clusters/${clusterId}/queries?${distributionParams}` : null,
    enabled,
    deps
  );

  const successQueriesData = convertTabTimeseriesForChart(successQueriesTs.data, "success_queries", timezone, timeRange, nodeNameResolver);
  const failedQueriesData = convertTabTimeseriesForChart(failedQueriesTs.data, "failed_queries", timezone, timeRange, nodeNameResolver);
  const readThroughputData = convertTabTimeseriesForChart(readThroughputTs.data, "read_bytes_per_sec", timezone, timeRange, nodeNameResolver);
  const writeThroughputData = convertTabTimeseriesForChart(writeThroughputTs.data, "write_bytes_per_sec", timezone, timeRange, nodeNameResolver);
  const queryMemoryData = convertTabTimeseriesForChart(queryMemoryUsageTs.data, "query_memory_bytes", timezone, timeRange, nodeNameResolver);
  const queryDurationData = convertTabTimeseriesForChart(queryDurationTs.data, "avg_duration_ms", timezone, timeRange, nodeNameResolver);
  const queryTypeData = convertQueryTypeTimeseries(queryTypeTs.data as unknown as QueryTypeRow[], selectedNodes, timeRange, timezone, nodeNameResolver);
  const readRowCountData = convertTabTimeseriesForChart(readRowCountTs.data, "rows_read", timezone, timeRange, nodeNameResolver);
  const writeRowCountData = convertTabTimeseriesForChart(writeRowCountTs.data, "rows_written", timezone, timeRange, nodeNameResolver);
  const queryQueueData = convertTabTimeseriesForChart(queryQueueTs.data, "queue_length", timezone, timeRange, nodeNameResolver);
  const currentQueryMemoryData = convertTabTimeseriesForChart(currentQueryMemoryTs.data, "current_memory_bytes", timezone, timeRange, nodeNameResolver);

  const chartStates = {
    successQueries:     { loading: successQueriesTs.loading,     error: successQueriesTs.error, retry: successQueriesTs.retry },
    failedQueriesTs:    { loading: failedQueriesTs.loading,      error: failedQueriesTs.error, retry: failedQueriesTs.retry },
    readThroughput:     { loading: readThroughputTs.loading,     error: readThroughputTs.error, retry: readThroughputTs.retry },
    writeThroughput:    { loading: writeThroughputTs.loading,    error: writeThroughputTs.error, retry: writeThroughputTs.retry },
    queryMemoryUsage:   { loading: queryMemoryUsageTs.loading,   error: queryMemoryUsageTs.error, retry: queryMemoryUsageTs.retry },
    queryDuration:      { loading: queryDurationTs.loading,      error: queryDurationTs.error, retry: queryDurationTs.retry },
    queryType:          { loading: queryTypeTs.loading,          error: queryTypeTs.error, retry: queryTypeTs.retry },
    readRowCount:       { loading: readRowCountTs.loading,       error: readRowCountTs.error, retry: readRowCountTs.retry },
    writeRowCount:      { loading: writeRowCountTs.loading,      error: writeRowCountTs.error, retry: writeRowCountTs.retry },
    queryQueue:         { loading: queryQueueTs.loading,         error: queryQueueTs.error, retry: queryQueueTs.retry },
    currentQueryMemory: { loading: currentQueryMemoryTs.loading, error: currentQueryMemoryTs.error, retry: currentQueryMemoryTs.retry },
  };

  return {
    failedQueriesPanel,
    queryDistributionPanel,
    successQueriesData,
    failedQueriesData,
    readThroughputData,
    writeThroughputData,
    queryMemoryData,
    queryDurationData,
    queryTypeData,
    readRowCountData,
    writeRowCountData,
    queryQueueData,
    currentQueryMemoryData,
    chartStates,
  };
}
