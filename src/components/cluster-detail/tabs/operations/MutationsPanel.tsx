import { useMemo } from "react";
import { Zap } from "lucide-react";
import { type ColumnDef } from "@tanstack/react-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChartInfo } from "@/components/ChartInfo";
import { DataTable } from "@/components/ui/data-table";
import type { MutationItem } from "../../hooks/useOperationsData";
import { ChartLoadingBar, useLoadingBarVisibilityState } from "@/components/cluster-detail/shared/charts/ChartLoadingBar";
import { PanelLoader } from "@/components/ui/loading-spinner";
import type { NodeNameResolver } from "@/components/cluster-detail/shared/lib/nodeHost";

interface MutationsPanelProps {
  data: MutationItem[];
  selectedNodes: string[];
  loading: boolean;
  nodeNameResolver?: NodeNameResolver;
}

export function MutationsPanel({ data, selectedNodes, loading, nodeNameResolver }: MutationsPanelProps) {
  const { showLoadingState, handleLoadingBarVisibilityChange } = useLoadingBarVisibilityState(loading);

  const columns = useMemo<ColumnDef<MutationItem>[]>(() => [
    {
      accessorKey: "hostname",
      header: "Node",
      size: 130,
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
        <span className="text-xs text-gray-600 dark:text-gray-400">{row.original.database}</span>
      ),
    },
    {
      accessorKey: "table",
      header: "Table",
      size: 130,
      cell: ({ row }) => (
        <span className="text-xs dark:text-gray-300">{row.original.table}</span>
      ),
    },
    {
      accessorKey: "mutation_id",
      header: "Mutation ID",
      size: 150,
      cell: ({ row }) => (
        <span className="text-xs text-gray-600 dark:text-gray-400">{row.original.mutation_id}</span>
      ),
    },
    {
      accessorKey: "command",
      header: "Command",
      minSize: 180,
      cell: ({ row }) => (
        <span
          className="block truncate text-xs text-gray-700 dark:text-gray-300"
          title={row.original.command}
        >
          {row.original.command}
        </span>
      ),
    },
    {
      accessorKey: "create_time",
      header: "Created At",
      size: 140,
      cell: ({ row }) => (
        <span className="text-xs text-gray-600 dark:text-gray-400">{row.original.create_time}</span>
      ),
    },
    {
      accessorKey: "parts_to_do",
      header: "Parts Left",
      size: 90,
      meta: { align: "right" as const, truncate: false as const },
      cell: ({ row }) => (
        <Badge variant={(row.original.parts_to_do ?? 0) > 0 ? "destructive" : "secondary"}>
          {row.original.parts_to_do ?? 0}
        </Badge>
      ),
    },
    {
      accessorKey: "latest_fail_reason",
      header: "Last Error",
      size: 190,
      cell: ({ row }) => {
        const reason = row.original.latest_fail_reason;
        if (!reason) return <span className="text-xs text-gray-400 dark:text-gray-500">—</span>;
        return (
          <Badge
            variant="destructive"
            className="max-w-[170px] truncate block text-xs"
            title={reason}
          >
            {reason}
          </Badge>
        );
      },
    },
  ], [nodeNameResolver]);

  return (
    <Card className="relative overflow-hidden lg:col-span-2 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <ChartLoadingBar loading={loading} showDelayMs={0} onVisibilityChange={handleLoadingBarVisibilityChange} />
      <CardHeader className="pb-1.5 pt-2 px-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm text-gray-800 dark:text-white flex items-center gap-2">
            <Zap className="w-4 h-4 text-purple-600 dark:text-purple-400" />
            Active Mutations
            <ChartInfo
              title="Active Mutations"
              description="Active ALTER UPDATE/DELETE mutations per replica. Each replica processes parts independently, so parts_to_do may differ across replicas."
              query={`SELECT
  hostName() AS hostname,
  database, table, mutation_id, command,
  formatDateTime(create_time, '%Y-%m-%d %H:%M:%S') AS create_time,
  parts_to_do, latest_fail_reason
FROM clusterAllReplicas(
  (SELECT cluster FROM system.clusters WHERE is_local = 1 LIMIT 1),
  system.mutations
)
WHERE is_done = 0
ORDER BY create_time DESC
LIMIT 50
SETTINGS skip_unavailable_shards = 1`}
              yAxisLabel="Key columns"
              yAxisDescription={`Node/Shard/Replica: mutations run independently per replica — the same mutation_id may show different parts_to_do across replicas\nParts Left: number of parts still to be rewritten; 0 means complete\nLast Error: most recent failure reason; repeated failures require immediate attention`}
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
          <PanelLoader label="Loading mutations..." />
        ) : (
          <DataTable columns={columns} data={data} maxHeight={400} />
        )}
      </CardContent>
    </Card>
  );
}
