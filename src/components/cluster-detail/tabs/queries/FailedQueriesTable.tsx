import React, { useState, useEffect, useMemo, useCallback } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, Copy, Check, ChevronDown, ChevronUp, X } from "lucide-react";
import { PanelLoader } from "@/components/ui/loading-spinner";
import { Badge } from "@/components/ui/badge";
import { ChartInfo } from "@/components/ChartInfo";
import { QueryTextCell } from "@/components/query/QueryTextCell";
import { writeTextSafe } from "@/lib/utils/clipboard";
import { formatDateTimeWithTimezone } from "@/lib/utils/time-formatter";
import type { FailedQuery } from "../../hooks/useQueriesData";
import { ChartLoadingBar, useLoadingBarVisibilityState } from "@/components/cluster-detail/shared/charts/ChartLoadingBar";
import type { NodeNameResolver } from "@/components/cluster-detail/shared/lib/nodeHost";
import { getNodeLabelFromHost } from "@/components/cluster-detail/shared/lib/nodeHost";
import { DataTable, FilterTh } from "@/components/ui/data-table";

interface FailedQueriesTableProps {
  failedQueries: FailedQuery[];
  loadingFailed: boolean;
  timezone: string;
  selectedNode?: string;
  timeRangeLabel: string;
  nodeNameResolver?: NodeNameResolver;
  chartQuery?: string;
}

function CopyButton({ text, field, copiedField, errorField, onCopy }: {
  text: string;
  field: string;
  copiedField: string | null;
  errorField: string | null;
  onCopy: (text: string, field: string) => void;
}) {
  const copied = copiedField === field;
  const failed = errorField === field;
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onCopy(text, field); }}
      className="flex items-center gap-1 px-1.5 py-0.5 rounded text-xs text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors flex-shrink-0"
    >
      {copied ? (
        <Check className="w-3 h-3 text-green-500" />
      ) : failed ? (
        <X className="w-3 h-3 text-red-500" />
      ) : (
        <Copy className="w-3 h-3" />
      )}
      {copied ? "Copied!" : failed ? "Copy failed" : "Copy"}
    </button>
  );
}

export function FailedQueriesTable({ failedQueries, loadingFailed, timezone, selectedNode, timeRangeLabel, nodeNameResolver, chartQuery }: FailedQueriesTableProps) {
  const { showLoadingState, handleLoadingBarVisibilityChange } = useLoadingBarVisibilityState(loadingFailed);
  const [expandedException, setExpandedException] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [copyErrorField, setCopyErrorField] = useState<string | null>(null);
  const [filterUser, setFilterUser] = useState("all");
  const [filterNode, setFilterNode] = useState("all");

  const mapNodeName = useCallback(
    (hostname?: string) => nodeNameResolver?.(hostname) || getNodeLabelFromHost(hostname),
    [nodeNameResolver]
  );

  const users = useMemo(() => Array.from(new Set(failedQueries.map((q) => q.user))).sort((a, b) => a.localeCompare(b)), [failedQueries]);
  const nodes = useMemo(() => Array.from(new Set(failedQueries.map((q) => mapNodeName(q.hostname)))).sort((a, b) => a.localeCompare(b)), [failedQueries, mapNodeName]);

  const filtered = useMemo(() => failedQueries
    .filter((q) => filterNode === "all" || mapNodeName(q.hostname) === filterNode)
    .filter((q) => filterUser === "all" || q.user === filterUser),
    [failedQueries, filterNode, filterUser, mapNodeName]
  );

  const hasActiveFilter = filterUser !== "all" || filterNode !== "all";

  const onFilter = (setter: (v: string) => void, value: string) => {
    setter(value);
    setExpandedException(null);
  };

  useEffect(() => {
    setExpandedException(null);
  }, [failedQueries]);

  const toggleException = (id: string, e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    setExpandedException(prev => prev === id ? null : id);
  };

  const copyToClipboard = async (text: string, field: string) => {
    if (!text) return;
    const didCopy = await writeTextSafe(text);
    if (didCopy) {
      setCopiedField(field);
      setCopyErrorField(null);
      setTimeout(() => setCopiedField(null), 2000);
      return;
    }
    setCopyErrorField(field);
    setCopiedField(null);
    setTimeout(() => setCopyErrorField(null), 2000);
  };

  const columns = useMemo<ColumnDef<FailedQuery>[]>(() => [
    {
      accessorKey: "event_time",
      header: "Time",
        size: 120,
        cell: ({ row }) => (
          <span className="text-gray-600 dark:text-gray-400 overflow-hidden whitespace-nowrap text-ellipsis block">
          {formatDateTimeWithTimezone(row.original.event_time, timezone)}
          </span>
        ),
      },
    {
      accessorKey: "hostname",
      size: 120,
      header: () => (
        <FilterTh
          label="Node"
          value={filterNode}
          options={nodes}
          onChange={(v) => onFilter(setFilterNode, v)}
        />
      ),
      cell: ({ row }) => (
        <span className="text-gray-600 dark:text-gray-400 overflow-hidden whitespace-nowrap text-ellipsis block">
          {mapNodeName(row.original.hostname)}
        </span>
      ),
    },
    {
      accessorKey: "user",
      size: 80,
      header: () => (
        <FilterTh
          label="User"
          value={filterUser}
          options={users}
          onChange={(v) => onFilter(setFilterUser, v)}
        />
      ),
      cell: ({ row }) => (
        <span className="text-gray-600 dark:text-gray-400 overflow-hidden whitespace-nowrap text-ellipsis block">
          {row.original.user}
        </span>
      ),
    },
    {
      accessorKey: "query",
      header: "Query",
      size: 300,
      meta: { truncate: false as const },
      cell: ({ row }) => (
        <QueryTextCell
          query={row.original.query}
          queryId={row.original.query_id}
          wrapperClassName="items-start"
          triggerClassName="text-gray-700 dark:text-gray-300"
          triggerTitle={row.original.query}
        />
      ),
    },
    {
      accessorKey: "exception",
      header: "Exception",
      size: 300,
      meta: { truncate: false as const },
      cell: ({ row }) => {
        const q = row.original;
        const eExp = expandedException === q.query_id;
        return (
          <div
            role="button"
            tabIndex={0}
            className={`cursor-pointer select-none transition-colors ${eExp ? "bg-red-50 dark:bg-red-900/20" : ""}`}
            onClick={(e) => toggleException(q.query_id, e)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                toggleException(q.query_id, e);
              }
            }}
          >
            <div className="overflow-hidden whitespace-nowrap text-ellipsis flex items-center gap-1">
              <span className={`flex-1 ${eExp ? "text-red-700 dark:text-red-300" : "text-red-600 dark:text-red-400"} overflow-hidden whitespace-nowrap text-ellipsis`}>
                {q.exception}
              </span>
              {eExp
                ? <ChevronUp className="w-3 h-3 flex-shrink-0 text-red-500" />
                : <ChevronDown className="w-3 h-3 flex-shrink-0 text-red-400/60" />
              }
            </div>
            {eExp && (
              <div className="mt-2 overflow-hidden">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs uppercase tracking-wide text-red-500 dark:text-red-400">Exception</span>
                  <CopyButton text={q.exception} field={`${q.query_id}-exception`} copiedField={copiedField} errorField={copyErrorField} onCopy={copyToClipboard} />
                </div>
                <pre className="text-xs rounded p-2 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 font-mono leading-relaxed" style={{ whiteSpace: "pre-wrap", wordBreak: "break-all", overflowWrap: "break-word" }}>
                  {q.exception}
                </pre>
              </div>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: "readable_memory_usage",
      header: "Memory",
      size: 80,
      meta: { align: "right" as const },
      cell: ({ row }) => (
        <span className="text-gray-600 dark:text-gray-400">
          {row.original.readable_memory_usage}
        </span>
      ),
    },
    {
      accessorKey: "query_duration_ms",
      header: "Duration",
      size: 80,
      meta: { align: "right" as const },
      cell: ({ row }) => (
        <span className="text-gray-600 dark:text-gray-400">
          {Math.round(row.original.query_duration_ms)} ms
        </span>
      ),
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [filterNode, filterUser, nodes, users, expandedException, copiedField, copyErrorField, timezone, nodeNameResolver]);

  return (
    <Card className="relative overflow-hidden bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-600">
      <ChartLoadingBar loading={loadingFailed} showDelayMs={0} onVisibilityChange={handleLoadingBarVisibilityChange} />
      <CardHeader className="pb-0 pt-2 px-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm text-gray-800 dark:text-white flex items-center gap-2 flex-wrap">
            <Activity className="w-4 h-4 text-red-600 dark:text-red-500" />
            Failed Queries
            <ChartInfo
              title="Failed Queries"
              description=""
              yAxisLabel="Query list"
              yAxisDescription="type IN ('ExceptionBeforeStart', 'ExceptionWhileProcessing') AND initial_query_id = query_id → shows the latest 100 failed top-level queries per user within the selected time range (sub-queries excluded)"
              aggregation="sum"
              query={chartQuery}
            />
            {selectedNode && selectedNode !== "all" ? (
              <Badge variant="secondary" className="text-xs bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300">
                Node: {selectedNode}
              </Badge>
            ) : (
              <Badge variant="secondary" className="text-xs bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                Cluster-wide
              </Badge>
            )}
            <Badge variant="secondary" className="text-xs bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400 font-normal">
              {timeRangeLabel}
            </Badge>
          </CardTitle>
          <div className="flex items-center gap-2">
            {hasActiveFilter && (
              <button
                onClick={() => { setFilterUser("all"); setFilterNode("all"); setExpandedException(null); }}
                className="text-xs text-blue-500 hover:text-blue-700 dark:text-blue-400 underline"
              >
                Clear filters
              </button>
            )}
            <Badge variant="secondary" className="text-xs bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300">
              {filtered.length}{hasActiveFilter ? ` / ${failedQueries.length}` : ""} queries
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-3 pb-3 pt-2">
        {showLoadingState ? (
          <PanelLoader label="Loading failed queries..." />
        ) : (
          <DataTable
            columns={columns}
            data={filtered}
            isLoading={false}
            maxHeight={400}
            emptyMessage={hasActiveFilter ? "No failed queries match the selected filters" : "No failed queries in the selected time range"}
          />
        )}
      </CardContent>
    </Card>
  );
}
