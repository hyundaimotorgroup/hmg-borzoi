"use client";

import { useState } from "react";
import { RefreshCw, AlertCircle, Server, AlertOctagon, CheckCircle2, ChevronDown, ChevronRight } from "lucide-react";

import { PanelLoader } from "@/components/ui/loading-spinner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useSettings } from "@/contexts/SettingsContext";
import { formatDateTimeWithTimezone } from "@/lib/utils/time-formatter";
import { DashboardTimeRangePicker } from "@/components/cluster-detail/shared/components/DashboardTimeRangePicker";
import { type DashboardTimeRange } from "@/lib/metrics/timeseries-range";
import type { LogCluster, CrashLog } from "../types";
import { STATUS_CONFIG, ENVIRONMENT_LABELS } from "../../ch-audit/utils";

const SIGNAL_NAMES: Record<number, string> = {
  4: "SIGILL",
  6: "SIGABRT",
  7: "SIGBUS",
  8: "SIGFPE",
  11: "SIGSEGV",
  13: "SIGPIPE",
  15: "SIGTERM",
};

type Props = {
  clusters: LogCluster[];
  selectedClusterId: string;
  onClusterChange: (val: string) => void;
  crashLoading: boolean;
  crashError: string | null;
  crashLogs: CrashLog[];
  crashTimeRange: DashboardTimeRange;
  setCrashTimeRange: (val: DashboardTimeRange) => void;
  fetchCrashLogs: (opts?: { forceRefresh?: boolean } | string) => void;
};

export function CrashLogTab({
  clusters,
  selectedClusterId,
  onClusterChange,
  crashLoading,
  crashError,
  crashLogs,
  crashTimeRange,
  setCrashTimeRange,
  fetchCrashLogs,
}: Props) {
  const { generalSettings } = useSettings();
  const timezone = generalSettings.timezone || "UTC";

  const [expandedSet, setExpandedSet] = useState<Set<number>>(new Set());

  function toggleExpanded(index: number) {
    setExpandedSet((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }

  return (
    <div className="space-y-6">
      {/* Filter card */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
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
          <div className="ml-auto">
            <DashboardTimeRangePicker
              value={crashTimeRange}
              timezone={timezone}
              onChange={setCrashTimeRange}
              onRefresh={() => fetchCrashLogs({ forceRefresh: true })}
              refreshing={crashLoading}
            />
          </div>
          </div>
        </CardContent>
      </Card>

      {/* Body states */}
      {!selectedClusterId ? (
        <Card>
          <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
            <div className="flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800/60 mb-5">
              <AlertOctagon className="w-8 h-8 text-gray-400 dark:text-gray-500" />
            </div>
            <p className="text-gray-600 dark:text-gray-400">Select a Cluster</p>
            <p className="text-sm text-gray-500 dark:text-gray-500 mt-1">
              Select a cluster from the dropdown above to view crash logs
            </p>
          </div>
        </Card>
      ) : crashLoading ? (
        <Card>
          <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
            <PanelLoader />
            <p className="text-gray-500 dark:text-gray-400 text-sm">Loading…</p>
          </div>
        </Card>
      ) : crashError ? (
        <Card className="border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950">
          <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
            <AlertCircle className="w-8 h-8 mx-auto text-red-500 mb-2" />
            <p className="text-red-700 dark:text-red-400 text-sm mb-3">{crashError}</p>
            <Button variant="outline" size="sm" onClick={() => fetchCrashLogs({ forceRefresh: true })}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Retry
            </Button>
          </div>
        </Card>
      ) : crashLogs.length === 0 ? (
        /* No-crash green success card */
        <Card className="border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950">
          <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
            <CheckCircle2 className="w-16 h-16 mx-auto text-green-500 mb-4" />
            <p className="text-green-800 dark:text-green-300 text-lg">No Crash Logs Found</p>
            <p className="text-sm text-green-700 dark:text-green-400 mt-1">The server is operating normally.</p>
          </div>
        </Card>
      ) : (
        /* Crash log list */
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Total <span className="text-red-600 dark:text-red-400">{crashLogs.length}</span> crash record(s)
            </p>
            <Button variant="outline" size="sm" onClick={() => fetchCrashLogs({ forceRefresh: true })}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
          </div>

          {crashLogs.map((log, index) => {
            const signalName = SIGNAL_NAMES[log.signal];
            const signalLabel = signalName ? `${log.signal} (${signalName})` : String(log.signal);
            const isExpanded = expandedSet.has(index);

            return (
              <Card key={index} className="border-l-4 border-l-red-500">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <AlertOctagon className="w-5 h-5 text-red-500 flex-shrink-0" />
                    <span className="text-red-700 dark:text-red-400">Crash</span>
                    <span className="text-gray-500 dark:text-gray-400 font-normal text-sm">
                      — {log.eventTime ? formatDateTimeWithTimezone(log.eventTime, timezone) : "-"}
                    </span>
                  </CardTitle>
                </CardHeader>

                <CardContent className="space-y-3 pt-0">
                  {/* Meta row */}
                  <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-gray-700 dark:text-gray-300">
                    <span>
                      <span className="text-gray-500 dark:text-gray-400">Signal: </span>
                      <Badge variant="destructive" className="font-mono text-xs">
                        {signalLabel}
                      </Badge>
                    </span>
                    <span>
                      <span className="text-gray-500 dark:text-gray-400">Thread: </span>
                      <span className="font-mono">{log.threadId}</span>
                    </span>
                    <span>
                      <span className="text-gray-500 dark:text-gray-400">Version: </span>
                      <span className="font-mono">{log.version || "-"}</span>
                    </span>
                  </div>

                  {/* Query ID */}
                  <div className="text-sm text-gray-700 dark:text-gray-300">
                    <span className="text-gray-500 dark:text-gray-400">Query ID: </span>
                    <span className="font-mono">{log.queryId || "-"}</span>
                  </div>

                  {/* Build ID */}
                  <div className="text-sm text-gray-700 dark:text-gray-300">
                    <span className="text-gray-500 dark:text-gray-400">Build: </span>
                    <span className="font-mono text-xs break-all">{log.buildId || "-"}</span>
                  </div>

                  {/* Stack trace — collapsible */}
                  <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
                    <button
                      type="button"
                      onClick={() => toggleExpanded(index)}
                      className="flex items-center gap-1 text-sm text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
                    >
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4" />
                      ) : (
                        <ChevronRight className="w-4 h-4" />
                      )}
                      Stack Trace
                    </button>

                    {isExpanded && (
                      <pre className="mt-2 overflow-auto max-h-96 text-xs font-mono bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded p-3 text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-words">
                        {log.traceFull || "(empty)"}
                      </pre>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
