import { useMemo } from "react";
import { Share2 } from "lucide-react";
import { type ColumnDef } from "@tanstack/react-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChartInfo } from "@/components/ChartInfo";
import { DataTable } from "@/components/ui/data-table";
import type { DistributionQueueItem } from "../../hooks/useOperationsData";
import { ChartLoadingBar, useLoadingBarVisibilityState } from "@/components/cluster-detail/shared/charts/ChartLoadingBar";
import { PanelLoader } from "@/components/ui/loading-spinner";
import type { NodeNameResolver } from "@/components/cluster-detail/shared/lib/nodeHost";

interface DistributionQueuePanelProps {
  data: DistributionQueueItem[];
  selectedNodes: string[];
  loading: boolean;
  nodeNameResolver?: NodeNameResolver;
}

export function DistributionQueuePanel({ data, selectedNodes, loading, nodeNameResolver }: DistributionQueuePanelProps) {
  const { showLoadingState, handleLoadingBarVisibilityChange } = useLoadingBarVisibilityState(loading);

  const columns = useMemo<ColumnDef<DistributionQueueItem>[]>(() => [
    {
      accessorKey: "hostname",
      header: "Node",
      size: 130,
      cell: ({ row }) => (
        <span className="text-gray-600 dark:text-gray-400 text-xs">
          {nodeNameResolver ? nodeNameResolver(row.original.hostname) : (row.original.hostname ?? "—")}
        </span>
      ),
    },
    {
      accessorKey: "shard_num",
      header: "Shard",
      size: 60,
      meta: { align: "center" as const },
      cell: ({ row }) => (
        <span className="text-xs text-blue-600 dark:text-blue-400">
          {row.original.shard_num ?? "—"}
        </span>
      ),
    },
    {
      accessorKey: "replica_num",
      header: "Replica",
      size: 65,
      meta: { align: "center" as const },
      cell: ({ row }) => (
        <span className="text-xs text-purple-600 dark:text-purple-400">
          {row.original.replica_num ?? "—"}
        </span>
      ),
    },
    {
      accessorKey: "database",
      header: "Database",
      size: 120,
      cell: ({ row }) => (
        <span className="text-gray-600 dark:text-gray-400">{row.original.database}</span>
      ),
    },
    {
      accessorKey: "table",
      header: "Table",
      size: 120,
      cell: ({ row }) => (
        <span className="dark:text-gray-300">{row.original.table}</span>
      ),
    },
    {
      accessorKey: "pending_files",
      header: "Pending",
      size: 90,
      meta: { align: "right" as const, truncate: false as const },
      cell: ({ row }) => (
        <div>
          <Badge variant={(row.original.pending_files ?? 0) > 50 ? "destructive" : "secondary"}>
            {row.original.pending_files ?? 0}
          </Badge>
        </div>
      ),
    },
    {
      accessorKey: "broken_files",
      header: "Broken",
      size: 90,
      meta: { align: "right" as const, truncate: false as const },
      cell: ({ row }) => (
        <div>
          {(row.original.broken_files ?? 0) > 0 ? (
            <Badge variant="destructive">{row.original.broken_files}</Badge>
          ) : (
            <span className="text-gray-400 dark:text-gray-500">0</span>
          )}
        </div>
      ),
    },
    {
      accessorKey: "bytes",
      header: "Bytes",
      size: 90,
      meta: { align: "right" as const },
      cell: ({ row }) => (
        <div className="text-gray-600 dark:text-gray-400">{row.original.bytes}</div>
      ),
    },
    {
      accessorKey: "oldest_age",
      header: "Oldest Age",
      size: 100,
      meta: { align: "right" as const, truncate: false as const },
      cell: ({ row }) => (
        <div>
          <Badge variant={parseInt(row.original.oldest_age || "0") > 20 ? "destructive" : "outline"}>
            {row.original.oldest_age}
          </Badge>
        </div>
      ),
    },
  ], [nodeNameResolver]);

  return (
    <Card className="relative overflow-hidden lg:col-span-2 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <ChartLoadingBar loading={loading} showDelayMs={0} onVisibilityChange={handleLoadingBarVisibilityChange} />
      <CardHeader className="pb-1.5 pt-2 px-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm text-gray-800 dark:text-white flex items-center gap-2">
            <Share2 className="w-4 h-4 text-orange-600 dark:text-orange-400" />
            Distribution Queue by Table
            <ChartInfo
              title="Distribution Queue by Table"
              description=""
              query={`SELECT
  hostName() AS hostname,
  database,
  table,
  sum(data_files) AS pending_files,
  sum(broken_data_files) AS broken_files,
  formatReadableSize(sum(data_compressed_bytes)) AS bytes,
  formatReadableTimeDelta(now() - minIf(last_exception_time, last_exception_time > toDateTime('1970-01-02 00:00:00')))
    AS oldest_age
FROM clusterAllReplicas(
  (SELECT cluster FROM system.clusters WHERE is_local = 1 LIMIT 1),
  system.distribution_queue
)
WHERE database NOT IN ('system', 'information_schema', 'INFORMATION_SCHEMA')
GROUP BY hostname, database, table
HAVING pending_files > 0 OR broken_files > 0
ORDER BY pending_files DESC
LIMIT 20
SETTINGS skip_unavailable_shards = 1`}
              yAxisLabel="Key columns"
              yAxisDescription="Pending: pending insert file count | Broken: files with errors | Bytes: total size of queued data | Oldest: age of the oldest pending file"
              aggregation="sum"
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
          <PanelLoader label="Loading distribution queue..." />
        ) : (
          <DataTable columns={columns} data={data} maxHeight={400} />
        )}
      </CardContent>
    </Card>
  );
}
