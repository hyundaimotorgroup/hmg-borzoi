"use client";

import { useMemo } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { Search, Shield, Calendar, User, Database, Activity, Server } from "lucide-react";

import { PanelLoader } from "@/components/ui/loading-spinner";
import { QueryTextCell } from "@/components/query/QueryTextCell";
import { DataTable } from "@/components/ui/data-table";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartLoadingBar } from "@/components/cluster-detail/shared/charts/ChartLoadingBar";
import { DashboardTimeRangePicker } from "@/components/cluster-detail/shared/components/DashboardTimeRangePicker";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSettings } from "@/contexts/SettingsContext";
import type { DashboardTimeRange } from "@/lib/metrics/timeseries-range";
import { formatDateTimeWithTimezone } from "@/lib/utils/time-formatter";

import type { AuditCluster, AuditLog, DdlAuditSummary } from "../types";
import { QUERY_TYPES, getQueryTypeBadgeColor, STATUS_CONFIG, ENVIRONMENT_LABELS } from "../utils";

const COLUMN_WIDTHS = {
  time: 130,
  cluster: 80,
  user: 100,
  type: 80,
  database: 120,
  table: 120,
  status: 70,
  duration: 80,
  query: 600,
} as const;

type Props = {
  clusters: AuditCluster[];
  selectedCluster: string;
  setSelectedCluster: (val: string) => void;
  searchTerm: string;
  setSearchTerm: (val: string) => void;
  selectedType: string;
  setSelectedType: (val: string) => void;
  timeRange: DashboardTimeRange;
  setTimeRange: (val: DashboardTimeRange) => void;
  auditPage: number;
  setAuditPage: (page: number) => void;
  auditPageSize: number;
  setAuditPageSize: (size: number) => void;
  auditLogTotal: number;
  auditSummary: DdlAuditSummary;
  loading: boolean;
  auditLogs: AuditLog[];
  fetchAuditLogs: (opts?: { forceRefresh?: boolean }) => void;
};

export function DDLAuditTab({
  clusters,
  selectedCluster,
  setSelectedCluster,
  searchTerm,
  setSearchTerm,
  selectedType,
  setSelectedType,
  timeRange,
  setTimeRange,
  auditPage,
  setAuditPage,
  auditPageSize,
  setAuditPageSize,
  auditLogTotal,
  auditSummary,
  loading,
  auditLogs,
  fetchAuditLogs,
}: Props) {
  const { generalSettings } = useSettings();
  const timezone = generalSettings.timezone || "UTC";
  const totalPages = Math.max(1, Math.ceil(auditLogTotal / auditPageSize));
  const showRefreshingState = loading && auditLogTotal > 0;
  const showInitialLoading = loading && auditLogTotal === 0 && auditLogs.length === 0;

  const columns = useMemo<ColumnDef<AuditLog>[]>(
    () => [
      {
        accessorKey: "timestamp",
        header: "Time",
        size: COLUMN_WIDTHS.time,
        cell: ({ getValue }) => (
          <div className="flex items-center gap-1 text-xs text-gray-900 dark:text-gray-100">
            <Calendar className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
            <span className="truncate">
              {formatDateTimeWithTimezone(getValue<string>(), timezone)}
            </span>
          </div>
        ),
      },
      {
        accessorKey: "clusterName",
        header: "Cluster",
        size: COLUMN_WIDTHS.cluster,
        cell: ({ getValue }) => (
          <span className="text-xs text-gray-900 dark:text-gray-100">
            {getValue<string>()}
          </span>
        ),
      },
      {
        accessorKey: "username",
        header: "User",
        size: COLUMN_WIDTHS.user,
        cell: ({ getValue }) => (
          <div className="flex items-center gap-1">
            <User className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
            <span className="truncate text-gray-900 dark:text-gray-100 text-xs">
              {getValue<string>()}
            </span>
          </div>
        ),
      },
      {
        accessorKey: "queryType",
        header: "Type",
        size: COLUMN_WIDTHS.type,
        meta: { truncate: false as const },
        cell: ({ getValue }) => (
          <Badge className={getQueryTypeBadgeColor(getValue<string>())}>{getValue<string>()}</Badge>
        ),
      },
      {
        accessorKey: "database",
        header: "Database",
        size: COLUMN_WIDTHS.database,
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            <Database className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
            <span className="truncate text-gray-900 dark:text-gray-100 text-xs">
              {row.original.database || <span className="text-gray-400">—</span>}
            </span>
          </div>
        ),
      },
      {
        accessorKey: "table",
        header: "Table",
        size: COLUMN_WIDTHS.table,
        cell: ({ row }) => (
          <span className="truncate text-gray-900 dark:text-gray-100 text-xs">
            {row.original.table || <span className="text-gray-400">—</span>}
          </span>
        ),
      },
      {
        accessorKey: "query",
        header: "Query",
        size: COLUMN_WIDTHS.query,
        
        cell: ({ row }) => (
          <div className="space-y-1 overflow-hidden">
            <QueryTextCell
              query={row.original.query}
              queryId={row.original.id}
              wrapperClassName="w-full max-w-full gap-1"
              copyButtonClassName="h-6 w-6 -mr-1"
            />
            {!row.original.success && row.original.exception && (
              <div
                className="truncate text-xs text-red-600 dark:text-red-400"
                title={row.original.exception}
              >
                Error: {row.original.exception}
              </div>
            )}
          </div>
        ),
      },
      {
        accessorKey: "success",
        header: "Status",
        size: COLUMN_WIDTHS.status,
        meta: { truncate: false as const, align: "right" as const },
        cell: ({ row }) => {
          const statusLabel = row.original.success ? "Success" : "Failed";
          const statusClassName = row.original.success
            ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
            : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300";

          return (
            <div className="w-full space-y-1 text-right">
              <div className="flex w-full justify-end">
                <Badge className={statusClassName}>{statusLabel}</Badge>
              </div>
              {row.original.eventType && row.original.eventType !== "QueryFinish" && (
                <div className="flex w-full justify-end">
                  <div className="text-xs text-orange-600 dark:text-orange-400">{row.original.eventType}</div>
                </div>
              )}
            </div>
          );
        },
      },
      {
        accessorKey: "duration_ms",
        header: "Duration",
        size: COLUMN_WIDTHS.duration,
        meta: { align: "right" as const },
        cell: ({ getValue }) => (
          <span className="block pr-2 text-xs text-gray-600 dark:text-gray-400">
            {getValue<number>().toFixed(2)} ms
          </span>
        ),
      },
    ],
    [timezone]
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Select value={selectedCluster} onValueChange={setSelectedCluster}>
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
                placeholder="Search users, queries, databases..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
                disabled={!selectedCluster}
              />
            </div>

            <Select value={selectedType} onValueChange={setSelectedType} disabled={!selectedCluster}>
              <SelectTrigger>
                <SelectValue placeholder="Select Query Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {QUERY_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <DashboardTimeRangePicker
              value={timeRange}
              timezone={timezone}
              onChange={setTimeRange}
              onRefresh={() => fetchAuditLogs({ forceRefresh: true })}
              refreshing={loading}
            />
          </div>
        </CardContent>
      </Card>

      {!selectedCluster ? (
        <Card>
          <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
            <div className="flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800/60 mb-5">
              <Shield className="w-8 h-8 text-gray-400 dark:text-gray-500" />
            </div>
            <p className="text-gray-600 dark:text-gray-400">Select a Cluster</p>
            <p className="text-sm text-gray-500 dark:text-gray-500 mt-1">
              Select a cluster from the dropdown above to view DDL audit logs
            </p>
          </div>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-5 gap-4">
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              <span className="text-base text-gray-700 dark:text-gray-300">Total DDL Operations</span>
              <span className="text-base text-gray-900 dark:text-white">{auditSummary.total}</span>
            </div>
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-green-600 dark:text-green-400" />
              <span className="text-base text-gray-700 dark:text-gray-300">Success</span>
              <span className="text-base text-green-600 dark:text-green-400">
                {auditSummary.successCount}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-red-600 dark:text-red-400" />
              <span className="text-base text-gray-700 dark:text-gray-300">Failed</span>
              <span className="text-base text-red-600 dark:text-red-400">
                {auditSummary.failedCount}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-orange-600 dark:text-orange-400" />
              <span className="text-base text-gray-700 dark:text-gray-300">Errors</span>
              <span className="text-base text-orange-600 dark:text-orange-400">
                {auditSummary.errorCount}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <User className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              <span className="text-base text-gray-700 dark:text-gray-300">Unique Users</span>
              <span className="text-base text-purple-600 dark:text-purple-400">
                {auditSummary.uniqueUsers}
              </span>
            </div>
          </div>

          <Card className="relative overflow-hidden">
            <ChartLoadingBar loading={showRefreshingState} showDelayMs={0} />
            <CardHeader>
              <CardTitle>Audit Logs</CardTitle>
            </CardHeader>
            <CardContent>
              {showInitialLoading ? (
                <PanelLoader />
              ) : (
                <DataTable
                  columns={columns}
                  data={auditLogs}
                  pageCount={totalPages}
                  pageIndex={auditPage - 1}
                  pageSize={auditPageSize}
                  onPageChange={setAuditPage}
                  onPageSizeChange={setAuditPageSize}
                  isLoading={showRefreshingState}
                  emptyMessage={
                    auditLogTotal === 0 && (searchTerm || selectedType !== "all")
                      ? "No results found."
                      : "No audit logs."
                  }
                />
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
