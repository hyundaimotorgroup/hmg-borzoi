import { useMemo } from "react";
import { Terminal } from "lucide-react";
import { type ColumnDef } from "@tanstack/react-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChartInfo } from "@/components/ChartInfo";
import { DataTable } from "@/components/ui/data-table";
import type { DDLQueueItem } from "../../hooks/useOperationsData";
import { ChartLoadingBar, useLoadingBarVisibilityState } from "@/components/cluster-detail/shared/charts/ChartLoadingBar";
import { PanelLoader } from "@/components/ui/loading-spinner";
import type { NodeNameResolver } from "@/components/cluster-detail/shared/lib/nodeHost";

interface DDLQueuePanelProps {
  data: DDLQueueItem[];
  loading: boolean;
  selectedNodes: string[];
  nodeNameResolver?: NodeNameResolver;
}

export function DDLQueuePanel({ data, loading, selectedNodes, nodeNameResolver }: DDLQueuePanelProps) {
  const { showLoadingState, handleLoadingBarVisibilityChange } = useLoadingBarVisibilityState(loading);

  const columns = useMemo<ColumnDef<DDLQueueItem>[]>(() => [
    {
      accessorKey: "hostname",
      header: "Node",
      size: 130,
      cell: ({ row }) => (
        <span className="text-gray-600 dark:text-gray-400 text-xs">
          {nodeNameResolver ? nodeNameResolver(row.original.hostname ?? "") : (row.original.hostname ?? "—")}
        </span>
      ),
    },
    {
      accessorKey: "cluster",
      header: "Cluster",
      size: 100,
      cell: ({ row }) => (
        <span className="text-xs text-gray-600 dark:text-gray-400">{row.original.cluster ?? "—"}</span>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      size: 80,
      meta: { align: "center" as const },
      cell: ({ row }) => {
        const status = row.original.status ?? "";
        const variant = status === "Active" ? "default" : status === "Unknown" ? "secondary" : "outline";
        return <Badge variant={variant} className="text-xs">{status || "—"}</Badge>;
      },
    },
    {
      accessorKey: "age",
      header: "Age",
      size: 100,
      meta: { align: "right" as const, truncate: false as const },
      cell: ({ row }) => {
        const seconds = row.original.age_seconds ?? 0;
        return (
          <Badge variant={seconds > 300 ? "destructive" : "outline"} className="text-xs">
            {row.original.age ?? "—"}
          </Badge>
        );
      },
    },
    {
      accessorKey: "query",
      header: "Query",
      size: 280,
      cell: ({ row }) => (
        <span className="text-xs font-mono text-gray-700 dark:text-gray-300 truncate block max-w-[280px]">
          {row.original.query ?? "—"}
        </span>
      ),
    },
    {
      accessorKey: "initiator_host",
      header: "Initiator",
      size: 130,
      cell: ({ row }) => (
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {nodeNameResolver ? nodeNameResolver(row.original.initiator_host ?? "") : (row.original.initiator_host ?? "—")}
        </span>
      ),
    },
    {
      accessorKey: "create_time",
      header: "Created",
      size: 140,
      meta: { align: "right" as const },
      cell: ({ row }) => (
        <span className="text-xs text-gray-500 dark:text-gray-400">{row.original.create_time ?? "—"}</span>
      ),
    },
    {
      accessorKey: "exception_text",
      header: "Error",
      size: 200,
      cell: ({ row }) => {
        const err = row.original.exception_text;
        if (!err) return <span className="text-gray-400 dark:text-gray-500 text-xs">—</span>;
        return (
          <span className="text-xs text-red-600 dark:text-red-400 truncate block max-w-[200px]" title={err}>
            {err}
          </span>
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
            <Terminal className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
            DDL Queue (Pending &gt; 1 min)
            <ChartInfo
              title="DDL Queue Pending Tasks"
              description="Non-finished DDL tasks pending for more than 1 minute from system.distributed_ddl_queue"
              query={`SELECT
  host AS hostname,
  cluster,
  query,
  initiator_host,
  status,
  formatDateTime(query_create_time, '%Y-%m-%d %H:%M:%S') AS create_time,
  dateDiff('second', query_create_time, now()) AS age_seconds,
  formatReadableTimeDelta(age_seconds) AS age,
  exception_text
FROM system.distributed_ddl_queue
WHERE status IN ('Active', 'Inactive', 'Unknown')
  AND query_create_time < now() - INTERVAL 1 MINUTE
ORDER BY age_seconds DESC
LIMIT 50`}
              yAxisLabel="Key columns"
              yAxisDescription="Age: time since DDL was submitted | Status: Active/Inactive/Unknown = still pending | Error: exception if the task failed on this node"
              aggregation="count"
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
          <PanelLoader label="Loading DDL queue..." />
        ) : (
          <DataTable columns={columns} data={data} maxHeight={400} />
        )}
      </CardContent>
    </Card>
  );
}
