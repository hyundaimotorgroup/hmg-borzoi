"use client";

import { useMemo } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { Search, RefreshCw, History, AlertCircle, Server } from "lucide-react";

import { PanelLoader } from "@/components/ui/loading-spinner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartLoadingBar } from "@/components/cluster-detail/shared/charts/ChartLoadingBar";
import { DataTable } from "@/components/ui/data-table";
import { DashboardTimeRangePicker } from "@/components/cluster-detail/shared/components/DashboardTimeRangePicker";
import { QueryTextCell } from "@/components/query/QueryTextCell";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSettings } from "@/contexts/SettingsContext";
import type { DashboardTimeRange } from "@/lib/metrics/timeseries-range";
import { formatDateTimeWithTimezone } from "@/lib/utils/time-formatter";
import { cn } from "@/lib/utils";

import type { AuditCluster, HistoryQuery } from "../types";
import { STATUS_CONFIG, ENVIRONMENT_LABELS } from "../utils";

type Props = {
  clusters: AuditCluster[];
  selectedClusterId: string;
  onClusterChange: (val: string) => void;
  querySearchTerm: string;
  setQuerySearchTerm: (val: string) => void;
  queryTimeRange: DashboardTimeRange;
  setQueryTimeRange: (val: DashboardTimeRange) => void;
  historyLoading: boolean;
  historyError: string | null;
  queryHistory: HistoryQuery[];
  queryHistoryTotal: number;
  historyPage: number;
  setHistoryPage: (page: number | ((p: number) => number)) => void;
  historyPageSize: number;
  setHistoryPageSize: (size: number) => void;
  fetchQueryHistory: (optsOrClusterId?: { forceRefresh?: boolean } | string) => Promise<void>;
};

export function QueryHistoryTab({
  clusters,
  selectedClusterId,
  onClusterChange,
  querySearchTerm,
  setQuerySearchTerm,
  queryTimeRange,
  setQueryTimeRange,
  historyLoading,
  historyError,
  queryHistory,
  queryHistoryTotal,
  historyPage,
  setHistoryPage,
  historyPageSize,
  setHistoryPageSize,
  fetchQueryHistory,
}: Props) {
  const { generalSettings } = useSettings();
  const timezone = generalSettings.timezone || 'UTC';

  const totalPages = Math.max(1, Math.ceil(queryHistoryTotal / historyPageSize));
  const showRefreshingState = historyLoading && queryHistoryTotal > 0;
  const showInitialLoading = historyLoading && queryHistoryTotal === 0 && queryHistory.length === 0;

  const columns = useMemo<ColumnDef<HistoryQuery>[]>(
    () => [
      {
        accessorKey: "queryId",
        header: "Query ID",
        size: 190,
        cell: ({ getValue }) => (
          <span className="block truncate font-mono text-xs" title={getValue<string>()}>{getValue<string>()}</span>
        ),
      },
      {
        accessorKey: "user",
        header: "User",
        size: 72,
      },
      {
        accessorKey: "query",
        header: "Query",
        size: 600,
        meta: { truncate: false as const },
        cell: ({ row }) => (
          <QueryTextCell
            query={row.original.query}
            queryId={row.original.queryId}
            wrapperClassName="w-full max-w-full gap-1"
            copyButtonClassName="-mr-1 h-6 w-6"
          />
        ),
      },
      {
        accessorKey: "durationMs",
        header: "Duration",
        size: 88,
        meta: { align: "right" as const },
        cell: ({ getValue }) => `${(getValue<number>() / 1000).toFixed(2)}s`,
      },
      {
        accessorKey: "readRows",
        header: "Read Rows",
        size: 96,
        meta: { align: "right" as const },
        cell: ({ getValue }) => getValue<number>().toLocaleString(),
      },
      {
        accessorKey: "memoryUsage",
        header: "Memory",
        size: 96,
        meta: { align: "right" as const },
        cell: ({ getValue }) => `${getValue<number>().toFixed(1)} MB`,
      },
      {
        accessorKey: "status",
        header: "Status",
        size: 96,
        meta: { truncate: false as const, align: "right" as const },
        cell: ({ getValue }) =>
          getValue<string>() === "completed" ? (
            <div className="flex w-full justify-end">
              <Badge className="bg-green-500">Completed</Badge>
            </div>
          ) : (
            <div className="flex w-full justify-end">
              <Badge className="bg-red-500">Failed</Badge>
            </div>
          ),
      },
      {
        accessorKey: "eventTime",
        header: "Time",
        size: 148,
        meta: { align: "right" as const },
        cell: ({ getValue }) => {
          const val = getValue<string>();
          return val ? formatDateTimeWithTimezone(val, timezone) : "-";
        },
      },
    ],
    [timezone]
  );

  const handlePageChange = (page: number) => {
    setHistoryPage(page);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Select value={selectedClusterId} onValueChange={onClusterChange}>
              <SelectTrigger>
                <SelectValue placeholder="Select Cluster" />
              </SelectTrigger>
              <SelectContent>
                {clusters.map((cluster) => (
                  <SelectItem key={cluster.id} value={cluster.id}>
                    <div className="flex items-center gap-2">
                      <Server className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400 flex-shrink-0" />
                      <span className="font-medium">{cluster.name}</span>
                      {cluster.environment && (
                        <span className="text-xs text-gray-500">({ENVIRONMENT_LABELS[cluster.environment] ?? cluster.environment})</span>
                      )}
                      <Badge className={`${(STATUS_CONFIG[cluster.status ?? 'healthy']).color} text-xs px-1.5 py-0 ml-1`}>
                        {(STATUS_CONFIG[cluster.status ?? 'healthy']).label}
                      </Badge>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Search query ID, users, queries..."
                value={querySearchTerm}
                onChange={(e) => setQuerySearchTerm(e.target.value)}
                className="pl-10"
                disabled={!selectedClusterId}
              />
            </div>
            <DashboardTimeRangePicker
              value={queryTimeRange}
              timezone={timezone}
              onChange={setQueryTimeRange}
              onRefresh={() => fetchQueryHistory({ forceRefresh: true })}
              refreshing={historyLoading}
            />
          </div>
        </CardContent>
      </Card>

      {!selectedClusterId ? (
        <Card>
          <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
            <div className="flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800/60 mb-5">
              <History className="w-8 h-8 text-gray-400 dark:text-gray-500" />
            </div>
            <p className="text-gray-600 dark:text-gray-400">Select a Cluster</p>
            <p className="text-sm text-gray-500 dark:text-gray-500 mt-1">
              Select a cluster from the dropdown above to view query history
            </p>
          </div>
        </Card>
      ) : showInitialLoading ? (
        <Card>
          <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
            <PanelLoader />
            <p className="text-gray-500 dark:text-gray-400 text-sm" aria-live="polite">Loading…</p>
          </div>
        </Card>
      ) : historyError ? (
        <Card className="border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950">
          <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
            <AlertCircle className="w-8 h-8 mx-auto text-red-500 mb-2" />
            <p className="text-red-700 dark:text-red-400 text-sm mb-3">{historyError}</p>
            <Button variant="outline" size="sm" onClick={() => void fetchQueryHistory({ forceRefresh: true })}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Retry
            </Button>
          </div>
        </Card>
      ) : (
        <Card className="relative overflow-hidden">
          <ChartLoadingBar loading={showRefreshingState} showDelayMs={0} />
          <CardHeader>
            <CardTitle className="text-base dark:text-white">
              Query History ({queryHistoryTotal})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className={cn(
                "transition-opacity duration-200",
                showRefreshingState && "opacity-45"
              )}
            >
              <DataTable
                columns={columns}
                data={queryHistory}
                pageCount={totalPages}
                pageIndex={historyPage - 1}
                pageSize={historyPageSize}
                onPageChange={handlePageChange}
                onPageSizeChange={setHistoryPageSize}
                emptyMessage={
                  queryHistoryTotal === 0
                    ? querySearchTerm
                      ? "No results found."
                      : "No query history."
                    : "No queries on this page."
                }
              />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
