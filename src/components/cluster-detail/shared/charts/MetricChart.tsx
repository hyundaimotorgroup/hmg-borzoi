import React from "react";
import type { DashboardTimeRange } from "@/lib/metrics/timeseries-range";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ChartLoadingBar } from "./ChartLoadingBar";
import {
  LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { ChartInfo } from "@/components/ChartInfo";
import { RefreshCw } from "lucide-react";
import type { TooltipContentProps } from "recharts";
import type { TimeRange } from "@/components/cluster-detail/shared/lib/chartConverters";
import { useDeferredVisibleValue, useElementVisibility } from "../../hooks/useElementVisibility";
import { cn } from "@/lib/utils";
import { DASHBOARD_CHART_SKELETON_HEIGHT, DASHBOARD_CHART_VIEWPORT_HEIGHT } from "./chartLayout";
import { ChartSeriesSummaryTable } from "@/components/cluster-detail/shared/charts/ChartSeriesSummaryTable";
import { buildChartSeriesSummaryRows, type ChartSeriesDescriptor } from "@/components/cluster-detail/shared/charts/chartSeriesSummary";

function ChartTooltip<
  TValue extends number | string | ReadonlyArray<number | string>,
  TName extends number | string,
>({
  active,
  payload,
  label,
  unit,
  valueFormatter,
  focusedNodes = [],
  hoveredNode,
}: TooltipContentProps<TValue, TName> & { unit?: string; valueFormatter?: (value: number) => string; focusedNodes?: string[]; hoveredNode?: string | null }) {
  if (!active || !payload?.length) return null;
  const seen = new Set<string>();
  const deduped = [...payload].reverse().filter(entry => {
    const key = String(entry.dataKey);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).reverse();
  const filtered = focusedNodes.length > 0
    ? deduped.filter((entry) => {
      const key = String(entry.name ?? entry.dataKey);
      return focusedNodes.includes(key);
    })
    : deduped;
  const visible = filtered.length > 0 ? filtered : deduped;
  return (
    <div className="rounded border bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-600 px-3 py-2 text-xs shadow-md">
      <p className="mb-1  text-gray-700 dark:text-gray-300">{label}</p>
      {visible.map((entry, i) => {
        const labelText = entry.name ?? entry.dataKey;
        const isHovered = hoveredNode != null && String(labelText) === hoveredNode;
        return (
        <div
          key={`${String(entry.dataKey)}-${i}`}
          className={cn(
            "flex items-center gap-2 rounded-sm border border-transparent px-1 py-0.5",
            isHovered && "border-gray-200 dark:border-slate-600/80"
          )}
        >
          <span
            className="h-4 w-0.5 rounded-full flex-shrink-0 transition-opacity"
            style={{ backgroundColor: entry.color, opacity: isHovered ? 1 : 0 }}
          />
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: entry.color }} />
          <span style={{ color: entry.color }} className={cn("", isHovered && "")}>
            {labelText}:
          </span>
          <span style={{ color: entry.color }} className={cn("", isHovered && "")}>
            {typeof entry.value === "number"
              ? valueFormatter?.(entry.value) ?? `${entry.value.toFixed(2)}${unit}`
              : entry.value}
          </span>
        </div>
      )})}
    </div>
  );
}

export interface MetricChartProps {
  title: string;
  icon: React.ReactNode;
  data: Record<string, unknown>[];
  nodes: string[];
  selectedNodes: string[];
  colors: string[];
  unit?: string;
  chartType?: "line" | "area";
  focusedNodes?: string[];
  onLegendClick?: (dataKey: string) => void;
  chartDescription?: string;
  chartQuery?: string;
  yAxisLabel?: string;
  yAxisDescription?: string;
  aggregation?: string;
  yAxisDomain?: [number, number | string];
  yAxisFormatter?: (value: number) => string;
  valueFormatter?: (value: number) => string;
  showSummaryTable?: boolean;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onSummaryRowClick?: (label: string) => void;
  timeRange?: TimeRange | DashboardTimeRange;
  timezone?: string;
  keepUnselectedVisible?: boolean;
}

function MetricChartComponent({
  title,
  icon,
  data,
  nodes,
  selectedNodes,
  colors,
  unit = "",
  chartType = "line",
  focusedNodes,
  onLegendClick,
  chartDescription = "",
  chartQuery,
  yAxisLabel = "",
  yAxisDescription = "",
  aggregation = "avg",
  yAxisDomain,
  yAxisFormatter,
  valueFormatter,
  showSummaryTable = true,
  loading = false,
  error = null,
  onRetry,
  onSummaryRowClick,
  keepUnselectedVisible = true,
}: MetricChartProps) {
  const cardRef = React.useRef<HTMLDivElement>(null);
  const [hoveredNode, setHoveredNode] = React.useState<string | null>(null);
  const isChartVisible = useElementVisibility(cardRef, {
    rootMargin: "200px 0px",
    threshold: 0.01,
  });
  const visibleData = useDeferredVisibleValue(data, isChartVisible);
  const visibleLoading = useDeferredVisibleValue(loading, isChartVisible);
  const visibleError = useDeferredVisibleValue(error, isChartVisible);
  const deferredData = React.useDeferredValue(visibleData);
  const displayKeys = React.useMemo(
    () => (keepUnselectedVisible || selectedNodes.length === 0 ? nodes : selectedNodes),
    [keepUnselectedVisible, nodes, selectedNodes]
  );
  const effectiveFocusedNodes = React.useMemo(() => {
    if (selectedNodes.length > 0) {
      return selectedNodes;
    }

    return focusedNodes ?? [];
  }, [focusedNodes, selectedNodes]);
  const isFaded = React.useCallback(
    (key: string) => effectiveFocusedNodes.length > 0 && !effectiveFocusedNodes.includes(key),
    [effectiveFocusedNodes]
  );
  const hasData = visibleData.length > 0;
  const blockingError = visibleError && !hasData ? visibleError : null;
  const staleError = visibleError && hasData ? visibleError : null;
  const showInitialSkeleton = visibleLoading && !hasData;
  const showRefreshState = visibleLoading && hasData;

  const hitLine = React.useCallback((dataKey: string, color: string) => {
    return (
      <Line
        key={`${dataKey}-hit`}
        type="monotone"
        dataKey={dataKey}
        stroke={color}
        strokeWidth={12}
        strokeOpacity={0}
        dot={false}
        activeDot={false}
        legendType="none"
        isAnimationActive={false}
        onClick={() => onLegendClick?.(dataKey)}
        onMouseEnter={() => setHoveredNode(dataKey)}
        onMouseMove={() => setHoveredNode(dataKey)}
        onMouseLeave={() => setHoveredNode((current) => (current === dataKey ? null : current))}
        style={{ cursor: "pointer" }}
        pointerEvents="stroke"
      />
    );
  }, [onLegendClick]);

  const yAxisProps = React.useMemo(() => ({
    tick: { fontSize: 11 },
    width: yAxisFormatter ? 88 : 60,
    className: "dark:fill-gray-400",
    domain: yAxisDomain ?? ([0, "auto"] as [number, string]),
    ...(yAxisFormatter ? { tickFormatter: yAxisFormatter } : {}),
  }), [yAxisDomain, yAxisFormatter]);

  const xAxisEl = React.useMemo(() => (
    <XAxis
      dataKey="time"
      tick={{ fontSize: 11 }}
      interval="preserveStartEnd"
      minTickGap={30}
      className="dark:fill-gray-400"
    />
  ), []);

  const tooltipContent = React.useCallback(
    (props: TooltipContentProps<number | string | ReadonlyArray<number | string>, number | string>) => (
      <ChartTooltip {...props} unit={unit} valueFormatter={valueFormatter} focusedNodes={effectiveFocusedNodes} hoveredNode={hoveredNode} />
    ),
    [effectiveFocusedNodes, hoveredNode, unit, valueFormatter]
  );

  const tooltipEl = React.useMemo(() => (
    <Tooltip
      shared
      content={tooltipContent}
    />
  ), [tooltipContent]);

  const summarySourceData = React.useMemo<Array<Record<string, string | number>>>(
    () => deferredData.map((row) => Object.fromEntries(
      Object.entries(row).filter(([, value]) => typeof value === "string" || typeof value === "number")
    ) as Record<string, string | number>),
    [deferredData]
  );

  const seriesDescriptors = React.useMemo<ChartSeriesDescriptor[]>(() => (
    displayKeys.map((key, index) => ({
      key,
      label: key,
      color: colors[index % colors.length],
      parentKey: key,
    }))
  ), [colors, displayKeys]);

  const summaryRows = React.useMemo(
    () => buildChartSeriesSummaryRows(summarySourceData, seriesDescriptors),
    [seriesDescriptors, summarySourceData]
  );

  return (
    <div ref={cardRef}>
    <Card className="relative overflow-hidden bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <ChartLoadingBar loading={visibleLoading} />
      <CardHeader className="pb-2 pt-3 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold text-gray-800 dark:text-white flex items-center gap-2">
            {icon}
            {title}
            {(chartDescription || chartQuery) && (
              <ChartInfo
                title={title}
                description={chartDescription}
                query={chartQuery}
                yAxisLabel={yAxisLabel}
                yAxisDescription={yAxisDescription}
                aggregation={aggregation}
              />
            )}
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <div className="relative" style={{ height: DASHBOARD_CHART_VIEWPORT_HEIGHT }}>
          {staleError ? (
            <div className="pointer-events-auto absolute right-2 top-2 z-40 max-w-[70%] rounded-md border border-amber-200 bg-amber-50/95 px-2 py-1 text-[10px] text-amber-700 shadow-sm dark:border-amber-900/70 dark:bg-amber-950/90 dark:text-amber-300">
              <div className="flex items-center gap-2">
                <span>Showing previous data · {staleError}</span>
                {onRetry ? (
                  <Button type="button" variant="ghost" size="sm" onClick={onRetry} className="h-6 px-2 text-[10px] text-amber-700 hover:text-amber-800 dark:text-amber-300 dark:hover:text-amber-200">
                    <RefreshCw className="h-3 w-3" />
                    Retry
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}
          {blockingError ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center text-xs text-red-500 dark:text-red-400">
              <div>{blockingError}</div>
              {onRetry ? (
                <Button type="button" variant="outline" size="sm" onClick={onRetry} className="gap-2">
                  <RefreshCw className="h-3.5 w-3.5" />
                  Retry chart
                </Button>
              ) : null}
            </div>
          ) : showInitialSkeleton ? (
            <div className="grid h-full grid-cols-1 gap-3">
              <Skeleton className="h-6 w-32" />
              <Skeleton className="w-full rounded-md" style={{ height: DASHBOARD_CHART_SKELETON_HEIGHT }} />
              <div className="flex items-center justify-between gap-2">
              <Skeleton className="h-3 w-14" />
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-3 w-12" />
              </div>
            </div>
          ) : (
            <div
              className={cn(
                "h-full transition-opacity duration-200 ease-out",
                showRefreshState && "opacity-60"
              )}
            >
              <ResponsiveContainer width="100%" height="100%" debounce={120}>
                {chartType === "area" ? (
                  <AreaChart data={deferredData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--recharts-tooltip-border)" />
                  {xAxisEl}
                  <YAxis {...yAxisProps} />
                  {tooltipEl}
                  {displayKeys.map((key, index) => (
                    <Area
                      key={key}
                      type="monotone"
                      dataKey={key}
                      stackId="1"
                      stroke={colors[index % colors.length]}
                      fill={colors[index % colors.length]}
                      fillOpacity={0.6}
                      isAnimationActive={false}
                    />
                  ))}
                </AreaChart>
              ) : (
                <LineChart data={deferredData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--recharts-tooltip-border)" />
                  {xAxisEl}
                  <YAxis {...yAxisProps} />
                  {tooltipEl}
                  {displayKeys.map((key, index) => (
                    <React.Fragment key={key}>
                      <Line
                        type="monotone"
                        dataKey={key}
                        stroke={isFaded(key) ? "#d1d5db" : colors[index % colors.length]}
                        strokeWidth={1.5}
                        strokeOpacity={isFaded(key) ? 0.3 : 0.9}
                        dot={false}
                        activeDot={false}
                        connectNulls={true}
                        name={key}
                        isAnimationActive={false}
                        onMouseEnter={() => setHoveredNode(key)}
                        onMouseMove={() => setHoveredNode(key)}
                        onMouseLeave={() => setHoveredNode((current) => (current === key ? null : current))}
                      />
                      {hitLine(key, colors[index % colors.length])}
                    </React.Fragment>
                  ))}
                </LineChart>
              )}
              </ResponsiveContainer>
            </div>
          )}
        </div>
        {showSummaryTable ? (
          <ChartSeriesSummaryTable rows={summaryRows} unit={unit} valueFormatter={valueFormatter} onRowClick={onSummaryRowClick ?? onLegendClick} hoveredLabel={hoveredNode} focusedLabels={effectiveFocusedNodes} />
        ) : null}
      </CardContent>
    </Card>
    </div>
  );
}

export const MetricChart = React.memo(MetricChartComponent);
