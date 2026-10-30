import { useMemo } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GitMerge } from "lucide-react";
import { ChartInfo } from "@/components/ChartInfo";
import { DataTable } from "@/components/ui/data-table";
import type { ActiveMergeItem } from "../../hooks/useOperationsData";
import { ChartLoadingBar, useLoadingBarVisibilityState } from "@/components/cluster-detail/shared/charts/ChartLoadingBar";
import { PanelLoader } from "@/components/ui/loading-spinner";
import type { NodeNameResolver } from "@/components/cluster-detail/shared/lib/nodeHost";

interface ActiveMergesPanelProps {
  data: ActiveMergeItem[];
  selectedNodes: string[];
  loading: boolean;
  nodeNameResolver?: NodeNameResolver;
}

export function ActiveMergesPanel({ data, selectedNodes, loading, nodeNameResolver }: ActiveMergesPanelProps) {
  const { showLoadingState, handleLoadingBarVisibilityChange } = useLoadingBarVisibilityState(loading);

  const columns = useMemo<ColumnDef<ActiveMergeItem>[]>(() => [
    {
      accessorKey: "hostname",
      header: "Node",
      size: 120,
      cell: ({ row }) => (
        <span className="text-xs dark:text-gray-300">
          {nodeNameResolver ? nodeNameResolver(row.original.hostname ?? "") : (row.original.hostname ?? "—")}
        </span>
      ),
    },
    {
      accessorKey: "shard_num",
      header: "Shard",
      size: 55,
      meta: { align: "center" as const },
      cell: ({ row }) => (
        <span className="text-xs text-blue-600 dark:text-blue-400">{row.original.shard_num ?? "—"}</span>
      ),
    },
    {
      accessorKey: "replica_num",
      header: "Rep",
      size: 45,
      meta: { align: "center" as const },
      cell: ({ row }) => (
        <span className="text-xs text-purple-600 dark:text-purple-400">{row.original.replica_num ?? "—"}</span>
      ),
    },
    {
      accessorKey: "database",
      header: "Database",
      size: 110,
      cell: ({ row }) => (
        <span className="text-xs text-blue-700 dark:text-blue-300">{row.original.database ?? "—"}</span>
      ),
    },
    {
      accessorKey: "table",
      header: "Table",
      size: 140,
      cell: ({ row }) => (
        <span className="text-xs text-gray-700 dark:text-gray-300">{row.original.table ?? "—"}</span>
      ),
    },
    {
      accessorKey: "is_mutation",
      header: "Type",
      size: 80,
      meta: { align: "center" as const },
      cell: ({ row }) => (
        row.original.is_mutation
          ? <Badge variant="outline" className="text-xs text-purple-700 dark:text-purple-300 border-purple-300 dark:border-purple-600">Mutation</Badge>
          : <Badge variant="outline" className="text-xs text-green-700 dark:text-green-300 border-green-300 dark:border-green-600">Merge</Badge>
      ),
    },
    {
      accessorKey: "progress_pct",
      header: "Progress",
      size: 100,
      meta: { align: "right" as const },
      cell: ({ row }) => {
        const pct = row.original.progress_pct ?? 0;
        return (
          <div className="flex items-center justify-end gap-1.5">
            <div className="w-16 h-1.5 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500 dark:bg-green-400 rounded-full transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-xs text-gray-600 dark:text-gray-400 w-10 text-right">{pct.toFixed(1)}%</span>
          </div>
        );
      },
    },
    {
      accessorKey: "elapsed_sec",
      header: "Elapsed",
      size: 85,
      meta: { align: "right" as const },
      cell: ({ row }) => {
        const sec = row.original.elapsed_sec ?? 0;
        const warn = sec > 300;
        const label = sec >= 60 ? `${(sec / 60).toFixed(1)}m` : `${sec}s`;
        return (
          <span className={`text-xs ${warn ? "text-orange-600 dark:text-orange-400 font-medium" : "text-gray-600 dark:text-gray-400"}`}>
            {label}
          </span>
        );
      },
    },
    {
      accessorKey: "num_parts",
      header: "Parts",
      size: 65,
      meta: { align: "right" as const },
      cell: ({ row }) => (
        <span className="text-xs text-gray-500 dark:text-gray-400">{row.original.num_parts ?? 0}</span>
      ),
    },
    {
      accessorKey: "rows_per_sec",
      header: "Rows/s",
      size: 90,
      meta: { align: "right" as const },
      cell: ({ row }) => (
        <span className="text-xs text-gray-600 dark:text-gray-400">
          {(row.original.rows_per_sec ?? 0).toLocaleString()}
        </span>
      ),
    },
    {
      accessorKey: "bytes_read",
      header: "Read",
      size: 90,
      meta: { align: "right" as const },
      cell: ({ row }) => (
        <span className="text-xs text-gray-500 dark:text-gray-400">{row.original.bytes_read ?? "—"}</span>
      ),
    },
    {
      accessorKey: "memory",
      header: "Memory",
      size: 90,
      meta: { align: "right" as const },
      cell: ({ row }) => (
        <span className="text-xs text-gray-500 dark:text-gray-400">{row.original.memory ?? "—"}</span>
      ),
    },
  ], [nodeNameResolver]);

  const filtered = selectedNodes.length === 0
    ? data
    : data.filter((item) => {
        const label = nodeNameResolver ? nodeNameResolver(item.hostname ?? "") : (item.hostname ?? "").split(".")[0];
        return selectedNodes.includes(label);
      });

  return (
    <Card className="relative overflow-hidden bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <ChartLoadingBar loading={loading} showDelayMs={0} onVisibilityChange={handleLoadingBarVisibilityChange} />
      <CardHeader className="pb-1.5 pt-2 px-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm text-gray-800 dark:text-white flex items-center gap-2">
            <GitMerge className="w-4 h-4 text-green-600 dark:text-green-400" />
            Active Merges
            <ChartInfo
              title="Active Merges (system.merges)"
              description="Real-time list of currently running Merge and Mutation operations. Refreshed on each page reload."
              query={`SELECT
  hostName() AS hostname,
  database,
  table,
  round(elapsed, 1)        AS elapsed_sec,
  round(progress * 100, 1) AS progress_pct,
  num_parts,
  is_mutation,
  formatReadableSize(memory_usage)            AS memory,
  formatReadableSize(bytes_read_uncompressed) AS bytes_read,
  round(rows_written / nullIf(elapsed, 0), 0) AS rows_per_sec,
  result_part_name
FROM clusterAllReplicas(
  (SELECT cluster FROM system.clusters WHERE is_local = 1 LIMIT 1),
  system.merges
)
ORDER BY elapsed DESC
SETTINGS skip_unavailable_shards = 1`}
              yAxisLabel="Key columns"
              yAxisDescription={`Type: Merge (regular part merge) | Mutation (ALTER UPDATE/DELETE rewrite)\nElapsed > 5m (orange): investigate long-running merges\nProgress: 0–100% completion\nParts: number of source parts being merged\nRows/s: processing throughput`}
              aggregation="snapshot"
            />
          </CardTitle>
          {selectedNodes.length === 0 ? (
            <Badge variant="secondary" className="text-xs bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
              Cluster-wide
            </Badge>
          ) : (
            <Badge variant="secondary" className="text-xs bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300">
              Node: {selectedNodes.length === 1 ? selectedNodes[0] : selectedNodes.join(", ")}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {showLoadingState ? (
          <PanelLoader label="Loading active merges..." />
        ) : (
          <DataTable
            columns={columns}
            data={filtered}
            maxHeight={400}
            emptyMessage="No active merges (merge is idle or all caught up)"
          />
        )}
      </CardContent>
    </Card>
  );
}
