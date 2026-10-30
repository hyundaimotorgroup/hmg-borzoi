import { useMemo } from "react";
import { RefreshCw } from "lucide-react";
import { type ColumnDef } from "@tanstack/react-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChartInfo } from "@/components/ChartInfo";
import { DataTable } from "@/components/ui/data-table";
import type { ReplicationQueueItem } from "../../hooks/useOperationsData";
import { ChartLoadingBar, useLoadingBarVisibilityState } from "@/components/cluster-detail/shared/charts/ChartLoadingBar";
import { PanelLoader } from "@/components/ui/loading-spinner";
import type { NodeNameResolver } from "@/components/cluster-detail/shared/lib/nodeHost";

interface ReplicationQueuePanelProps {
  data: ReplicationQueueItem[];
  selectedNodes: string[];
  loading: boolean;
  nodeNameResolver?: NodeNameResolver;
}

export function ReplicationQueuePanel({ data, selectedNodes, loading, nodeNameResolver }: ReplicationQueuePanelProps) {
  const { showLoadingState, handleLoadingBarVisibilityChange } = useLoadingBarVisibilityState(loading);

  const columns = useMemo<ColumnDef<ReplicationQueueItem>[]>(() => [
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
      accessorKey: "queue",
      header: "Queue",
      size: 80,
      meta: { align: "right" as const, truncate: false as const },
      cell: ({ row }) => (
        <div>
          <Badge variant={(row.original.queue ?? 0) > 40 ? "destructive" : "secondary"}>
            {row.original.queue ?? 0}
          </Badge>
        </div>
      ),
    },
    {
      accessorKey: "inserts",
      header: "Inserts",
      size: 80,
      meta: { align: "right" as const },
      cell: ({ row }) => (
        <div className="text-gray-600 dark:text-gray-400">
          {typeof row.original.inserts === "number"
            ? row.original.inserts.toLocaleString()
            : row.original.inserts}
        </div>
      ),
    },
    {
      accessorKey: "merges",
      header: "Merges",
      size: 80,
      meta: { align: "right" as const },
      cell: ({ row }) => (
        <div className="text-gray-600 dark:text-gray-400">{row.original.merges}</div>
      ),
    },
    {
      accessorKey: "postponed_merges",
      header: "Postponed",
      size: 90,
      meta: { align: "right" as const, truncate: false as const },
      cell: ({ row }) => (
        <div>
          {(row.original.postponed_merges ?? 0) > 0 ? (
            <Badge variant="outline" className="text-yellow-700 dark:text-yellow-400 border-yellow-700 dark:border-yellow-400">
              {row.original.postponed_merges}
            </Badge>
          ) : (
            <span className="text-gray-400 dark:text-gray-500">0</span>
          )}
        </div>
      ),
    },
    {
      accessorKey: "mutations",
      header: "Mutations",
      size: 90,
      meta: { align: "right" as const, truncate: false as const },
      cell: ({ row }) => (
        <div>
          {(row.original.mutations ?? 0) > 0 ? (
            <Badge variant="outline">{row.original.mutations}</Badge>
          ) : (
            <span className="text-gray-400 dark:text-gray-500">0</span>
          )}
        </div>
      ),
    },
    {
      accessorKey: "last_queue",
      header: "Last Queue",
      size: 110,
      meta: { align: "right" as const, truncate: false as const },
      cell: ({ row }) => (
        <div>
          <Badge variant={parseInt(row.original.last_queue || "0") > 10 ? "destructive" : "outline"}>
            {row.original.last_queue}
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
            <RefreshCw className="w-4 h-4 text-green-600 dark:text-green-400" />
            Replication Queue by Table
            <ChartInfo
              title="Replication Queue by Table"
              description=""
              query={`SELECT
  hostName() AS hostname,
  database,
  table,
  countIf(type IN ('GET_PART', 'MERGE_PARTS', 'MUTATE_PART')) AS queue,
  countIf(type = 'GET_PART')                                  AS inserts,
  countIf(type = 'MERGE_PARTS')                               AS merges,
  countIf(num_postponed > 0)                                  AS postponed_merges,
  countIf(type = 'MUTATE_PART')                               AS mutations,
  if(
    max(last_attempt_time) = toDateTime(0),
    'never attempted',
    formatReadableTimeDelta(now() - max(last_attempt_time))
  ) AS last_queue
FROM clusterAllReplicas(
  (SELECT cluster FROM system.clusters WHERE is_local = 1 LIMIT 1),
  system.replication_queue
)
WHERE database NOT IN ('system', 'information_schema', 'INFORMATION_SCHEMA')
GROUP BY hostname, database, table
HAVING queue > 0
ORDER BY queue DESC
LIMIT 20
SETTINGS skip_unavailable_shards = 1`}
              yAxisLabel="Key columns"
              yAxisDescription="Queue: total of GET_PART/MERGE_PARTS/MUTATE_PART | Inserts: GET_PART count | Merges: MERGE_PARTS count | Postponed: entries with num_postponed > 0 | Mutations: MUTATE_PART count | Last Queue: time elapsed since last attempt"
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
          <PanelLoader label="Loading replication queue..." />
        ) : (
          <DataTable columns={columns} data={data} maxHeight={400} />
        )}
      </CardContent>
    </Card>
  );
}
