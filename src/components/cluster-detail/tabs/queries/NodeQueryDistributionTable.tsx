import { useState, useEffect, useMemo } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LayoutGrid, ChevronDown, ChevronRight } from "lucide-react";
import { PanelLoader } from "@/components/ui/loading-spinner";
import { Badge } from "@/components/ui/badge";
import { ChartInfo } from "@/components/ChartInfo";
import type { QueryDistributionRow } from "../../hooks/useQueriesData";
import { ChartLoadingBar, useLoadingBarVisibilityState } from "@/components/cluster-detail/shared/charts/ChartLoadingBar";
import type { NodeNameResolver } from "@/components/cluster-detail/shared/lib/nodeHost";
import { getNodeLabelFromHost } from "@/components/cluster-detail/shared/lib/nodeHost";
import { DataTable } from "@/components/ui/data-table";

interface NodeQueryDistributionTableProps {
  data: QueryDistributionRow[];
  loading: boolean;
  selectedNode?: string;
  timeRangeLabel: string;
  nodeNameResolver?: NodeNameResolver;
  chartQuery?: string;
}

interface NodeGroup {
  node: string;
  totalFinished: number;
  totalRunning: number;
  avgMs: number;
  rows: QueryDistributionRow[];
}

function groupByNode(data: QueryDistributionRow[], nodeNameResolver?: NodeNameResolver): NodeGroup[] {
  const map = new Map<string, NodeGroup>();

  data.forEach(row => {
    const shortNode = nodeNameResolver?.(row.node) || getNodeLabelFromHost(row.node);
    if (!map.has(shortNode)) {
      map.set(shortNode, { node: shortNode, totalFinished: 0, totalRunning: 0, avgMs: 0, rows: [] });
    }
    const group = map.get(shortNode)!;
    group.totalFinished += Number(row.query_count);
    group.totalRunning += Number(row.running_count);
    group.rows.push(row);
  });

  // avgMs: weighted average by row count
  map.forEach(group => {
    const total = group.rows.reduce((s, r) => s + Number(r.query_count) + Number(r.running_count), 0);
    group.avgMs = total > 0
      ? group.rows.reduce((s, r) => s + Number(r.avg_ms) * (Number(r.query_count) + Number(r.running_count)), 0) / total
      : 0;
  });

  return Array.from(map.values()).sort((a, b) => (b.totalFinished + b.totalRunning) - (a.totalFinished + a.totalRunning));
}

export function NodeQueryDistributionTable({
  data,
  loading,
  selectedNode,
  timeRangeLabel,
  nodeNameResolver,
  chartQuery,
}: NodeQueryDistributionTableProps) {
  const { showLoadingState, handleLoadingBarVisibilityChange } = useLoadingBarVisibilityState(loading);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => selectedNode && selectedNode !== "all"
    ? data.filter((r) => (nodeNameResolver?.(r.node) || getNodeLabelFromHost(r.node)) === selectedNode)
    : data,
    [data, selectedNode, nodeNameResolver]
  );

  const groups = useMemo(() => groupByNode(filtered, nodeNameResolver), [filtered, nodeNameResolver]);
  const totalRunning = useMemo(() => filtered.reduce((s, r) => s + Number(r.running_count), 0), [filtered]);

  const toggleNode = (node: string) => {
    setExpandedNodes(prev => {
      const next = new Set(prev);
      if (next.has(node)) {
        next.delete(node);
      } else {
        next.add(node);
      }
      return next;
    });
  };

  const allExpanded = groups.every(g => expandedNodes.has(g.node));
  const toggleAll = () => {
    setExpandedNodes(allExpanded ? new Set() : new Set(groups.map(g => g.node)));
  };

  useEffect(() => {
    setExpandedNodes(new Set());
  }, [selectedNode, timeRangeLabel, groups]);

  const columns = useMemo<ColumnDef<NodeGroup>[]>(() => [
    {
      id: "node",
      size: 200,
      meta: { truncate: false as const },
      header: () => (
        <button onClick={toggleAll} className="flex items-center gap-1 hover:text-blue-600 dark:text-gray-300">
          {allExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          Node / User
        </button>
      ),
      cell: ({ row }) => {
        const group = row.original;
        const isExpanded = expandedNodes.has(group.node);
        return (
          <>
            <button
              className="flex items-center gap-1.5 w-full text-left"
              onClick={() => toggleNode(group.node)}
            >
              {isExpanded
                ? <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
                : <ChevronRight className="w-3.5 h-3.5 text-gray-500" />
              }
              <span className="text-xs text-gray-800 dark:text-gray-100">{group.node}</span>
              <span className="text-gray-400 font-normal text-xs">({group.rows.length} entries)</span>
            </button>
            {isExpanded && (
              <div className="mt-1 ml-5 space-y-0.5">
                {group.rows.map((row, i) => (
                  <div key={`${group.node}-user-${row.user}-${i}`} className="text-xs text-gray-700 dark:text-gray-300 py-0.5">
                    {row.user || <span className="text-gray-400">—</span>}
                  </div>
                ))}
              </div>
            )}
          </>
        );
      },
    },
    {
      id: "client",
      size: 160,
      meta: { truncate: false as const },
      header: "Client",
      cell: ({ row }) => {
        const group = row.original;
        const isExpanded = expandedNodes.has(group.node);
        return (
          <>
            <span className="block text-gray-500 dark:text-gray-400 text-xs">—</span>
            {isExpanded && (
              <div className="mt-1 space-y-0.5">
                {group.rows.map((subRow, i) => (
                  <div key={`${group.node}-client-${subRow.client_hostname}-${i}`} className="text-xs text-gray-500 dark:text-gray-400 py-0.5 truncate max-w-xs" title={subRow.client_hostname}>
                    {subRow.client_hostname || <span className="text-gray-400">—</span>}
                  </div>
                ))}
              </div>
            )}
          </>
        );
      },
    },
    {
      id: "finished",
      size: 100,
      meta: { align: "right" as const, truncate: false as const },
      header: "Finished",
      cell: ({ row }) => {
        const group = row.original;
        const isExpanded = expandedNodes.has(group.node);
        return (
          <>
            <span className="block text-right text-gray-700 dark:text-gray-200">
              {group.totalFinished.toLocaleString()}
            </span>
            {isExpanded && (
              <div className="mt-1 space-y-0.5">
                {group.rows.map((subRow, i) => (
                  <div key={`${group.node}-fin-${subRow.user}-${i}`} className="text-xs text-right text-gray-600 dark:text-gray-400 py-0.5">
                    {Number(subRow.query_count).toLocaleString()}
                  </div>
                ))}
              </div>
            )}
          </>
        );
      },
    },
    {
      id: "running",
      size: 100,
      meta: { align: "right" as const, truncate: false as const },
      header: "Running",
      cell: ({ row }) => {
        const group = row.original;
        const isExpanded = expandedNodes.has(group.node);
        const hasRunning = group.totalRunning > 0;
        return (
          <>
            <div className="text-right">
              {hasRunning ? (
                <span className="inline-flex items-center gap-1 text-green-600 dark:text-green-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse inline-block" />
                  {group.totalRunning}
                </span>
              ) : (
                <span className="text-gray-400 font-normal">0</span>
              )}
            </div>
            {isExpanded && (
              <div className="mt-1 space-y-0.5">
                {group.rows.map((subRow, i) => {
                  const isRunning = Number(subRow.running_count) > 0;
                  return (
                    <div key={`${group.node}-run-${subRow.user}-${i}`} className="text-xs text-right py-0.5">
                      {isRunning ? (
                        <span className="inline-flex items-center gap-1 text-green-600 dark:text-green-400">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse inline-block" />
                          {Number(subRow.running_count)}
                        </span>
                      ) : (
                        <span className="text-gray-400">0</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        );
      },
    },
    {
      id: "avgMs",
      size: 120,
      meta: { align: "right" as const, truncate: false as const },
      header: "Avg ms",
      cell: ({ row }) => {
        const group = row.original;
        const isExpanded = expandedNodes.has(group.node);
        return (
          <>
            <span className="block text-right text-gray-600 dark:text-gray-300">
              {group.avgMs.toLocaleString(undefined, { maximumFractionDigits: 1 })} ms
            </span>
            {isExpanded && (
              <div className="mt-1 space-y-0.5">
                {group.rows.map((subRow, i) => (
                  <div key={`${group.node}-avg-${subRow.user}-${i}`} className="text-xs text-right text-gray-500 dark:text-gray-400 py-0.5">
                    {Number(subRow.avg_ms).toLocaleString(undefined, { maximumFractionDigits: 1 })} ms
                  </div>
                ))}
              </div>
            )}
          </>
        );
      },
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [expandedNodes, allExpanded]);

  return (
    <Card className="relative overflow-hidden bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-600">
      <ChartLoadingBar loading={loading} showDelayMs={0} onVisibilityChange={handleLoadingBarVisibilityChange} />
      <CardHeader className="pb-1.5 pt-2 px-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm text-gray-800 dark:text-white flex items-center gap-2">
            <LayoutGrid className="w-4 h-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
            Node / User / Client Query Distribution
            <ChartInfo
              title="Node / User / Client Query Distribution"
              description=""
              yAxisLabel="Query count"
              yAxisDescription="query_log (finished) UNION processes (running) — top-level queries only (initial_query_id = query_id)"
              aggregation="count"
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
              Finished ({timeRangeLabel})
            </Badge>
          </CardTitle>
          {totalRunning > 0 && (
            <Badge variant="secondary" className="text-xs bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300">
              {totalRunning} running
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="px-3 pb-3">
        {showLoadingState ? (
          <PanelLoader label="Loading..." />
        ) : (
          <DataTable
            columns={columns}
            data={groups}
            isLoading={false}
            emptyMessage="No query data in the selected time range"
          />
        )}
      </CardContent>
    </Card>
  );
}
