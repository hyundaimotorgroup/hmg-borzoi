import { useMemo } from "react";
import type { DashboardTimeRange } from "@/lib/metrics/timeseries-range";
import type { TimeseriesBasePoint } from "../../hooks/useOverviewTimeseries";
import { convertTimeseriesForChart, type TimeRange } from "@/components/cluster-detail/shared/lib/chartConverters";
import { MetricChart } from "./MetricChart";
import type { NodeNameResolver } from "@/components/cluster-detail/shared/lib/nodeHost";

const NODE_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];

interface NodeTimeseriesChartProps {
  title: string;
  icon: React.ReactNode;
  valueKey: string;
  timeseries: {
    data: TimeseriesBasePoint[];
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
  unit?: string;
  yAxisDomain?: [number, number | string];
  yAxisFormatter?: (value: number) => string;
  valueFormatter?: (value: number) => string;
  yAxisLabel: string;
  yAxisDescription: string;
  aggregation: string;
  nodeNameResolver?: NodeNameResolver;
  keepUnselectedVisible?: boolean;
}

export function NodeTimeseriesChart({
  title,
  icon,
  valueKey,
  timeseries,
  nodes,
  selectedNodes,
  focusedNodes,
  onLegendClick,
  onSummaryRowClick,
  timeRange,
  timezone,
  chartQuery,
  unit,
  yAxisDomain,
  yAxisFormatter,
  valueFormatter,
  yAxisLabel,
  yAxisDescription,
  aggregation,
  nodeNameResolver,
  keepUnselectedVisible = false,
}: NodeTimeseriesChartProps) {
  const data = useMemo(
    () => convertTimeseriesForChart(timeseries.data, valueKey, timezone, timeRange, nodeNameResolver),
    [nodeNameResolver, timeRange, timeseries.data, timezone, valueKey]
  );

  return (
    <MetricChart
      title={title}
      icon={icon}
      data={data}
      nodes={nodes}
      selectedNodes={selectedNodes}
      colors={NODE_COLORS}
      unit={unit}
      focusedNodes={focusedNodes}
      onLegendClick={onLegendClick}
      onSummaryRowClick={onSummaryRowClick}
      loading={timeseries.loading}
      error={timeseries.error}
      onRetry={timeseries.retry}
      chartQuery={chartQuery}
      yAxisDomain={yAxisDomain}
      yAxisFormatter={yAxisFormatter}
      valueFormatter={valueFormatter}
      yAxisLabel={yAxisLabel}
      yAxisDescription={yAxisDescription}
      aggregation={aggregation}
      timeRange={timeRange}
      timezone={timezone}
      keepUnselectedVisible={keepUnselectedVisible}
    />
  );
}
