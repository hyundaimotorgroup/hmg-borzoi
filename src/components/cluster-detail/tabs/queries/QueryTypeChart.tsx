import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Database, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ChartInfo } from "@/components/ChartInfo";
import type { TooltipContentProps } from "recharts";
import { ChartLoadingBar } from "@/components/cluster-detail/shared/charts/ChartLoadingBar";
import { cn } from "@/lib/utils";
import { DASHBOARD_CHART_SKELETON_HEIGHT } from "@/components/cluster-detail/shared/charts/chartLayout";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function BarChartTooltip({ active, payload, label }: TooltipContentProps<any, any>) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded border bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-600 px-3 py-2 text-xs shadow-md">
      <p className="mb-1 text-gray-700 dark:text-gray-300">{label}</p>
      {payload.map((entry: { dataKey?: string | number; color?: string; name?: string; value?: number }) => (
        <div key={entry.dataKey} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: entry.color }} />
          <span className="text-gray-600 dark:text-gray-400">{entry.name}:</span>
          <span className="text-gray-800 dark:text-gray-200">{entry.value}</span>
        </div>
      ))}
    </div>
  );
}
interface QueryTypeChartProps {
  data: Record<string, unknown>[];
  selectedNode: string;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  query?: string;
}

function QueryTypeChartSkeleton() {
  return (
    <div className="grid h-[300px] grid-cols-1 gap-3">
      <Skeleton className="h-6 w-32" />
      <Skeleton className="w-full rounded-md" style={{ height: DASHBOARD_CHART_SKELETON_HEIGHT }} />
      <div className="flex items-center justify-between gap-2">
        <Skeleton className="h-3 w-14" />
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-3 w-12" />
      </div>
    </div>
  );
}

export function QueryTypeChart({ data, selectedNode, loading = false, error = null, onRetry, query }: QueryTypeChartProps) {
  const hasData = data.length > 0;
  const blockingError = error && !hasData ? error : null;
  const staleError = error && hasData ? error : null;
  const showInitialSkeleton = loading && !hasData;
  const showRefreshState = loading && hasData;

  return (
    <Card className="relative overflow-hidden border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800 lg:col-span-2 min-h-[420px]">
      <ChartLoadingBar loading={loading} />
      <CardHeader className="pb-1.5 pt-2 px-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm text-gray-800 dark:text-white flex items-center gap-2">
            <Database className="w-4 h-4 text-gray-700 dark:text-gray-300" aria-hidden="true" />
            Query Type Distribution
            <ChartInfo
              title="Query Type Distribution"
              description=""
              query={query}
              yAxisLabel="Count"
              yAxisDescription="count() per query type per time interval — classified by first keyword (SELECT/INSERT/ALTER/CREATE/DROP)"
              aggregation="sum"
            />
          </CardTitle>
          {selectedNode === "all" ? (
            <Badge variant="secondary" className="text-xs bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
              Cluster-wide
            </Badge>
          ) : (
            <Badge variant="secondary" className="text-xs bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300">
              Node: {selectedNode}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="px-3 pb-3">
        <div className="relative min-h-0" style={{ height: 300 }}>
          {staleError ? (
            <div className="pointer-events-auto absolute right-2 top-2 z-40 max-w-[75%] rounded-md border border-amber-200 bg-amber-50/95 px-2 py-1 text-[10px] text-amber-700 shadow-sm dark:border-amber-900/70 dark:bg-amber-950/90 dark:text-amber-300">
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
            <QueryTypeChartSkeleton />
          ) : (
            <div className={cn("h-full transition-opacity duration-200 ease-out", showRefreshState && "opacity-60")}>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={data} margin={{ top: 8, right: 12, left: 8, bottom: 18 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                  <XAxis
                    dataKey="time"
                    tick={{ fontSize: 10 }}
                    interval="preserveStartEnd"
                    minTickGap={24}
                    tickMargin={10}
                    angle={-35}
                    textAnchor="end"
                    height={64}
                    className="fill-gray-500 dark:fill-gray-400"
                  />
                  <YAxis tick={{ fontSize: 10 }} domain={[0, 'auto']} width={52} className="fill-gray-500 dark:fill-gray-400" />
                  <Tooltip wrapperStyle={{ zIndex: 9999 }} content={(props) => <BarChartTooltip {...props} />} />
                  <Legend
                    wrapperStyle={{ fontSize: '10px', paddingTop: '8px' }}
                    iconType="circle"
                    formatter={(value) => <span className="text-gray-600 dark:text-gray-300">{value}</span>}
                  />
                  <Bar dataKey="SELECT" stackId="a" fill="#3b82f6" name="SELECT" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="INSERT" stackId="a" fill="#10b981" name="INSERT" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="ALTER" stackId="a" fill="#f59e0b" name="ALTER" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="CREATE" stackId="a" fill="#8b5cf6" name="CREATE" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="DROP" stackId="a" fill="#ef4444" name="DROP" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
