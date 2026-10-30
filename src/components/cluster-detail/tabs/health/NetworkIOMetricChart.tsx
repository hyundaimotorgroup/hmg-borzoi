import { useMemo, useRef } from "react";
import type { DashboardTimeRange } from "@/lib/metrics/timeseries-range";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ChartInfo } from "@/components/ChartInfo";
import { RefreshCw } from "lucide-react";
import {
  CartesianGrid,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { NetworkPoint } from "@/components/cluster-detail/hooks/useOverviewTimeseries";
import { useDeferredVisibleValue, useElementVisibility } from "@/components/cluster-detail/hooks/useElementVisibility";
import { ChartSeriesSummaryTable } from "@/components/cluster-detail/shared/charts/ChartSeriesSummaryTable";
import { buildChartSeriesSummaryRows, type ChartSeriesDescriptor } from "@/components/cluster-detail/shared/charts/chartSeriesSummary";
import { DASHBOARD_CHART_SKELETON_HEIGHT, DASHBOARD_CHART_VIEWPORT_HEIGHT } from "@/components/cluster-detail/shared/charts/chartLayout";
import { ChartLoadingBar } from "@/components/cluster-detail/shared/charts/ChartLoadingBar";
import { getNodeSeriesColor, useNodeChartLines } from "@/components/cluster-detail/shared/hooks/useNodeChartLines";
import { convertNetworkTimeseries, type TimeRange } from "@/components/cluster-detail/shared/lib/chartConverters";
import { formatBytesPerSecond } from "@/lib/utils/format-bytes";
import type { NodeNameResolver } from "@/components/cluster-detail/shared/lib/nodeHost";

interface NetworkIOMetricChartProps {
  title: string;
  icon: React.ReactNode;
  timeseries: {
    data: NetworkPoint[];
    loading: boolean;
    error: string | null;
    retry?: () => void;
  };
  nodes: string[];
  selectedNodes: string[];
  focusedNodes: string[];
  onLegendClick: (dataKey: string) => void;
  onSummaryRowClick?: (label: string) => void;
  timeRange: TimeRange | DashboardTimeRange;
  timezone: string;
  chartQuery: string;
  yAxisLabel: string;
  yAxisDescription: string;
  aggregation: string;
  nodeNameResolver?: NodeNameResolver;
}

export function NetworkIOMetricChart({
  title,
  icon,
  timeseries,
  nodes,
  selectedNodes,
  focusedNodes,
  onLegendClick,
  onSummaryRowClick,
  timeRange,
  timezone,
  chartQuery,
  yAxisLabel,
  yAxisDescription,
  aggregation,
  nodeNameResolver,
}: NetworkIOMetricChartProps) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const isVisible = useElementVisibility(cardRef, { rootMargin: "200px 0px", threshold: 0.01 });
  const visibleLoading = useDeferredVisibleValue(timeseries.loading, isVisible);
  const visibleError = useDeferredVisibleValue(timeseries.error, isVisible);
  const visibleData = useDeferredVisibleValue(timeseries.data, isVisible);
  const chartData = useMemo(
    () => convertNetworkTimeseries(visibleData, timezone, timeRange, nodeNameResolver),
    [nodeNameResolver, timeRange, timezone, visibleData]
  );
  const displayNodes = useMemo(
    () => nodes,
    [nodes]
  );
  const effectiveFocusedNodes = useMemo(
    () => (selectedNodes.length > 0 ? selectedNodes : focusedNodes),
    [focusedNodes, selectedNodes]
  );
  const chartEntries = useMemo(
    () => displayNodes.map((node) => ({ uniqueId: node, name: node, dataKey: node })),
    [displayNodes]
  );
  const { renderNetworkLines } = useNodeChartLines({
    nodeChartEntries: chartEntries,
    focusedNodes: effectiveFocusedNodes,
    onNodeClick: onLegendClick,
  });
  const summaryDescriptors = useMemo<ChartSeriesDescriptor[]>(() => (
    chartEntries.flatMap((entry, index) => {
      const color = getNodeSeriesColor(index);

      return [
        { key: `${entry.dataKey}-receive`, label: `${entry.name} RX`, color, parentKey: entry.name },
        { key: `${entry.dataKey}-send`, label: `${entry.name} TX`, color, parentKey: entry.name },
      ];
    })
  ), [chartEntries]);
  const summaryRows = useMemo(
    () => buildChartSeriesSummaryRows(chartData, summaryDescriptors),
    [chartData, summaryDescriptors]
  );

  const showInitialSkeleton = visibleLoading && chartData.length === 0;

  return (
    <div ref={cardRef}>
      <Card className="relative overflow-hidden bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <ChartLoadingBar loading={visibleLoading} />
        <CardHeader className="pb-1.5 pt-2 px-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm text-gray-800 dark:text-white flex items-center gap-2">
              {icon}
              {title}
              <ChartInfo
                title={title}
                description=""
                query={chartQuery}
                yAxisLabel={yAxisLabel}
                yAxisDescription={yAxisDescription}
                aggregation={aggregation}
              />
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="relative" style={{ height: DASHBOARD_CHART_VIEWPORT_HEIGHT }}>
            {visibleError && chartData.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center text-xs text-red-500 dark:text-red-400">
                <div>{visibleError}</div>
                {timeseries.retry ? (
                  <Button type="button" variant="outline" size="sm" onClick={timeseries.retry} className="gap-2">
                    <RefreshCw className="h-3.5 w-3.5" />
                    Retry chart
                  </Button>
                ) : null}
              </div>
            ) : showInitialSkeleton ? (
              <div className="grid h-full grid-cols-1 gap-3">
                <Skeleton className="h-6 w-32" />
                <Skeleton className="w-full rounded-md" style={{ height: DASHBOARD_CHART_SKELETON_HEIGHT }} />
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%" debounce={120}>
                <LineChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--recharts-tooltip-border)" />
                  <XAxis dataKey="time" tick={{ fontSize: 10 }} interval="preserveStartEnd" minTickGap={30} className="dark:fill-gray-400" />
                  <YAxis
                    tick={{ fontSize: 10 }}
                    width={88}
                    tickFormatter={formatBytesPerSecond}
                    className="dark:fill-gray-400"
                    domain={[0, "auto"]}
                  />
                  <Tooltip
                    shared
                    formatter={(value: number | string | undefined) => {
                      if (typeof value === "number") {
                        return formatBytesPerSecond(value);
                      }

                      return value ?? "";
                    }}
                    labelFormatter={(label) => String(label)}
                    contentStyle={{ fontSize: 12 }}
                    wrapperStyle={{ zIndex: 20 }}
                  />
                  {renderNetworkLines("network-io", "receive")}
                  {renderNetworkLines("network-io", "send")}
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
          <ChartSeriesSummaryTable
            rows={summaryRows}
            valueFormatter={formatBytesPerSecond}
            onRowClick={(label) => (onSummaryRowClick ?? onLegendClick)(label.replace(/ (RX|TX)$/i, ""))}
            focusedLabels={effectiveFocusedNodes}
          />
        </CardContent>
      </Card>
    </div>
  );
}
