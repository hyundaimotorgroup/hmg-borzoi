import { useEffect, useMemo, useState } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { HardDrive, ChevronDown, ChevronRight } from "lucide-react";
import { ChartInfo } from "@/components/ChartInfo";
import type { DatabaseDiskUsageItem } from "../../hooks/useStorageData";
import { ChartLoadingBar, useLoadingBarVisibilityState } from "@/components/cluster-detail/shared/charts/ChartLoadingBar";
import { PanelLoader } from "@/components/ui/loading-spinner";
import { DataTable } from "@/components/ui/data-table";
import type { NodeNameResolver } from "@/components/cluster-detail/shared/lib/nodeHost";

interface DatabaseDiskUsageTableProps {
  data: DatabaseDiskUsageItem[];
  selectedNodes: string[];
  loading: boolean;
  nodeNameResolver?: NodeNameResolver;
}

interface NodeGroup {
  node: string;
  shard_num?: number;
  replica_num?: number;
  totalSizeGb: number;
  totalDiskGb: number;
  usagePct: number;
  totalTables: number;
  rows: DatabaseDiskUsageItem[];
}

function groupByNode(data: DatabaseDiskUsageItem[], nodeNameResolver?: NodeNameResolver): NodeGroup[] {
  const map = new Map<string, NodeGroup>();

  data.forEach((row) => {
    const shortNode = nodeNameResolver
      ? nodeNameResolver(row.hostname)
      : (row.hostname || "").split(".")[0];
    if (!map.has(shortNode)) {
      map.set(shortNode, {
        node: shortNode,
        shard_num: row.shard_num,
        replica_num: row.replica_num,
        totalSizeGb: 0,
        totalDiskGb: row.total_disk_gb ?? 0,
        usagePct: 0,
        totalTables: 0,
        rows: [],
      });
    }
    const group = map.get(shortNode)!;
    group.totalSizeGb += Number(row.active_size_gb ?? 0);
    group.totalTables += Number(row.tables ?? 0);
    if (!group.totalDiskGb && row.total_disk_gb) {
      group.totalDiskGb = row.total_disk_gb;
    }
    group.rows.push(row);
  });

  map.forEach((group) => {
    group.usagePct = group.totalDiskGb > 0
      ? (group.totalSizeGb / group.totalDiskGb) * 100
      : 0;
    group.rows.sort((a, b) => Number(b.usage_pct ?? 0) - Number(a.usage_pct ?? 0));
  });

  return Array.from(map.values()).sort((a, b) => b.usagePct - a.usagePct);
}

export function DatabaseDiskUsageTable({ data, selectedNodes, loading, nodeNameResolver }: DatabaseDiskUsageTableProps) {
  const { showLoadingState, handleLoadingBarVisibilityChange } = useLoadingBarVisibilityState(loading);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  const groups = useMemo(() => groupByNode(data, nodeNameResolver), [data, nodeNameResolver]);

  const toggleNode = (node: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(node)) {
        next.delete(node);
      } else {
        next.add(node);
      }
      return next;
    });
  };

  const allExpanded = groups.every((g) => expandedNodes.has(g.node));
  const toggleAll = () => {
    setExpandedNodes(allExpanded ? new Set() : new Set(groups.map((g) => g.node)));
  };

  useEffect(() => {
    setExpandedNodes(new Set());
  }, [groups.length]);

  const columns = useMemo<ColumnDef<NodeGroup>[]>(() => [
    {
      id: "node",
      size: 180,
      meta: { truncate: false as const },
      header: () => (
        <button onClick={toggleAll} className="flex items-center gap-1 hover:text-blue-600 dark:text-gray-300">
          {allExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          Node / Database
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
              {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-gray-500" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-500" />}
              <span className="text-xs text-gray-800 dark:text-gray-100">{group.node}</span>
              <span className="text-gray-400 font-normal text-xs">({group.rows.length} DB)</span>
            </button>
            {isExpanded && (
              <div className="mt-1 ml-5 space-y-0.5">
                {group.rows.map((dbRow, idx) => (
                  <div key={`${group.node}-${dbRow.database ?? ""}-${idx}`} className="text-xs text-gray-700 dark:text-gray-300 py-0.5">
                    {dbRow.database || <span className="text-gray-400">—</span>}
                  </div>
                ))}
              </div>
            )}
          </>
        );
      },
    },
    {
      id: "shard_num",
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
      id: "replica_num",
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
      id: "activeSizeGb",
      header: "Active Size (GB)",
      size: 120,
      meta: { align: "right" as const },
      cell: ({ row }) => {
        const group = row.original;
        const isExpanded = expandedNodes.has(group.node);
        return (
          <>
            <span className="block text-xs text-gray-700 dark:text-gray-200">
              {group.totalSizeGb.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </span>
            {isExpanded && (
              <div className="mt-1 space-y-0.5">
                {group.rows.map((dbRow, idx) => (
                  <div key={`${group.node}-sz-${dbRow.database ?? ""}-${idx}`} className="text-xs text-right text-gray-600 dark:text-gray-400 py-0.5">
                    {(dbRow.active_size_gb ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  </div>
                ))}
              </div>
            )}
          </>
        );
      },
    },
    {
      id: "totalDiskGb",
      header: "Total Disk (GB)",
      size: 110,
      meta: { align: "right" as const },
      cell: ({ row }) => {
        const group = row.original;
        const isExpanded = expandedNodes.has(group.node);
        return (
          <>
            <span className="block text-xs text-gray-600 dark:text-gray-300">
              {group.totalDiskGb > 0 ? group.totalDiskGb.toLocaleString(undefined, { maximumFractionDigits: 2 }) : "-"}
            </span>
            {isExpanded && (
              <div className="mt-1 space-y-0.5">
                {group.rows.map((dbRow, idx) => {
                  const totalGb = dbRow.total_disk_gb ?? 0;
                  return (
                    <div key={`${group.node}-dk-${dbRow.database ?? ""}-${idx}`} className="text-xs text-right text-gray-600 dark:text-gray-400 py-0.5">
                      {totalGb > 0 ? totalGb.toLocaleString(undefined, { maximumFractionDigits: 2 }) : "-"}
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
      id: "usagePct",
      header: "Usage %",
      size: 90,
      meta: { align: "right" as const },
      cell: ({ row }) => {
        const group = row.original;
        const isExpanded = expandedNodes.has(group.node);
        return (
          <>
            <span className={`block text-xs ${group.usagePct >= 50 ? "text-orange-600 dark:text-orange-400" : "text-gray-600 dark:text-gray-300"}`}>
              {group.totalDiskGb > 0 ? `${group.usagePct.toFixed(2)}%` : "-"}
            </span>
            {isExpanded && (
              <div className="mt-1 space-y-0.5">
                {group.rows.map((dbRow, idx) => {
                  const usagePct = dbRow.usage_pct ?? 0;
                  const totalGb = dbRow.total_disk_gb ?? 0;
                  return (
                    <div key={`${group.node}-up-${dbRow.database ?? ""}-${idx}`} className={`text-xs text-right py-0.5 ${usagePct >= 50 ? "text-orange-600 dark:text-orange-400" : "text-gray-600 dark:text-gray-400"}`}>
                      {totalGb > 0 ? `${usagePct.toFixed(2)}%` : "-"}
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
      id: "tables",
      header: "Tables",
      size: 80,
      meta: { align: "right" as const },
      cell: ({ row }) => {
        const group = row.original;
        const isExpanded = expandedNodes.has(group.node);
        return (
          <>
            <span className="block text-xs text-gray-600 dark:text-gray-300">
              {group.totalTables.toLocaleString()}
            </span>
            {isExpanded && (
              <div className="mt-1 space-y-0.5">
                {group.rows.map((dbRow, idx) => (
                  <div key={`${group.node}-tb-${dbRow.database ?? ""}-${idx}`} className="text-xs text-right text-gray-600 dark:text-gray-400 py-0.5">
                    {dbRow.tables ?? 0}
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
    <Card className="relative overflow-hidden lg:col-span-2 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <ChartLoadingBar loading={loading} showDelayMs={0} onVisibilityChange={handleLoadingBarVisibilityChange} />
      <CardHeader className="pb-1.5 pt-2 px-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-sm text-gray-800 dark:text-white flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              Database Disk Usage by Node
            </CardTitle>
            <ChartInfo
              title="Database Disk Usage by Node"
              description=""
              query={`WITH
  parts_agg AS (
    SELECT
      hostName() AS hostname,
      database,
      sum(bytes_on_disk) AS active_size_bytes,
      round(active_size_bytes / 1024 / 1024 / 1024, 2) AS active_size_gb,
      count() AS active_parts,
      uniqExact(table) AS tables
    FROM clusterAllReplicas(
      (SELECT cluster FROM system.clusters WHERE is_local = 1 LIMIT 1),
      system.parts
    )
    WHERE active = 1
    GROUP BY hostname, database
  ),
  totals AS (
    SELECT
      hostName() AS hostname,
      sumIf(value, metric = 'FilesystemMainPathTotalBytes') AS total_bytes
    FROM clusterAllReplicas(
      (SELECT cluster FROM system.clusters WHERE is_local = 1 LIMIT 1),
      system.asynchronous_metrics
    )
    GROUP BY hostname
  )
SELECT
  p.hostname,
  p.database,
  p.active_size_gb,
  p.active_parts,
  p.tables,
  round(t.total_bytes / 1024 / 1024 / 1024, 2) AS total_disk_gb,
  round(p.active_size_bytes / nullIf(t.total_bytes, 0) * 100, 2) AS usage_pct
FROM parts_agg p
LEFT JOIN totals t ON p.hostname = t.hostname
WHERE p.active_size_bytes > 0
ORDER BY usage_pct DESC
SETTINGS skip_unavailable_shards = 1, max_threads = 2`}
              yAxisLabel="GB / % / Count"
              yAxisDescription="Active Size (GB): disk usage of active parts | Total Disk (GB): total node disk capacity | Usage (%): DB usage as a fraction of node capacity | Active Parts: count of active parts | Tables: count of active tables"
              aggregation="sum"
            />
          </div>
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
          <PanelLoader label="Loading database disk usage..." />
        ) : (
          <DataTable
            columns={columns}
            data={groups}
            isLoading={false}
            emptyMessage="No database disk usage data available"
          />
        )}
      </CardContent>
    </Card>
  );
}
