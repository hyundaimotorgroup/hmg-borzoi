"use client";

import { useMemo } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import {
  AlertCircle,
  RefreshCw,
  Server,
  Shield,
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
import type { LogCluster, SessionLog } from "../types";
import { STATUS_CONFIG, ENVIRONMENT_LABELS } from "../../ch-audit/utils";

// ─── Event type badge ─────────────────────────────────────────────────────────

const EVENT_TYPE_STYLES: Record<string, string> = {
  LoginSuccess: "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300",
  LoginFailure: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300",
  Logout: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
};

function EventTypeBadge({ type }: { type: string }) {
  const style = EVENT_TYPE_STYLES[type] ?? "bg-gray-100 text-gray-600";
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded text-xs ${style}`}>
      {type}
    </span>
  );
}

// ─── Message builder ──────────────────────────────────────────────────────────

function buildMessage(log: SessionLog): string {
  if (log.type === "LoginFailure" && log.failureReason) {
    return log.failureReason;
  }
  const parts: string[] = [];
  if (log.authType) parts.push(`Auth: ${log.authType}`);
  if (log.clientAddress) parts.push(`Remote: ${log.clientAddress}`);
  if (log.clientName) parts.push(`Client: ${log.clientName}`);
  return parts.join(", ");
}

// ─── Event type select helper ────────────────────────────────────────────────

type EventTypeOption = "all" | "LoginSuccess" | "LoginFailure" | "Logout";

const EVENT_TYPE_OPTIONS: { value: EventTypeOption; label: string }[] = [
  { value: "all", label: "All Events" },
  { value: "LoginSuccess", label: "Login Success" },
  { value: "LoginFailure", label: "Login Failure" },
  { value: "Logout", label: "Logout" },
];

function typesToSelectValue(types: string[]): EventTypeOption {
  if (types.length === 0) return "all";
  if (types.length === 1) return types[0] as EventTypeOption;
  return "all";
}

// ─── Props ────────────────────────────────────────────────────────────────────

type Props = {
  clusters: LogCluster[];
  selectedClusterId: string;
  onClusterChange: (val: string) => void;
  sessionLogLoading: boolean;
  sessionLogError: string | null;
  sessionLogs: SessionLog[];
  sessionLogTotal: number;
  sessionLogPage: number;
  setSessionLogPage: (val: number) => void;
  sessionLogPageSize: number;
  setSessionLogPageSize: (val: number) => void;
  sessionLogUser: string;
  setSessionLogUser: (val: string) => void;
  sessionLogTypes: string[];
  setSessionLogTypes: (val: string[]) => void;
  sessionLogTimeRange: DashboardTimeRange;
  setSessionLogTimeRange: (val: DashboardTimeRange) => void;
  fetchSessionLogs: (opts?: { forceRefresh?: boolean } | string) => void;
};

// ─── Main component ───────────────────────────────────────────────────────────

export function SessionLogTab({
  clusters,
  selectedClusterId,
  onClusterChange,
  sessionLogLoading,
  sessionLogError,
  sessionLogs,
  sessionLogTotal,
  sessionLogPage,
  setSessionLogPage,
  sessionLogPageSize,
  setSessionLogPageSize,
  sessionLogUser,
  setSessionLogUser,
  sessionLogTypes,
  setSessionLogTypes,
  sessionLogTimeRange,
  setSessionLogTimeRange,
  fetchSessionLogs,
}: Props) {
  const { generalSettings } = useSettings();
  const timezone = generalSettings.timezone || "UTC";

  // ── Computed values ──────────────────────────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(sessionLogTotal / sessionLogPageSize));

  // ── Handlers ─────────────────────────────────────────────────────────────────
  const handleEventTypeChange = (value: string) => {
    setSessionLogTypes(value === "all" ? [] : [value]);
  };

  // ── Columns ──────────────────────────────────────────────────────────────────
  const columns = useMemo<ColumnDef<SessionLog>[]>(
    () => [
      {
        accessorKey: "eventTime",
        header: "Time",
        size: 148,
        cell: ({ getValue }) => (
          <span className="font-mono text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap">
            {formatDateTimeWithTimezone(getValue<string>(), timezone)}
          </span>
        ),
      },
      {
        accessorKey: "type",
        header: "Event",
        size: 110,
        meta: { truncate: false as const },
        cell: ({ getValue }) => <EventTypeBadge type={getValue<string>()} />,
      },
      {
        accessorKey: "user",
        header: "User",
        size: 100,
        cell: ({ getValue }) => (
          <span
            className="text-sm text-gray-900 dark:text-gray-100 truncate block"
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
        id: "message",
        header: "Message",
        size: 400,
        cell: ({ row }) => {
          const msg = buildMessage(row.original);
          return (
            <div
              className="text-xs text-gray-600 dark:text-gray-400 truncate"
              title={msg}
            >
              {msg}
            </div>
          );
        },
      },
    ],
    [timezone]
  );

  // ── Render ────────────────────────────────────────────────────────────────────
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
              value={typesToSelectValue(sessionLogTypes)}
              onValueChange={handleEventTypeChange}
              disabled={!selectedClusterId}
            >
              <SelectTrigger className="w-36">
                <SelectValue placeholder="All Events" />
              </SelectTrigger>
              <SelectContent>
                {EVENT_TYPE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Input
              placeholder="Search user..."
              value={sessionLogUser}
              onChange={(e) => setSessionLogUser(e.target.value)}
              className="w-44"
              disabled={!selectedClusterId}
            />

            <div className="ml-auto">
              <DashboardTimeRangePicker
                value={sessionLogTimeRange}
                timezone={timezone}
                onChange={setSessionLogTimeRange}
                onRefresh={() => fetchSessionLogs({ forceRefresh: true })}
                refreshing={sessionLogLoading}
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
              <Shield className="w-8 h-8 text-gray-400 dark:text-gray-500" />
            </div>
            <p className="text-gray-600 dark:text-gray-400">Select a Cluster</p>
            <p className="text-sm text-gray-500 dark:text-gray-500 mt-1">
              Select a cluster from the dropdown above to view session logs
            </p>
          </div>
        </Card>
      ) : sessionLogLoading && sessionLogTotal === 0 && sessionLogs.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
            <PanelLoader />
            <p className="text-gray-500 dark:text-gray-400 text-sm">Loading…</p>
          </div>
        </Card>
      ) : sessionLogError ? (
        <Card className="border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950">
          <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
            <AlertCircle className="w-8 h-8 mx-auto text-red-500 mb-2" />
            <p className="text-red-700 dark:text-red-400 text-sm mb-3">{sessionLogError}</p>
            <Button variant="outline" size="sm" onClick={() => fetchSessionLogs({ forceRefresh: true })}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Retry
            </Button>
          </div>
        </Card>
      ) : (
        <Card className="relative overflow-hidden">
          <ChartLoadingBar loading={sessionLogLoading && sessionLogs.length > 0} showDelayMs={0} />
          <CardHeader>
            <CardTitle className="text-base dark:text-white">
              Session Logs ({sessionLogTotal.toLocaleString()} entries)
            </CardTitle>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              ClickHouse login/logout events (system.session_log)
            </p>
          </CardHeader>
          <CardContent>
            <div className={cn("transition-opacity duration-200", sessionLogLoading && sessionLogs.length > 0 && "opacity-45")}>
              <DataTable
                columns={columns}
                data={sessionLogs}
                pageCount={totalPages}
                pageIndex={sessionLogPage - 1}
                pageSize={sessionLogPageSize}
                onPageChange={setSessionLogPage}
                onPageSizeChange={(size) => {
                  setSessionLogPageSize(size);
                  setSessionLogPage(1);
                }}
                emptyMessage="No logs."
              />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
