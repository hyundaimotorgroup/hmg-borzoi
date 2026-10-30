"use client";

import { useMemo, useState } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import {
  Search,
  AlertCircle,
  RefreshCw,
  Server,
} from "lucide-react";

import { PanelLoader } from "@/components/ui/loading-spinner";
import { cn } from "@/lib/utils";
import { ChartLoadingBar } from "@/components/cluster-detail/shared/charts/ChartLoadingBar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { useSettings } from "@/contexts/SettingsContext";
import { formatDateTimeWithTimezone } from "@/lib/utils/time-formatter";
import { DashboardTimeRangePicker } from "@/components/cluster-detail/shared/components/DashboardTimeRangePicker";
import type { DashboardTimeRange } from "@/lib/metrics/timeseries-range";
import type { LogCluster, TextLog } from "../types";
import { STATUS_CONFIG, ENVIRONMENT_LABELS } from "../../ch-audit/utils";
import { LogDetailPanel } from "../LogDetailPanel";

// ─── Level badge ─────────────────────────────────────────────────────────────

const LEVEL_STYLES: Record<string, string> = {
  Fatal: "bg-red-600 text-white",
  Critical: "bg-red-500 text-white",
  Error: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300",
  Warning: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-300",
  Information: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300",
  Debug: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  Trace: "bg-gray-50 text-gray-400 dark:bg-gray-900 dark:text-gray-500",
};

const LEVEL_LABELS: Record<string, string> = {
  Fatal:       "FATAL",
  Critical:    "CRIT",
  Error:       "ERROR",
  Warning:     "WARN",
  Information: "INFO",
  Debug:       "DEBUG",
  Trace:       "TRACE",
};

function LevelBadge({ level }: { level: string }) {
  const style = LEVEL_STYLES[level] ?? "bg-gray-100 text-gray-600";
  const label = LEVEL_LABELS[level] ?? level.toUpperCase();
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-mono ${style}`}>
      {label}
    </span>
  );
}

// ─── Level selection helper ─────────────────────────────────────────────────────────────

const LEVEL_OPTIONS = [
  { value: "all",         label: "All Levels" },
  { value: "Fatal",       label: "Fatal" },
  { value: "Critical",    label: "Critical" },
  { value: "Error",       label: "Error" },
  { value: "Warning",     label: "Warning" },
  { value: "Information", label: "Information" },
  { value: "Debug",       label: "Debug" },
  { value: "Trace",       label: "Trace" },
];

function levelsToSelectValue(levels: string[]): string {
  if (levels.length !== 1) return "all";
  return levels[0];
}

// ─── Props ────────────────────────────────────────────────────────────────────

type Props = {
  clusters: LogCluster[];
  selectedClusterId: string;
  onClusterChange: (val: string) => void;
  textLogLoading: boolean;
  textLogError: string | null;
  textLogs: TextLog[];
  textLogTotal: number;
  textLogPage: number;
  setTextLogPage: (val: number) => void;
  textLogPageSize: number;
  setTextLogPageSize: (val: number) => void;
  textLogSearch: string;
  setTextLogSearch: (val: string) => void;
  textLogComponent: string;
  setTextLogComponent: (val: string) => void;
  textLogLevels: string[];
  setTextLogLevels: (val: string[]) => void;
  textLogTimeRange: DashboardTimeRange;
  setTextLogTimeRange: (val: DashboardTimeRange) => void;
  fetchTextLogs: (opts?: { forceRefresh?: boolean } | string) => void;
};

// ─── Main component ───────────────────────────────────────────────────────────

export function TextLogTab({
  clusters,
  selectedClusterId,
  onClusterChange,
  textLogLoading,
  textLogError,
  textLogs,
  textLogTotal,
  textLogPage,
  setTextLogPage,
  textLogPageSize,
  setTextLogPageSize,
  textLogSearch,
  setTextLogSearch,
  textLogComponent,
  setTextLogComponent,
  textLogLevels,
  setTextLogLevels,
  textLogTimeRange,
  setTextLogTimeRange,
  fetchTextLogs,
}: Props) {
  const { generalSettings } = useSettings();
  const timezone = generalSettings.timezone || "UTC";

  // ── Detail panel state ────────────────────────────────────────────────────
  const [selectedLog, setSelectedLog] = useState<TextLog | null>(null);
  const [selectedRowIndex, setSelectedRowIndex] = useState<number | null>(null);

  // ── Computed values ───────────────────────────────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(textLogTotal / textLogPageSize));

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleLevelChange = (value: string) => {
    setTextLogLevels(value === "all" ? [] : [value]);
  };

  // ── Columns ────────────────────────────────────────────────────────────────
  const columns = useMemo<ColumnDef<TextLog>[]>(
    () => [
      {
        accessorKey: "eventTime",
        header: "Time",
        size: 175,
        cell: ({ getValue }) => (
          <span className="font-mono text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap">
            {formatDateTimeWithTimezone(getValue<string>(), timezone)}
          </span>
        ),
      },
      {
        accessorKey: "level",
        header: "Level",
        size: 68,
        meta: { truncate: false as const },
        cell: ({ getValue }) => <LevelBadge level={getValue<string>()} />,
      },
      {
        accessorKey: "loggerName",
        header: "Component",
        size: 180,
        cell: ({ getValue }) => (
          <span
            className="text-xs text-gray-500 dark:text-gray-400 truncate block"
            title={getValue<string>()}
          >
            {getValue<string>()}
          </span>
        ),
      },
      {
        accessorKey: "node",
        header: "Node",
        size: 120,
        cell: ({ getValue }) => {
          const val = getValue<string>();
          return val ? (
            <span
              className="font-mono text-xs text-gray-600 dark:text-gray-400 truncate block"
              title={val}
            >
              {val}
            </span>
          ) : <span className="text-gray-400">—</span>;
        },
      },
      {
        accessorKey: "message",
        header: "Message",
        size: 1240,
        cell: ({ getValue }) => (
          <div
            className="text-xs text-gray-700 dark:text-gray-300 truncate"
            title={getValue<string>()}
          >
            {getValue<string>()}
          </div>
        ),
      },
    ],
    [timezone]
  );

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Filter card */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <Select value={selectedClusterId} onValueChange={onClusterChange}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Select Cluster" />
              </SelectTrigger>
              <SelectContent>
                {clusters.map((cluster) => (
                  <SelectItem key={cluster.id} value={cluster.id}>
                    <div className="flex items-center gap-2">
                      <Server className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400 flex-shrink-0" />
                      <span className="font-medium">{cluster.name}</span>
                      {cluster.environment && (
                        <span className="text-xs text-gray-500">
                          ({ENVIRONMENT_LABELS[cluster.environment] ?? cluster.environment})
                        </span>
                      )}
                      <Badge
                        className={`${(STATUS_CONFIG[cluster.status ?? "healthy"]).color} text-xs px-1.5 py-0 ml-1`}
                      >
                        {(STATUS_CONFIG[cluster.status ?? "healthy"]).label}
                      </Badge>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={levelsToSelectValue(textLogLevels)}
              onValueChange={handleLevelChange}
              disabled={!selectedClusterId}
            >
              <SelectTrigger className="w-36">
                <SelectValue placeholder="All Levels" />
              </SelectTrigger>
              <SelectContent>
                {LEVEL_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Input
              placeholder="Component..."
              value={textLogComponent}
              onChange={(e) => setTextLogComponent(e.target.value)}
              className="w-40"
              disabled={!selectedClusterId}
            />

            <div className="relative flex-1 min-w-40">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Search message..."
                value={textLogSearch}
                onChange={(e) => setTextLogSearch(e.target.value)}
                className="pl-10"
                disabled={!selectedClusterId}
              />
            </div>

            <div className="ml-auto">
              <DashboardTimeRangePicker
                value={textLogTimeRange}
                timezone={timezone}
                onChange={setTextLogTimeRange}
                onRefresh={() => fetchTextLogs({ forceRefresh: true })}
                refreshing={textLogLoading}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Content */}
      {!selectedClusterId ? (
        <Card>
          <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
            <div className="flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800/60 mb-5">
              <Server className="w-8 h-8 text-gray-400 dark:text-gray-500" />
            </div>
            <p className="text-gray-600 dark:text-gray-400">Select a Cluster</p>
            <p className="text-sm text-gray-500 dark:text-gray-500 mt-1">
              Select a cluster from the dropdown above to view server logs
            </p>
          </div>
        </Card>
      ) : textLogLoading && textLogTotal === 0 && textLogs.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
            <PanelLoader />
            <p className="text-gray-500 dark:text-gray-400 text-sm">Loading…</p>
          </div>
        </Card>
      ) : textLogError ? (
        <Card className="border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950">
          <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
            <AlertCircle className="w-8 h-8 mx-auto text-red-500 mb-2" />
            <p className="text-red-700 dark:text-red-400 text-sm mb-3">{textLogError}</p>
            <Button variant="outline" size="sm" onClick={() => fetchTextLogs({ forceRefresh: true })}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Retry
            </Button>
          </div>
        </Card>
      ) : (
        <Card className="relative overflow-hidden">
          <ChartLoadingBar loading={textLogLoading && textLogs.length > 0} showDelayMs={0} />
          <CardHeader>
            <CardTitle className="text-base dark:text-white">
              Server Log ({textLogTotal.toLocaleString()} entries)
            </CardTitle>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              ClickHouse server text log (system.text_log)
            </p>
          </CardHeader>
          <CardContent>
            <div className={cn("transition-opacity duration-200", textLogLoading && textLogs.length > 0 && "opacity-45")}>
              <DataTable
                columns={columns}
                data={textLogs}
                pageCount={totalPages}
                pageIndex={textLogPage - 1}
                pageSize={textLogPageSize}
                onPageChange={setTextLogPage}
                onPageSizeChange={(size) => {
                  setTextLogPageSize(size);
                  setTextLogPage(1);
                }}
                emptyMessage="No logs."
                onRowClick={(row) => {
                  const index = textLogs.indexOf(row);
                  setSelectedLog(row);
                  setSelectedRowIndex(index >= 0 ? index : null);
                }}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Detail modal */}
      <LogDetailPanel
        log={selectedLog}
        rowIndex={selectedRowIndex}
        onClose={() => {
          setSelectedLog(null);
          setSelectedRowIndex(null);
        }}
      />
    </div>
  );
}
