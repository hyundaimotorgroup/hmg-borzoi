"use client";

import { useMemo, useState, useRef, useEffect } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { Search, RefreshCw, XOctagon, AlertCircle, Server, Copy, Check } from "lucide-react";

import { PanelLoader } from "@/components/ui/loading-spinner";
import { toast } from "sonner";
import { writeTextSafe } from "@/lib/utils/clipboard";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DashboardTimeRangePicker } from "@/components/cluster-detail/shared/components/DashboardTimeRangePicker";
import { type DashboardTimeRange } from "@/lib/metrics/timeseries-range";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { useSettings } from "@/contexts/SettingsContext";
import { formatDateTimeWithTimezone } from "@/lib/utils/time-formatter";

import type { LogCluster, ExecutionError } from "../types";
import { STATUS_CONFIG, ENVIRONMENT_LABELS } from "../../ch-audit/utils";

type Props = {
  clusters: LogCluster[];
  selectedClusterId: string;
  onClusterChange: (val: string) => void;
  errorsSearch: string;
  setErrorsSearch: (val: string) => void;
  errorsLoading: boolean;
  errorsError: string | null;
  executionErrors: ExecutionError[];
  filteredExecutionErrors: ExecutionError[];
  errorsTimeRange: DashboardTimeRange;
  setErrorsTimeRange: (val: DashboardTimeRange) => void;
  fetchExecutionErrors: (opts?: { forceRefresh?: boolean } | string) => void;
};

export function ExecutionErrorsTab({
  clusters,
  selectedClusterId,
  onClusterChange,
  errorsSearch,
  setErrorsSearch,
  errorsLoading,
  errorsError,
  executionErrors,
  filteredExecutionErrors,
  errorsTimeRange,
  setErrorsTimeRange,
  fetchExecutionErrors,
}: Props) {
  const { generalSettings } = useSettings();
  const timezone = generalSettings.timezone || "UTC";

  const [selectedMessage, setSelectedMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); }, []);

  async function handleCopy() {
    if (!selectedMessage) return;
    const ok = await writeTextSafe(selectedMessage);
    if (ok) {
      toast.success("Copied to clipboard.");
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setCopied(true);
      timeoutRef.current = setTimeout(() => setCopied(false), 2000);
    } else {
      toast.error("Failed to copy to clipboard.");
    }
  }

  const columns = useMemo<ColumnDef<ExecutionError>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Name",
        size: 160,
        meta: { truncate: false as const },
        cell: ({ getValue }) => (
          <Badge variant="outline" className="font-mono text-xs">
            {getValue<string>()}
          </Badge>
        ),
      },
      {
        accessorKey: "code",
        header: "Code",
        size: 56,
        meta: { align: "right" as const, truncate: false as const },
        cell: ({ getValue }) => (
          <Badge variant="secondary" className="font-mono">
            {getValue<number>()}
          </Badge>
        ),
      },
      {
        accessorKey: "value",
        header: "Count",
        size: 64,
        meta: { align: "right" as const, truncate: false as const },
        cell: ({ getValue }) => (
          <Badge variant="secondary" className="font-mono">
            {getValue<number>().toLocaleString()}
          </Badge>
        ),
      },
      {
        accessorKey: "remote",
        header: "Remote",
        size: 64,
        meta: { truncate: false as const },
        cell: ({ getValue }) =>
          getValue<boolean>() ? (
            <Badge variant="outline" className="text-orange-600">Remote</Badge>
          ) : (
            <Badge variant="secondary" className="text-gray-500">Local</Badge>
          ),
      },
      {
        accessorKey: "lastErrorTime",
        header: "Last Error Time",
        size: 120,
        cell: ({ getValue }) => {
          const val = getValue<string>();
          return val ? formatDateTimeWithTimezone(val, timezone) : "-";
        },
      },
      {
        accessorKey: "lastErrorMessage",
        header: "Last Error Message",
        size: 600,
        cell: ({ getValue }) => {
          const msg = getValue<string>();
          return (
            <button
              className="w-full text-left font-mono text-xs text-gray-700 dark:text-gray-300 truncate hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer"
              title="Click to view the full message"
              onClick={(e) => {
                e.stopPropagation();
                setSelectedMessage(msg);
              }}
            >
              {msg}
            </button>
          );
        },
      },
    ],
    [timezone]
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <Select value={selectedClusterId} onValueChange={onClusterChange}>
              <SelectTrigger className="w-52">
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
                      <Badge className={`${(STATUS_CONFIG[cluster.status ?? "healthy"]).color} text-xs px-1.5 py-0 ml-1`}>
                        {(STATUS_CONFIG[cluster.status ?? "healthy"]).label}
                      </Badge>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Search error names, messages..."
                value={errorsSearch}
                onChange={(e) => setErrorsSearch(e.target.value)}
                className="pl-10 w-full"
                disabled={!selectedClusterId}
              />
            </div>
            <div className="ml-auto">
              <DashboardTimeRangePicker
                value={errorsTimeRange}
                timezone={timezone}
                onChange={setErrorsTimeRange}
                onRefresh={() => fetchExecutionErrors({ forceRefresh: true })}
                refreshing={errorsLoading}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {!selectedClusterId ? (
        <Card>
          <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
            <div className="flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800/60 mb-5">
              <XOctagon className="w-8 h-8 text-gray-400 dark:text-gray-500" />
            </div>
            <p className="text-gray-600 dark:text-gray-400">Select a Cluster</p>
            <p className="text-sm text-gray-500 dark:text-gray-500 mt-1">
              Select a cluster from the dropdown above to view query execution errors
            </p>
          </div>
        </Card>
      ) : errorsLoading ? (
        <Card>
          <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
            <PanelLoader />
            <p className="text-gray-500 dark:text-gray-400 text-sm">Loading…</p>
          </div>
        </Card>
      ) : errorsError ? (
        <Card className="border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950">
          <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
            <AlertCircle className="w-8 h-8 mx-auto text-red-500 mb-2" />
            <p className="text-red-700 dark:text-red-400 text-sm mb-3">{errorsError}</p>
            <Button variant="outline" size="sm" onClick={() => fetchExecutionErrors({ forceRefresh: true })}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Retry
            </Button>
          </div>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base dark:text-white">
              Server Execution Errors ({filteredExecutionErrors.length})
            </CardTitle>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Cumulative error list from the server (based on system.errors)
            </p>
          </CardHeader>
          <CardContent>
            <DataTable
              columns={columns}
              data={filteredExecutionErrors}
              emptyMessage={
                executionErrors.length === 0
                  ? "No errors."
                  : "No results found."
              }
            />
          </CardContent>
        </Card>
      )}

 {/* Last Error Message */}
      <Dialog open={selectedMessage !== null} onOpenChange={(open) => { if (!open) { setSelectedMessage(null); setCopied(false); } }}>
        <DialogContent
          className="w-[90vw] !p-0 !gap-0 overflow-hidden flex flex-col"
          style={{ maxWidth: "720px", maxHeight: "70vh" }}
        >
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-slate-700 flex-shrink-0">
            <DialogTitle className="text-sm">Last Error Message</DialogTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleCopy()}
              className="h-7 text-xs px-2 gap-1 mr-6"
            >
              {copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
              {copied ? "Copied!" : "Copy"}
            </Button>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-6 py-4">
            <div className="overflow-x-auto">
              <pre className="text-sm font-mono text-gray-900 dark:text-gray-100 whitespace-pre m-0">
                {selectedMessage ?? ""}
              </pre>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
