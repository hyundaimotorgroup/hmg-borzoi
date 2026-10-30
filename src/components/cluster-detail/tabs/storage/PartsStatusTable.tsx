import { useMemo, useState } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Layers, ChevronDown, ChevronRight, AlertTriangle } from "lucide-react";
import { ChartInfo } from "@/components/ChartInfo";
import type { PartsStatusItem, PartsStatusByDbItem } from "../../hooks/useStorageData";
import { PanelLoader } from "@/components/ui/loading-spinner";
import { ChartLoadingBar, useLoadingBarVisibilityState } from "@/components/cluster-detail/shared/charts/ChartLoadingBar";
import { DataTable } from "@/components/ui/data-table";
import type { NodeNameResolver } from "@/components/cluster-detail/shared/lib/nodeHost";

interface PartsStatusTableProps {
  partsStatusData: PartsStatusItem[];
  byDbData?: PartsStatusByDbItem[];
  selectedNodes: string[];
  loading: boolean;
  nodeNameResolver?: NodeNameResolver;
}

const AVG_PARTS_WARN = 100;
const LEVEL0_RATIO_WARN = 0.3;

// Helper: Render per-DB values as a stacked list in cells
function DbSubRows({ children }: { children: React.ReactNode }) {
  return <div className="mt-1 space-y-0.5">{children}</div>;
}
function DbSubRow({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`text-xs py-0.5 ${className}`}>{children}</div>;
}
function CountSubRows({ dbs, field, activeColor }: {
  dbs: PartsStatusByDbItem[];
  field: "total_detached" | "broken_parts";
  activeColor: string;
}) {
  return (
    <DbSubRows>
      {dbs.map((db, i) => {
        const c = db[field] ?? 0;
        return (
          <DbSubRow key={i} className={`text-right ${c > 0 ? activeColor : "text-gray-400 dark:text-gray-500"}`}>
            {c > 0 ? c : "—"}
          </DbSubRow>
        );
      })}
    </DbSubRows>
  );
}

export function PartsStatusTable({ partsStatusData, byDbData, selectedNodes, loading, nodeNameResolver }: PartsStatusTableProps) {
  const { showLoadingState, handleLoadingBarVisibilityChange } = useLoadingBarVisibilityState(loading);
  const [expandedHosts, setExpandedHosts] = useState<Set<string>>(new Set());

  // Map: hostname → sorted list of DB entries
  const dbByHost = useMemo(() => {
    const map = new Map<string, PartsStatusByDbItem[]>();
    (byDbData ?? []).forEach((row) => {
      const key = row.hostname ?? "";
      if (!key) return;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(row);
    });
    return map;
  }, [byDbData]);

  const toggleHost = (hostname: string) => {
    setExpandedHosts((prev) => {
      const next = new Set(prev);
      if (next.has(hostname)) {
        next.delete(hostname);
      } else {
        next.add(hostname);
      }
      return next;
    });
  };

  const allExpanded = partsStatusData.length > 0 && partsStatusData.every((r) => expandedHosts.has(r.hostname));
  const toggleAll = () => {
    setExpandedHosts(allExpanded ? new Set() : new Set(partsStatusData.map((r) => r.hostname)));
  };

  const columns = useMemo<ColumnDef<PartsStatusItem>[]>(() => [
    // ── Node (expandable) ──────────────────────────────────────────
    {
      accessorKey: "hostname",
      size: 150,
      meta: { truncate: false as const },
      header: () => (
        <button onClick={toggleAll} className="flex items-center gap-1 hover:text-blue-600 dark:text-gray-300">
          {allExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          Node
        </button>
      ),
      cell: ({ row }) => {
        const label = nodeNameResolver
          ? nodeNameResolver(row.original.hostname)
          : (row.original.hostname || "").split(".")[0];
        const isExpanded = expandedHosts.has(row.original.hostname);
        const dbs = dbByHost.get(row.original.hostname) ?? [];
        return (
          <>
            <button className="flex items-center gap-1.5 w-full text-left" onClick={() => toggleHost(row.original.hostname)}>
              {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-gray-500" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-500" />}
              <span className="text-xs dark:text-gray-300">{label}</span>
              {dbs.length > 0 && <span className="text-gray-400 font-normal text-xs">({dbs.length} DB)</span>}
            </button>
            {isExpanded && dbs.length > 0 && (
              <DbSubRows>
                {dbs.map((db, i) => (
                  <DbSubRow key={`${row.original.hostname}-db-${i}`} className="ml-5 text-gray-700 dark:text-gray-300">
                    {db.database || <span className="text-gray-400">—</span>}
                  </DbSubRow>
                ))}
              </DbSubRows>
            )}
          </>
        );
      },
    },

    // ── Shard ──────────────────────────────────────────────────────
    {
      accessorKey: "shard_num",
      header: "Shard",
      size: 55,
      meta: { align: "center" as const },
      cell: ({ row }) => (
        <span className="text-xs text-blue-600 dark:text-blue-400">{row.original.shard_num ?? "—"}</span>
      ),
    },

    // ── Replica ────────────────────────────────────────────────────
    {
      accessorKey: "replica_num",
      header: "Rep",
      size: 45,
      meta: { align: "center" as const },
      cell: ({ row }) => (
        <span className="text-xs text-purple-600 dark:text-purple-400">{row.original.replica_num ?? "—"}</span>
      ),
    },

    // ── Active Parts ───────────────────────────────────────────────
    {
      accessorKey: "active_parts",
      header: "Active Parts",
      size: 95,
      meta: { align: "right" as const },
      cell: ({ row }) => {
        const isExpanded = expandedHosts.has(row.original.hostname);
        const dbs = dbByHost.get(row.original.hostname) ?? [];
        return (
          <>
            <span className="block text-xs text-gray-900 dark:text-white">{row.original.active_parts ?? 0}</span>
            {isExpanded && dbs.length > 0 && (
              <DbSubRows>
                {dbs.map((db, i) => (
                  <DbSubRow key={i} className="text-right text-gray-600 dark:text-gray-400">
                    {db.active_parts ?? 0}
                  </DbSubRow>
                ))}
              </DbSubRows>
            )}
          </>
        );
      },
    },

    // ── Partitions ─────────────────────────────────────────────────
    {
      accessorKey: "total_partitions",
      header: "Partitions",
      size: 90,
      meta: { align: "right" as const },
      cell: ({ row }) => {
        const isExpanded = expandedHosts.has(row.original.hostname);
        const dbs = dbByHost.get(row.original.hostname) ?? [];
        const count = row.original.total_partitions;
        const nodeWarn = (count ?? 0) >= 5000;
        return (
          <>
            <span className={`text-xs flex items-center justify-end gap-1 ${nodeWarn ? "text-orange-600 dark:text-orange-400 font-medium" : "text-gray-700 dark:text-gray-300"}`}>
              {nodeWarn && <AlertTriangle className="w-3 h-3 shrink-0" />}
              {count !== undefined ? count.toLocaleString() : "—"}
            </span>
            {isExpanded && dbs.length > 0 && (
              <DbSubRows>
                {dbs.map((db, i) => {
                  const c = db.total_partitions ?? 0;
                  const warn = c >= 5000;
                  return (
                    <DbSubRow key={i} className={`text-right flex items-center justify-end gap-1 ${warn ? "text-orange-600 dark:text-orange-400" : "text-gray-500 dark:text-gray-400"}`}>
                      {warn && <AlertTriangle className="w-3 h-3 shrink-0" />}
                      {c.toLocaleString()}
                    </DbSubRow>
                  );
                })}
              </DbSubRows>
            )}
          </>
        );
      },
    },

    // ── Avg / Partition ────────────────────────────────────────────
    {
      accessorKey: "avg_parts_per_partition",
      header: "Avg/Partition",
      size: 110,
      meta: { align: "right" as const },
      cell: ({ row }) => {
        const isExpanded = expandedHosts.has(row.original.hostname);
        const dbs = dbByHost.get(row.original.hostname) ?? [];
        const avg = row.original.avg_parts_per_partition;

        function avgClass(v: number) {
          if (v >= AVG_PARTS_WARN) return "text-red-600 dark:text-red-400 font-semibold";
          if (v >= AVG_PARTS_WARN / 2) return "text-orange-600 dark:text-orange-400";
          return "text-gray-700 dark:text-gray-300";
        }

        return (
          <>
            <span className={`text-xs flex items-center justify-end gap-1 ${avgClass(avg ?? 0)}`}>
              {(avg ?? 0) >= AVG_PARTS_WARN && <AlertTriangle className="w-3 h-3 shrink-0" />}
              {avg !== undefined ? avg : "—"}
            </span>
            {isExpanded && dbs.length > 0 && (
              <DbSubRows>
                {dbs.map((db, i) => {
                  const v = db.avg_parts_per_partition ?? 0;
                  return (
                    <DbSubRow key={i} className={`text-right flex items-center justify-end gap-1 ${avgClass(v)}`}>
                      {v >= AVG_PARTS_WARN && <AlertTriangle className="w-3 h-3 shrink-0" />}
                      {v}
                    </DbSubRow>
                  );
                })}
              </DbSubRows>
            )}
          </>
        );
      },
    },

    // ── Level-0 ────────────────────────────────────────────────────
    {
      accessorKey: "level0_ratio",
      header: "Level-0",
      size: 100,
      meta: { align: "right" as const },
      cell: ({ row }) => {
        const isExpanded = expandedHosts.has(row.original.hostname);
        const dbs = dbByHost.get(row.original.hostname) ?? [];
        const ratio = row.original.level0_ratio ?? 0;
        const count = row.original.level0_parts;
        const nodeWarn = ratio >= LEVEL0_RATIO_WARN;

        function renderLevel0(cnt: number | undefined, r: number) {
          const warn = r >= LEVEL0_RATIO_WARN;
          return (
            <span className={`flex items-center justify-end gap-1 ${warn ? "text-orange-600 dark:text-orange-400" : "text-gray-600 dark:text-gray-400"}`}>
              {cnt !== undefined ? `${cnt} ` : ""}
              <span className={warn ? "font-medium" : ""}>({(r * 100).toFixed(1)}%)</span>
            </span>
          );
        }

        return (
          <>
            <span className={`text-xs block ${nodeWarn ? "text-orange-600 dark:text-orange-400" : "text-gray-600 dark:text-gray-400"}`}>
              {renderLevel0(count, ratio)}
            </span>
            {isExpanded && dbs.length > 0 && (
              <DbSubRows>
                {dbs.map((db, i) => (
                  <DbSubRow key={i} className="text-xs text-right">
                    {renderLevel0(db.level0_parts, db.level0_ratio ?? 0)}
                  </DbSubRow>
                ))}
              </DbSubRows>
            )}
          </>
        );
      },
    },

    // ── Small < 10 MB ──────────────────────────────────────────────
    {
      accessorKey: "small_parts_ratio",
      header: "Small<10MB",
      size: 100,
      meta: { align: "right" as const },
      cell: ({ row }) => {
        const isExpanded = expandedHosts.has(row.original.hostname);
        const dbs = dbByHost.get(row.original.hostname) ?? [];
        const ratio = (row.original.small_parts_ratio ?? 0) * 100;

        function ratioClass(pct: number) {
          return pct > 50 ? "text-orange-600 dark:text-orange-400" : "text-gray-600 dark:text-gray-400";
        }

        return (
          <>
            <span className={`text-xs ${ratioClass(ratio)}`}>{ratio.toFixed(1)}%</span>
            {isExpanded && dbs.length > 0 && (
              <DbSubRows>
                {dbs.map((db, i) => {
                  const pct = (db.small_parts_ratio ?? 0) * 100;
                  return (
                    <DbSubRow key={i} className={`text-right ${ratioClass(pct)}`}>
                      {pct.toFixed(1)}%
                    </DbSubRow>
                  );
                })}
              </DbSubRows>
            )}
          </>
        );
      },
    },

    // ── Inactive ───────────────────────────────────────────────────
    {
      accessorKey: "inactive_parts",
      header: "Inactive",
      size: 75,
      meta: { align: "right" as const },
      cell: ({ row }) => {
        const isExpanded = expandedHosts.has(row.original.hostname);
        const dbs = dbByHost.get(row.original.hostname) ?? [];
        return (
          <>
            <span className="text-xs text-gray-500 dark:text-gray-400">{row.original.inactive_parts ?? 0}</span>
            {isExpanded && dbs.length > 0 && (
              <DbSubRows>
                {dbs.map((db, i) => (
                  <DbSubRow key={i} className="text-right text-gray-500 dark:text-gray-400">
                    {db.inactive_parts ?? 0}
                  </DbSubRow>
                ))}
              </DbSubRows>
            )}
          </>
        );
      },
    },

    // ── Detached ───────────────────────────────────────────────────
    {
      accessorKey: "total_detached",
      header: "Detached",
      size: 80,
      meta: { align: "right" as const },
      cell: ({ row }) => {
        const isExpanded = expandedHosts.has(row.original.hostname);
        const dbs = dbByHost.get(row.original.hostname) ?? [];
        const count = row.original.total_detached ?? 0;
        return (
          <>
            <span className={`text-xs ${count > 0 ? "text-yellow-600 dark:text-yellow-400" : "text-gray-600 dark:text-gray-400"}`}>
              {count}
            </span>
            {isExpanded && dbs.length > 0 && (
              <CountSubRows dbs={dbs} field="total_detached" activeColor="text-yellow-600 dark:text-yellow-400" />
            )}
          </>
        );
      },
    },

    // ── Broken ─────────────────────────────────────────────────────
    {
      accessorKey: "broken_parts",
      header: "Broken",
      size: 70,
      meta: { align: "right" as const },
      cell: ({ row }) => {
        const isExpanded = expandedHosts.has(row.original.hostname);
        const dbs = dbByHost.get(row.original.hostname) ?? [];
        const count = row.original.broken_parts ?? 0;
        return (
          <>
            <span className={`text-xs ${count > 0 ? "text-red-600 dark:text-red-400" : "text-gray-600 dark:text-gray-400"}`}>
              {count}
            </span>
            {isExpanded && dbs.length > 0 && (
              <CountSubRows dbs={dbs} field="broken_parts" activeColor="text-red-600 dark:text-red-400" />
            )}
          </>
        );
      },
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [nodeNameResolver, expandedHosts, allExpanded, dbByHost]);

  return (
    <Card className="relative overflow-hidden lg:col-span-2 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <ChartLoadingBar loading={loading} showDelayMs={0} onVisibilityChange={handleLoadingBarVisibilityChange} />
      <CardHeader className="pb-1.5 pt-2 px-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-sm text-gray-800 dark:text-white flex items-center gap-2">
              <Layers className="w-4 h-4 text-orange-600 dark:text-orange-400" />
              Parts Status by Node
            </CardTitle>
            <ChartInfo
              title="Parts Status by Node"
              description="Node → DB drill-down. Click a row to expand per-database metrics. Three queries run in parallel and are merged on the frontend."
              query={`-- [1] Node level (/parts/status)
SELECT
  hostName() AS hostname,
  countIf(active = 1) AS active_parts,
  round(sumIf(bytes_on_disk, active = 1) / 1024 / 1024 / 1024, 2) AS active_bytes_gb,
  countIf(active = 1 AND bytes_on_disk < 10*1024*1024) AS small_parts_lt_10mb,
  round(small_parts_lt_10mb / nullIf(active_parts, 0), 4) AS small_parts_ratio,
  countIf(active = 1 AND level = 0) AS level0_parts,
  round(level0_parts / nullIf(active_parts, 0), 4) AS level0_ratio,
  countIf(active = 0) AS inactive_parts,
  max(refcount) AS max_refcount,
  countIf(refcount > 1) AS parts_refcount_gt_1
FROM clusterAllReplicas(
  (SELECT cluster FROM system.clusters WHERE is_local = 1 LIMIT 1),
  system.parts
)
GROUP BY hostname
ORDER BY hostname
SETTINGS skip_unavailable_shards = 1;

-- [2] DB level (/parts/status-by-db)
SELECT
  hostName() AS hostname,
  database,
  countIf(active = 1) AS active_parts,
  uniqExactIf(concat(table, '||', partition), active = 1) AS total_partitions,
  round(
    countIf(active = 1) / nullIf(
      uniqExactIf(concat(table, '||', partition), active = 1), 0
    ), 1
  ) AS avg_parts_per_partition,
  countIf(active = 1 AND level = 0) AS level0_parts,
  round(countIf(active = 1 AND level = 0) / nullIf(countIf(active = 1), 0), 4) AS level0_ratio,
  round(
    countIf(active = 1 AND bytes_on_disk < 10485760) / nullIf(countIf(active = 1), 0), 4
  ) AS small_parts_ratio,
  countIf(active = 0) AS inactive_parts,
  uniqExact(table) AS tables
FROM clusterAllReplicas(
  (SELECT cluster FROM system.clusters WHERE is_local = 1 LIMIT 1),
  system.parts
)
WHERE database NOT IN ('system', 'information_schema', 'INFORMATION_SCHEMA')
GROUP BY hostname, database
ORDER BY hostname, active_parts DESC
SETTINGS skip_unavailable_shards = 1;

-- [3] Detached/Broken per DB (/parts/detached-by-db, merged on frontend)
SELECT
  hostName() AS hostname,
  database,
  count() AS total_detached,
  countIf(reason ILIKE '%broken%' OR reason ILIKE '%corrupt%' OR reason ILIKE '%checksum%') AS broken_parts
FROM clusterAllReplicas(
  (SELECT cluster FROM system.clusters WHERE is_local = 1 LIMIT 1),
  system.detached_parts
)
WHERE database NOT IN ('system', 'information_schema', 'INFORMATION_SCHEMA')
GROUP BY hostname, database
ORDER BY hostname, total_detached DESC
SETTINGS skip_unavailable_shards = 1;`}
              yAxisLabel="Count"
              yAxisDescription={`Avg/Partition ≥ 100: Too Many Parts risk\nLevel-0 ≥ 30%: merge is not keeping up with inserts\nPartitions ≥ 5000: reconsider partition key cardinality\nDetached/Broken: node-level total (row) + per-DB on expand (merged from query [3])`}
              aggregation="count"
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
          <PanelLoader label="Loading parts status..." />
        ) : (
          <DataTable
            columns={columns}
            data={partsStatusData}
            isLoading={false}
            emptyMessage="No parts status data available"
          />
        )}
      </CardContent>
    </Card>
  );
}
