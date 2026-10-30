import { useMemo } from "react";
import { AlertTriangle } from "lucide-react";
import { type ColumnDef } from "@tanstack/react-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChartInfo } from "@/components/ChartInfo";
import { DataTable } from "@/components/ui/data-table";
import { parseReplicaIssues, formatReplicaIssueLabel } from "@/lib/replica-issues";
import type { BadReplicaItem } from "../../hooks/useOperationsData";
import { ChartLoadingBar, useLoadingBarVisibilityState } from "@/components/cluster-detail/shared/charts/ChartLoadingBar";
import type { NodeNameResolver } from "@/components/cluster-detail/shared/lib/nodeHost";

interface ProblemReplicasPanelProps {
  badReplicasDetail: BadReplicaItem[];
  selectedNodes?: string[];
  loading: boolean;
  nodeNameResolver?: NodeNameResolver;
}

export function ProblemReplicasPanel({ badReplicasDetail, selectedNodes, loading, nodeNameResolver }: ProblemReplicasPanelProps) {
  const { showLoadingState, handleLoadingBarVisibilityChange } = useLoadingBarVisibilityState(loading);

  const resolveLabel = (hostname?: string | null) =>
    nodeNameResolver ? nodeNameResolver(hostname) : (hostname || "");

  const filtered = useMemo(
    () =>
      selectedNodes && selectedNodes.length > 0
        ? badReplicasDetail.filter((r) => selectedNodes.includes(resolveLabel(r.hostname)))
        : badReplicasDetail,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [badReplicasDetail, selectedNodes, nodeNameResolver],
  );

  const columns = useMemo<ColumnDef<BadReplicaItem>[]>(() => [
    {
      accessorKey: "hostname",
      size: 150,
      header: "Node",
      cell: ({ row }) => (
        <span className="text-gray-600 dark:text-gray-400 text-xs">
          {resolveLabel(row.original.hostname)}
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
      id: "issues",
      size: 300,
      meta: { truncate: false as const },
      header: "Detected Issues",
      cell: ({ row }) => {
        const issuesList = parseReplicaIssues(row.original.issues).map((issue) =>
          formatReplicaIssueLabel(issue, {}),
        );
        const isNodeLevel = (label: string) =>
          label.includes("Read-only") || label.includes("Keeper session");
        return (
          <div className="flex flex-wrap gap-1">
            {issuesList.map((label) => (
              <Badge
                key={label}
                variant={isNodeLevel(label) ? "destructive" : "outline"}
                className={
                  isNodeLevel(label)
                    ? undefined
                    : "text-yellow-700 dark:text-yellow-400 border-yellow-700 dark:border-yellow-400"
                }
              >
                {label}
              </Badge>
            ))}
          </div>
        );
      },
    },
    {
      accessorKey: "affected_tables",
      header: "Tables",
      size: 70,
      meta: { align: "right" as const },
      cell: ({ row }) => (
        <div className="text-gray-600 dark:text-gray-400">
          {row.original.affected_tables ?? 0}
        </div>
      ),
    },
    {
      accessorKey: "max_absolute_delay",
      size: 95,
      header: "Max Delay",
      meta: { align: "right" as const, truncate: false as const },
      cell: ({ row }) => {
        const delay = row.original.max_absolute_delay ?? 0;
        return delay > 0 ? (
          <Badge variant={delay >= 300 ? "destructive" : "outline"}
            className={delay < 300 ? "text-yellow-700 dark:text-yellow-400 border-yellow-700 dark:border-yellow-400" : undefined}>
            {delay}s
          </Badge>
        ) : (
          <span className="text-gray-400 dark:text-gray-500">—</span>
        );
      },
    },
    {
      accessorKey: "max_queue_size",
      size: 90,
      header: "Max Queue",
      meta: { align: "right" as const, truncate: false as const },
      cell: ({ row }) => {
        const q = row.original.max_queue_size ?? 0;
        return q > 0 ? (
          <Badge variant={q > 40 ? "destructive" : "secondary"}>{q}</Badge>
        ) : (
          <span className="text-gray-400 dark:text-gray-500">—</span>
        );
      },
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [nodeNameResolver]);

  return (
    <Card className="relative overflow-hidden lg:col-span-2 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <ChartLoadingBar loading={loading} showDelayMs={0} onVisibilityChange={handleLoadingBarVisibilityChange} />
      <CardHeader className="pb-1.5 pt-2 px-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm text-gray-800 dark:text-white flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400" />
            Replica Issues
            <ChartInfo
              title="Replica Issues"
              description="Detects replica anomalies grouped by node from system.replicas. Node-level issues (ReadOnly, SessionExpired) affect all tables on that node."
              query={`SELECT
  hostName() AS hostname,
  max(is_readonly)        AS node_is_readonly,
  max(is_session_expired) AS node_is_session_expired,
  countIf(future_parts > 20)                                    AS tables_future_parts,
  countIf(parts_to_check > 10)                                  AS tables_parts_check,
  countIf(queue_size > 20)                                      AS tables_queue_backlog,
  countIf(inserts_in_queue > 10)                                AS tables_insert_backlog,
  countIf(greatest(log_max_index - log_pointer + 1, 0) > 10)   AS tables_log_delay,
  countIf(absolute_delay >= 300)                                AS tables_delay,
  max(absolute_delay)     AS max_absolute_delay,
  max(queue_size)         AS max_queue_size,
  countIf(...) AS affected_tables,
  arrayStringConcat(...) AS issues
FROM clusterAllReplicas(
  (SELECT cluster FROM system.clusters WHERE is_local = 1 LIMIT 1),
  system.replicas
)
WHERE (is_readonly = 1 OR is_session_expired = 1 OR ...)
GROUP BY hostname
ORDER BY max(is_readonly) DESC, max(is_session_expired) DESC, length(issues) DESC
LIMIT 50
SETTINGS skip_unavailable_shards = 1`}
              yAxisLabel="Key columns"
              yAxisDescription="Issues: node-level (ReadOnly, SessionExpired) shown in red; table-level issues show count of affected tables | Tables: number of tables on this replica with at least one issue | Max Delay: highest absolute_delay across all tables on this node | Max Queue: highest queue_size"
              aggregation="max"
            />
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
              {selectedNodes && selectedNodes.length > 0
                ? selectedNodes.length === 1
                  ? selectedNodes[0]
                  : selectedNodes.join(", ")
                : "Cluster-wide"}
            </Badge>
            <Badge variant={filtered.length > 0 ? "destructive" : "secondary"} className="text-xs">
              {filtered.length} node{filtered.length !== 1 ? "s" : ""}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {showLoadingState ? (
          <div className="flex items-center justify-center py-8 text-sm text-gray-500 dark:text-gray-400">
            Loading replica issues...
          </div>
        ) : (
          <DataTable columns={columns} data={filtered} disableVirtualization maxHeight={400} />
        )}
      </CardContent>
    </Card>
  );
}
