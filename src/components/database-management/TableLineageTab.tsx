"use client";

import { useEffect, useMemo, useState } from "react";
import { useTheme } from "next-themes";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Position,
  Handle,
  type Node,
  type Edge,
  type NodeProps,
  BackgroundVariant,
  MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  Network, Eye, Cpu, Table, Copy, RefreshCw, BarChart2, TrendingUp,
  ServerIcon, Loader2,
} from "lucide-react";
import { getTableType } from "./utils";
import type { TableType } from "./types";
import { buildLineageDependencies, buildLineageUrl, normalizeDependencyRef, type LineageRow } from "./lineage";

// ─────────────────────────────────────────────
// Styles by table type
// ─────────────────────────────────────────────
const TYPE_CFG: Record<TableType, {
  bg: string; border: string; text: string; badge: string; icon: React.ElementType;
}> = {
  Distributed:          { bg: "bg-purple-50 dark:bg-purple-900/30",    border: "border-purple-300 dark:border-purple-600",    text: "text-purple-700 dark:text-purple-300",    badge: "bg-purple-100 text-purple-800 dark:bg-purple-800/40 dark:text-purple-200",   icon: Network },
  MaterializedView:     { bg: "bg-amber-50 dark:bg-amber-900/30",       border: "border-amber-300 dark:border-amber-600",       text: "text-amber-700 dark:text-amber-300",      badge: "bg-amber-100 text-amber-800 dark:bg-amber-800/40 dark:text-amber-200",     icon: Cpu },
  View:                 { bg: "bg-cyan-50 dark:bg-cyan-900/30",          border: "border-cyan-300 dark:border-cyan-600",          text: "text-cyan-700 dark:text-cyan-300",         badge: "bg-cyan-100 text-cyan-800 dark:bg-cyan-800/40 dark:text-cyan-200",       icon: Eye },
  ReplicatedMergeTree:  { bg: "bg-blue-50 dark:bg-blue-900/30",         border: "border-blue-300 dark:border-blue-600",          text: "text-blue-700 dark:text-blue-300",         badge: "bg-blue-100 text-blue-800 dark:bg-blue-800/40 dark:text-blue-200",       icon: Copy },
  ReplacingMergeTree:   { bg: "bg-green-50 dark:bg-green-900/30",       border: "border-green-300 dark:border-green-600",        text: "text-green-700 dark:text-green-300",       badge: "bg-green-100 text-green-800 dark:bg-green-800/40 dark:text-green-200",   icon: RefreshCw },
  AggregatingMergeTree: { bg: "bg-indigo-50 dark:bg-indigo-900/30",     border: "border-indigo-300 dark:border-indigo-600",      text: "text-indigo-700 dark:text-indigo-300",     badge: "bg-indigo-100 text-indigo-800 dark:bg-indigo-800/40 dark:text-indigo-200", icon: BarChart2 },
  SummingMergeTree:     { bg: "bg-rose-50 dark:bg-rose-900/30",          border: "border-rose-300 dark:border-rose-600",          text: "text-rose-700 dark:text-rose-300",         badge: "bg-rose-100 text-rose-800 dark:bg-rose-800/40 dark:text-rose-200",       icon: TrendingUp },
  MergeTree:            { bg: "bg-gray-50 dark:bg-gray-800",             border: "border-gray-300 dark:border-gray-600",          text: "text-gray-700 dark:text-gray-300",         badge: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200",         icon: Table },
};

const NODE_COLORS: Record<TableType, string> = {
  Distributed: "#a855f7", MaterializedView: "#f59e0b", View: "#06b6d4",
  ReplicatedMergeTree: "#3b82f6", ReplacingMergeTree: "#22c55e",
  AggregatingMergeTree: "#6366f1", SummingMergeTree: "#f43f5e", MergeTree: "#6b7280",
};

const EDGE_CFG: Record<string, { stroke: string; label: string; dash?: string }> = {
  distributed_to_local:             { stroke: "#a855f7", label: "Local -> Distributed" },
  view_reads_from_table:            { stroke: "#06b6d4", label: "Table -> View", dash: "6 4" },
  materialized_view_reads_from:     { stroke: "#f59e0b", label: "Table -> MatView", dash: "6 4" },
  materialized_view_writes_to:      { stroke: "#ef4444", label: "MatView -> Target" },
};

// ─────────────────────────────────────────────
// Custom node — table card
// ─────────────────────────────────────────────
interface TableNodeData extends Record<string, unknown> {
  label: string;
  database: string;
  tableType: TableType;
  rows: string;
  size: string;
  coverageLabel: string;
  isFocus: boolean;
}

function TableNode({ data }: NodeProps<Node<TableNodeData>>) {
  const cfg = TYPE_CFG[data.tableType] ?? TYPE_CFG.MergeTree;
  const Icon = cfg.icon;
  return (
    <div className={`
      rounded-xl border-2 shadow-sm min-w-[170px] max-w-[220px] cursor-default
      ${cfg.bg} ${cfg.border}
      ${data.isFocus ? "ring-2 ring-offset-2 ring-blue-500 shadow-md scale-105 dark:ring-offset-slate-950" : ""}
    `}>
      <Handle type="target" position={Position.Left}  className="!w-2.5 !h-2.5 !border-2 !border-white !bg-gray-400 dark:!border-slate-950 dark:!bg-slate-300" />
      <div className="px-3 py-2">
        <div className="flex items-start gap-1.5">
          <Icon className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${cfg.text}`} />
          <div className="min-w-0">
            <p className={`text-xs truncate ${cfg.text}`}>{data.label}</p>
            <p className="text-[10px] text-gray-400 dark:text-gray-300 truncate">{data.database}</p>
          </div>
        </div>
        <div className="mt-1 flex flex-wrap gap-1">
          <span className={`rounded px-1.5 py-0.5 text-[9px] ${cfg.badge}`}>
            {data.tableType}
          </span>
        </div>
        {(data.rows !== "0" || data.size) && (
          <p className="mt-1 text-[10px] text-gray-400 dark:text-gray-300 truncate">
            {data.rows !== "0" && `${data.rows} rows`}
            {data.size && data.size !== "0 B" && ` · ${data.size}`}
          </p>
        )}
        <p className="mt-1 text-[10px] text-gray-400 dark:text-gray-300 truncate">{data.coverageLabel}</p>
      </div>
      <Handle type="source" position={Position.Right} className="!w-2.5 !h-2.5 !border-2 !border-white !bg-gray-400 dark:!border-slate-950 dark:!bg-slate-300" />
    </div>
  );
}
const nodeTypes = { tableNode: TableNode };

// ─────────────────────────────────────────────
// Layout constants
// ─────────────────────────────────────────────
const NODE_W  = 225;
const NODE_H  = 85;
const ROW_GAP = 24;
const COL_GAP = 160;

// ─────────────────────────────────────────────
// Dependency build (engine_full + depDatabases/depTables)
// ─────────────────────────────────────────────
type RelType =
  | "distributed_to_local"
  | "view_reads_from_table"
  | "materialized_view_reads_from"
  | "materialized_view_writes_to";

interface Dep { database: string; table: string; relType: RelType }

interface SemanticEdge {
  source: string;
  target: string;
  relType: RelType;
}

// ─────────────────────────────────────────────
// Node and edge computation
// ─────────────────────────────────────────────
function buildGraph(
  allRows: LineageRow[],
  focusTable: string,
  focusDb: string,
): { nodes: Node[]; edges: Edge[] } {
  if (allRows.length === 0) return { nodes: [], edges: [] };

  const tableMap = new Map<string, {
    rows: LineageRow[];
    hostNames: Set<string>;
  }>();
  allRows.forEach((r) => {
    const key = `${r.database}.${r.name}`;
    const existing = tableMap.get(key);
    if (!existing) {
      tableMap.set(key, {
        rows: [r],
        hostNames: new Set([r.hostName]),
      });
      return;
    }
    existing.rows.push(r);
    existing.hostNames.add(r.hostName);
  });

  const groupMeta = new Map<string, {
    tableType: TableType;
    rows: LineageRow[];
    hostNames: string[];
    representativeRow: LineageRow;
  }>();

  tableMap.forEach(({ rows, hostNames }, key) => {
    const firstRow = rows[0];
    const tableType = getTableType(firstRow.engine);
    const hosts = Array.from(hostNames).sort((a, b) => a.localeCompare(b));
    const representativeRow =
      rows.find((row) => row.rows !== "0" || (row.size !== "0 B" && row.size !== "0.00 B")) ?? firstRow;
    groupMeta.set(key, { tableType, rows, hostNames: hosts, representativeRow });
  });

  const edgeSet = new Set<string>();
  const edgeList: Edge[] = [];
  const semanticEdges: SemanticEdge[] = [];

  groupMeta.forEach(({ rows }, key) => {
    const sourceRow = rows[0];
    const deps: Dep[] = buildLineageDependencies(sourceRow, focusDb).map((dep) => {
      let relType: RelType = "view_reads_from_table";

      if (dep.relationshipType === "distributed_to_local") {
        relType = "distributed_to_local";
      } else if (dep.relationshipType === "materialized_view_to_table") {
        relType = dep.type === "target"
          ? "materialized_view_writes_to"
          : "materialized_view_reads_from";
      }

      return {
        database: dep.database,
        table: dep.table,
        relType,
      };
    });
    deps.forEach((dep) => {
      const cfg = EDGE_CFG[dep.relType] ?? { stroke: "#94a3b8", label: dep.relType };
      const normalized = normalizeDependencyRef(dep.database, dep.table, focusDb);
      const candidateKeys = [
        `${normalized.database}.${normalized.table}`,
        `${dep.database}.${dep.table}`,
      ];
      const targetKey = candidateKeys.find((candidate) => groupMeta.has(candidate));
      if (!targetKey) return;

      const displaySourceKey =
        dep.relType === "materialized_view_writes_to"
          ? key
          : targetKey;
      const displayTargetKey =
        dep.relType === "materialized_view_writes_to"
          ? targetKey
          : key;

      const semanticEdgeKey = `${displaySourceKey}→${displayTargetKey}::${dep.relType}`;
      if (edgeSet.has(semanticEdgeKey)) return;
      edgeSet.add(semanticEdgeKey);

      semanticEdges.push({
        source: displaySourceKey,
        target: displayTargetKey,
        relType: dep.relType,
      });

      edgeList.push({
        id: `e-${semanticEdgeKey}`,
        source: displaySourceKey,
        target: displayTargetKey,
        label: cfg.label,
        labelStyle: { fontSize: 10, fontWeight: 600, fill: cfg.stroke },
        labelShowBg: true,
        labelBgStyle: { fill: "white", fillOpacity: 0.85 },
        labelBgPadding: [4, 2],
        labelBgBorderRadius: 4,
        style: { stroke: cfg.stroke, strokeWidth: 2, ...(cfg.dash ? { strokeDasharray: cfg.dash } : {}) },
        markerEnd: { type: MarkerType.ArrowClosed, color: cfg.stroke },
        type: "smoothstep",
        animated: true,
      });
    });
  });

  const nodes: Node[] = [];
  const orderedTables = Array.from(groupMeta.entries())
    .map(([key, meta]) => ({
      key,
      database: meta.representativeRow.database,
      name: meta.representativeRow.name,
      tableType: meta.tableType,
      rows: meta.representativeRow.rows,
      size: meta.representativeRow.size,
      coverageLabel: `defined on ${meta.hostNames.length} node(s)`,
    }))
    .sort((a, b) => {
      if (a.database !== b.database) return a.database.localeCompare(b.database);
      const aFocus = a.name === focusTable && a.database === focusDb;
      const bFocus = b.name === focusTable && b.database === focusDb;
      if (aFocus && !bFocus) return -1;
      if (!aFocus && bFocus) return 1;
      if (a.name !== b.name) return a.name.localeCompare(b.name);
      return a.key.localeCompare(b.key);
    });

  const outgoing = new Map<string, SemanticEdge[]>();
  const incoming = new Map<string, SemanticEdge[]>();
  semanticEdges.forEach((edge) => {
    const out = outgoing.get(edge.source) ?? [];
    out.push(edge);
    outgoing.set(edge.source, out);

    const inc = incoming.get(edge.target) ?? [];
    inc.push(edge);
    incoming.set(edge.target, inc);
  });

  const focusKey = `${focusDb}.${focusTable}`;

  const levels = new Map<string, number>([[focusKey, 0]]);

  const computeDirectionalDistances = (
    seeds: string[],
    step: (nodeId: string) => string[],
  ): Map<string, number> => {
    const distances = new Map<string, number>();
    const queue: Array<{ nodeId: string; distance: number }> = seeds.map((nodeId) => ({ nodeId, distance: 0 }));
    seeds.forEach((nodeId) => distances.set(nodeId, 0));

    while (queue.length > 0) {
      const current = queue.shift()!;
      const nextDistance = current.distance + 1;

      step(current.nodeId).forEach((nextNodeId) => {
        const existing = distances.get(nextNodeId);
        if (existing !== undefined && existing <= nextDistance) return;
        distances.set(nextNodeId, nextDistance);
        queue.push({ nodeId: nextNodeId, distance: nextDistance });
      });
    }

    return distances;
  };

  const forwardDistances = computeDirectionalDistances(
    [focusKey],
    (nodeId) => (outgoing.get(nodeId) ?? []).map((edge) => edge.target),
  );
  const reverseDistances = computeDirectionalDistances(
    [focusKey],
    (nodeId) => (incoming.get(nodeId) ?? []).map((edge) => edge.source),
  );

  orderedTables.forEach((table) => {
    const forwardDistance = forwardDistances.get(table.key);
    const reverseDistance = reverseDistances.get(table.key);

    if (forwardDistance === 0 || reverseDistance === 0) {
      levels.set(table.key, 0);
      return;
    }

    if (forwardDistance !== undefined && reverseDistance !== undefined) {
      if (forwardDistance < reverseDistance) {
        levels.set(table.key, reverseDistance);
        return;
      }
      if (reverseDistance < forwardDistance) {
        levels.set(table.key, -forwardDistance);
        return;
      }

      const outgoingCount = (outgoing.get(table.key) ?? []).length;
      const incomingCount = (incoming.get(table.key) ?? []).length;
      levels.set(table.key, incomingCount >= outgoingCount ? -forwardDistance : reverseDistance);
      return;
    }

    if (forwardDistance !== undefined) {
      levels.set(table.key, reverseDistance ?? (forwardDistance > 0 ? 1 : 0));
      return;
    }

    if (reverseDistance !== undefined) {
      levels.set(table.key, -reverseDistance);
    }
  });

  const fallbackLevel =
    (levels.has(focusKey)
      ? Math.max(0, ...Array.from(levels.values()).map((value) => Math.abs(value)))
      : 0) + 1;

  orderedTables.forEach((table) => {
    if (!levels.has(table.key)) {
      levels.set(table.key, fallbackLevel);
    }
  });

  const levelGroups = new Map<number, typeof orderedTables>();
  orderedTables.forEach((table) => {
    const level = levels.get(table.key) ?? fallbackLevel;
    const group = levelGroups.get(level) ?? [];
    group.push(table);
    levelGroups.set(level, group);
  });

  const sortedLevels = Array.from(levelGroups.keys()).sort((a, b) => a - b);
  const maxRowsInColumn = Math.max(
    1,
    ...Array.from(levelGroups.values()).map((tables) => tables.length),
  );

  sortedLevels.forEach((level, colIdx) => {
    const tables = (levelGroups.get(level) ?? []).sort((a, b) => {
      if (a.database !== b.database) return a.database.localeCompare(b.database);
      if (a.name !== b.name) return a.name.localeCompare(b.name);
      return a.key.localeCompare(b.key);
    });
    const colX = colIdx * (NODE_W + COL_GAP);
    const startY = ((maxRowsInColumn - tables.length) * (NODE_H + ROW_GAP)) / 2;

    tables.forEach((table, rowIdx) => {
      const isFocus = table.database === focusDb && table.name === focusTable;

      nodes.push({
        id: table.key,
        type: "tableNode",
        position: {
          x: colX,
          y: startY + rowIdx * (NODE_H + ROW_GAP),
        },
        data: {
          label: table.name,
          database: table.database,
          tableType: table.tableType,
          rows: table.rows,
          size: table.size,
          coverageLabel: table.coverageLabel,
          isFocus,
        } as TableNodeData,
      });
    });
  });

  return { nodes, edges: edgeList };
}

// ─────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────
interface TableLineageTabProps {
  clusterId: string;
  database: string;
  tableName: string;
  clusterName?: string;
  prefetchedRows?: LineageRow[];
  prefetchedLoading?: boolean;
  prefetchedError?: string | null;
}

export function TableLineageTab({
  clusterId,
  database,
  tableName,
  clusterName,
  prefetchedRows,
  prefetchedLoading,
  prefetchedError,
}: TableLineageTabProps) {
  const { resolvedTheme } = useTheme();
  const [allRows, setAllRows]   = useState<LineageRow[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);

  useEffect(() => {
    const usesPrefetchedData =
      prefetchedRows !== undefined ||
      prefetchedLoading !== undefined ||
      prefetchedError !== undefined;

    if (usesPrefetchedData) {
      setAllRows(prefetchedRows ?? []);
      setLoading(Boolean(prefetchedLoading));
      setError(prefetchedError ?? null);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    const lineageUrl = buildLineageUrl(clusterId, database, tableName, clusterName);
    fetch(lineageUrl, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json()).error ?? res.statusText);
        return res.json() as Promise<{ nodes: LineageRow[] }>;
      })
      .then(({ nodes }) => {
        if (!controller.signal.aborted) {
          setAllRows(nodes);
        }
      })
      .catch((e: unknown) => {
        if (controller.signal.aborted) return;
        setError(String(e instanceof Error ? e.message : e));
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [clusterId, database, tableName, clusterName, prefetchedRows, prefetchedLoading, prefetchedError]);

  const { nodes, edges } = useMemo(
    () => buildGraph(allRows, tableName, database),
    [allRows, tableName, database]
  );

  // ── Loading / Error ──
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-2">
        <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
        <p className="text-sm text-gray-500">Fetching table information from all nodes...</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center px-6">
        <Network className="w-10 h-10 text-red-300 mb-2" />
        <p className="text-sm text-red-500">{error}</p>
      </div>
    );
  }
  if (allRows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <Network className="w-12 h-12 text-gray-300 dark:text-gray-600 mb-3" />
        <p className="text-sm text-gray-500">No tables found in this database.</p>
      </div>
    );
  }

  const hostCount  = new Set(allRows.map((r) => r.hostName)).size;
  const tableCount = new Set(allRows.map((r) => `${r.database}.${r.name}`)).size;

  return (
    <div className="space-y-3">
      {/* Summary + Legend */}
      <div className="flex flex-wrap items-center gap-3 px-1">
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <ServerIcon className="w-3.5 h-3.5" />
          <span>{hostCount} physical nodes</span>
          <span className="text-gray-300">·</span>
          <Table className="w-3.5 h-3.5" />
          <span>{tableCount} logical tables</span>
        </div>
        <div className="flex flex-wrap gap-3 ml-auto">
          {Object.entries(EDGE_CFG).map(([key, val]) => (
            <div key={key} className="flex items-center gap-1">
              <div className="w-5 h-0.5" style={{ backgroundColor: val.stroke }} />
              <span className="text-[10px] text-gray-400">{val.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* React Flow canvas */}
      <div
        className="overflow-hidden rounded-xl border border-gray-200 bg-gray-50 dark:!border-slate-700 dark:!bg-slate-950 [&_.react-flow]:dark:!bg-slate-950 [&_.react-flow__renderer]:dark:!bg-slate-950 [&_.react-flow__viewport]:dark:!bg-slate-950 [&_.react-flow__pane]:dark:!bg-slate-950 [&_.react-flow__background]:dark:!bg-slate-950 [&_.react-flow__node]:!bg-transparent [&_.react-flow__node]:!border-0 [&_.react-flow__node]:!shadow-none [&_.react-flow__node]:dark:!bg-transparent [&_.react-flow__controls]:dark:!border-slate-700 [&_.react-flow__controls]:dark:!bg-slate-900 [&_.react-flow__controls-button]:dark:!border-slate-700 [&_.react-flow__controls-button]:dark:!bg-slate-900 [&_.react-flow__controls-button]:dark:!text-gray-200 [&_.react-flow__minimap]:dark:!bg-slate-900 [&_.react-flow__minimap-svg]:dark:!bg-slate-900 [&_.react-flow__minimap-mask]:dark:!fill-slate-950 [&_.react-flow__minimap-node]:dark:!stroke-slate-200"
        style={{ height: 520 }}
      >
        <ReactFlow
          className="bg-gray-50 dark:!bg-slate-950"
          colorMode={resolvedTheme === "dark" ? "dark" : "light"}
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.25 }}
          minZoom={0.2}
          maxZoom={2}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={16} size={1} className="text-gray-200 dark:text-gray-700" />
          <Controls showInteractive={false} />
          <MiniMap
            nodeColor={(n) => {
              if (n.type === "hostNode") return "#cbd5e1";
              const t = (n.data as TableNodeData).tableType as TableType;
              return NODE_COLORS[t] ?? "#6b7280";
            }}
            className="!bg-white dark:!bg-slate-900 !border-gray-200 dark:!border-slate-700"
          />
        </ReactFlow>
      </div>
    </div>
  );
}
