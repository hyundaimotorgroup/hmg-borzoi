"use client";

import { useState, useEffect } from "react";
import { logger } from "@/lib/utils/logger";
import type { DatabaseInfo, TableInfo, TableDependency } from "../types";
import { getTableType, formatBytes, formatNumber } from "../utils";

interface ApiTablePlacement {
  host_name?: string;
  host_address?: string;
  port?: string | number;
  shard_num?: string | number;
  replica_num?: string | number;
  rows?: string | number;
  total_bytes?: string | number;
  size?: string;
  parts?: string | number;
  partitions?: string | number;
}

interface ApiTableRow {
  name: string;
  engine: string;
  rows?: string | number;
  size?: string;
  parts?: string | number;
  partitions?: string | number;
  total_bytes?: string | number;
  shard_count?: string | number;
  replica_count?: string | number;
  node_count?: string | number;
  placements?: ApiTablePlacement[];
  columns?: Array<{
    name?: string;
    type?: string;
    position?: string | number;
    default_kind?: string;
    default_expression?: string;
    comment?: string;
    dataCompressedBytes?: number;
    dataUncompressedBytes?: number;
  }>;
  ddl?: string;
  partition_key?: string;
  sorting_key?: string;
  primary_key?: string;
  engine_full?: string;
  dependencies_database?: string[];
  dependencies_table?: string[];
}

interface ApiTableDetailResponse {
  table?: ApiTableRow | null;
}

interface ApiTablesListResponse {
  tables?: ApiTableRow[];
}

type TableListMode = "summary" | "names";

interface UseDatabaseTablesOptions {
  fetchSelectedTableDetail?: boolean;
  tableListMode?: TableListMode;
}

/**
 * Parses the (database, table) pair out of a Distributed engine's engine_full
 * string, e.g. "Distributed('cluster', 'db', 'table')". Grabs the parenthesized
 * argument list as one unambiguous chunk first, then splits on commas, avoiding
 * the backtracking-prone overlap of a single regex with adjacent `'?...'?\s*`.
 */
function parseDistributedEngineFull(engineFull: string): { db: string; table: string } | null {
  const inner = engineFull.match(/Distributed\s*\(([^)]*)\)/i)?.[1];
  if (!inner) return null;

  const args = inner.split(",").map((arg) => arg.trim().replaceAll(/(?:^'|'$)/g, ""));
  if (args.length < 3) return null;

  return { db: args[1], table: args[2] };
}

/**
 * Builds dependencies from structured columns in system.tables.
 *
 * - View / MaterializedView: uses the dependencies_database + dependencies_table arrays
 * - Distributed: parses "Distributed(cluster, db, table, ...)" from engine_full
 */
function buildDependencies(
  engine: string,
  engineFull: string,
  depDatabases: string[],
  depTables: string[],
  currentDb: string,
): TableDependency[] {
  const tableType = getTableType(engine);
  const deps: TableDependency[] = [];

  if (tableType === "Distributed") {
    // engine_full example: Distributed('cluster', 'db', 'local_table', rand())
    const parsed = parseDistributedEngineFull(engineFull);
    if (parsed?.table) {
      deps.push({
        database: parsed.db || currentDb,
        table: parsed.table,
        type: "source",
        relationshipType: "distributed_to_local",
      });
    }
    return deps;
  }

  if (
    (tableType === "View" || tableType === "MaterializedView") &&
    Array.isArray(depDatabases) &&
    Array.isArray(depTables)
  ) {
    const relType =
      tableType === "MaterializedView" ? "materialized_view_to_table" : "view_to_table";
    depDatabases.forEach((db, i) => {
      const tbl = depTables[i];
      if (tbl) {
        deps.push({ database: db || currentDb, table: tbl, type: "source", relationshipType: relType });
      }
    });
    return deps;
  }

  return deps;
}

function mapApiTableToSummary(database: string, table: ApiTableRow): TableInfo {
  return {
    name: table.name,
    engine: table.engine,
    tableType: getTableType(table.engine),
    rows: formatNumber(table.rows),
    rowsRaw: Number(table.rows) || 0,
    size: table.size || formatBytes(table.total_bytes),
    parts: Number(table.parts) || 0,
    partitions: Number(table.partitions) || 0,
    totalBytes: Number(table.total_bytes) || 0,
    shardCount: Number(table.shard_count) || 0,
    replicaCount: Number(table.replica_count) || 0,
    nodeCount: Number(table.node_count) || 0,
    placements: [],
    columns: [],
    ddl: table.ddl,
    partitionKey: table.partition_key,
    sortingKey: table.sorting_key,
    primaryKey: table.primary_key,
    dependencies: buildDependencies(
      table.engine || "",
      table.engine_full || "",
      Array.isArray(table.dependencies_database) ? table.dependencies_database : [],
      Array.isArray(table.dependencies_table) ? table.dependencies_table : [],
      database,
    ),
  };
}

function mapApiTableToDetail(database: string, table: ApiTableRow): TableInfo {
  return {
    ...mapApiTableToSummary(database, table),
    placements: Array.isArray(table.placements)
      ? table.placements.map((placement) => ({
          hostName: placement.host_name || "",
          hostAddress: placement.host_address || "",
          port: Number(placement.port) || 0,
          shardNum: Number(placement.shard_num) || 0,
          replicaNum: Number(placement.replica_num) || 0,
          rows: Number(placement.rows) || 0,
          totalBytes: Number(placement.total_bytes) || 0,
          size: placement.size || formatBytes(placement.total_bytes),
          parts: Number(placement.parts) || 0,
          partitions: Number(placement.partitions) || 0,
        }))
      : [],
    columns: Array.isArray(table.columns)
      ? table.columns.map((column) => ({
          name: column.name || "",
          type: column.type || "",
          position: Number(column.position) || 0,
          defaultKind: column.default_kind || "",
          defaultExpression: column.default_expression || "",
          comment: column.comment || "",
          dataCompressedBytes: Number(column.dataCompressedBytes) || 0,
          dataUncompressedBytes: Number(column.dataUncompressedBytes) || 0,
        }))
      : [],
  };
}

export function useDatabaseTables(
  clusterId: string,
  clusterName?: string,
  options?: UseDatabaseTablesOptions,
) {
  const fetchSelectedTableDetail = options?.fetchSelectedTableDetail ?? true;
  const tableListMode = options?.tableListMode ?? "summary";
  const [searchTerm, setSearchTerm] = useState("");
  const [tableSearchTerm, setTableSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("overview");
  const [expandedDatabases, setExpandedDatabases] = useState<Set<string>>(new Set());
  const [selectedDatabase, setSelectedDatabase] = useState<string | null>(null);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [databases, setDatabases] = useState<DatabaseInfo[]>([]);
  const [tablesMap, setTablesMap] = useState<{ [key: string]: TableInfo[] }>({});
  const [tableDetailsMap, setTableDetailsMap] = useState<{ [key: string]: TableInfo }>({});
  const [loading, setLoading] = useState(true);
  const [selectedTableLoading, setSelectedTableLoading] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;

    async function fetchDatabases() {
      try {
        const url = clusterName
          ? `/api/clusters/${clusterId}/databases?cluster=${encodeURIComponent(clusterName)}`
          : `/api/clusters/${clusterId}/databases`;
        const response = await fetch(url, { signal });
        if (!response.ok) {
          const errorData = await response
            .json()
            .catch(() => ({ error: "Failed to fetch databases" }));
          throw new Error(
            (errorData as { error?: string; details?: string }).error ||
              (errorData as { details?: string }).details ||
              "Failed to fetch databases"
          );
        }

        const data = await response.json();
        const formattedDatabases: DatabaseInfo[] = (
          (data as { databases?: Record<string, string>[] }).databases || []
        ).map((db) => ({
          name: db.name,
          engine: db.engine || "Atomic",
          tablesCount: parseInt(db.tables) || 0,
          totalSize: db.total_size || "0 B",
        }));

        setDatabases(formattedDatabases);
      } catch (error) {
        if ((error as Error).name === 'AbortError') return;
        logger.error("Error fetching databases:", error);
        setDatabases([]);
      } finally {
        setLoading(false);
      }
    }

    void fetchDatabases();
    return () => controller.abort(new DOMException('Component unmounted', 'AbortError'));
  }, [clusterId, clusterName]);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;

    async function fetchTables(database: string) {
      if (!database || tablesMap[database]) return;

      try {
        const modeQuery = tableListMode === "names" ? "&mode=names" : "";
        const url = clusterName
          ? `/api/clusters/${clusterId}/databases/${database}/tables?cluster=${encodeURIComponent(clusterName)}${modeQuery}`
          : `/api/clusters/${clusterId}/databases/${database}/tables?mode=${tableListMode === "names" ? "names" : "summary"}`;
        const response = await fetch(url, { signal });
        if (!response.ok) {
          const errorData = await response
            .json()
            .catch(() => ({ error: "Failed to fetch tables" }));
          throw new Error(
            (errorData as { error?: string; details?: string }).error ||
              (errorData as { details?: string }).details ||
              "Failed to fetch tables"
          );
        }

        const data = (await response.json()) as ApiTablesListResponse;
        const formattedTables: TableInfo[] = (
          data.tables || []
        ).map((table) => mapApiTableToSummary(database, table));

        setTablesMap((prev) => ({ ...prev, [database]: formattedTables }));
      } catch (error) {
        if ((error as Error).name === 'AbortError') return;
        logger.error("Error fetching tables:", error);
        setTablesMap((prev) => ({ ...prev, [database]: [] }));
      }
    }

    const targets = [...(selectedDatabase ? [selectedDatabase] : []), ...expandedDatabases];
    void Promise.all(targets.map(fetchTables));
    return () => controller.abort(new DOMException('Component unmounted', 'AbortError'));
  }, [clusterId, clusterName, selectedDatabase, expandedDatabases, tablesMap, tableListMode]);

  useEffect(() => {
    if (!fetchSelectedTableDetail) {
      setSelectedTableLoading(false);
      return;
    }
    if (!selectedDatabase || !selectedTable) {
      setSelectedTableLoading(false);
      return;
    }

    const detailKey = `${selectedDatabase}.${selectedTable}`;
    if (tableDetailsMap[detailKey]) return;

    const controller = new AbortController();
    const { signal } = controller;

    async function fetchTableDetail() {
      setSelectedTableLoading(true);
      try {
        const url = clusterName
          ? `/api/clusters/${clusterId}/databases/${selectedDatabase}/tables?cluster=${encodeURIComponent(clusterName)}&table=${encodeURIComponent(selectedTable!)}`
          : `/api/clusters/${clusterId}/databases/${selectedDatabase}/tables?table=${encodeURIComponent(selectedTable!)}`;
        const response = await fetch(url, { signal });
        if (!response.ok) {
          const errorData = await response
            .json()
            .catch(() => ({ error: "Failed to fetch table details" }));
          throw new Error(
            (errorData as { error?: string; details?: string }).error ||
              (errorData as { details?: string }).details ||
              "Failed to fetch table details",
          );
        }

        const data = (await response.json()) as ApiTableDetailResponse;
        if (!data.table) {
          logger.warn(`Table detail not found for ${detailKey}`);
          return;
        }

        setTableDetailsMap((prev) => ({
          ...prev,
          [detailKey]: mapApiTableToDetail(selectedDatabase!, data.table as ApiTableRow),
        }));
      } catch (error) {
        if ((error as Error).name === 'AbortError') return;
        logger.error("Error fetching table detail:", error);
      } finally {
        setSelectedTableLoading(false);
      }
    }

    void fetchTableDetail();
    return () => controller.abort(new DOMException('Component unmounted', 'AbortError'));
  }, [clusterId, clusterName, selectedDatabase, selectedTable, tableDetailsMap, fetchSelectedTableDetail]);

  const filteredDatabases = databases.filter((db) =>
    db.name.toLowerCase().includes(searchTerm.trim().toLowerCase())
  );

  const toggleDatabase = (dbName: string) => {
    const newExpanded = new Set(expandedDatabases);
    if (newExpanded.has(dbName)) {
      newExpanded.delete(dbName);
    } else {
      newExpanded.add(dbName);
    }
    setExpandedDatabases(newExpanded);
  };

  const selectDatabase = (dbName: string) => {
    if (selectedDatabase === dbName && !selectedTable) {
      setExpandedDatabases((prev) => {
        const next = new Set(prev);
        next.delete(dbName);
        return next;
      });
      setSelectedDatabase(null);
      setSelectedTable(null);
      setTableSearchTerm("");
      return;
    }

    setExpandedDatabases((prev) => {
      if (prev.has(dbName)) return prev;
      const next = new Set(prev);
      next.add(dbName);
      return next;
    });
    setSelectedDatabase(dbName);
    setSelectedTable(null);
    setTableSearchTerm("");
  };

  const selectTable = (dbName: string, tableName: string) => {
    setSelectedDatabase(dbName);
    setSelectedTable(tableName);
    setActiveTab("overview");
  };

  const selectedDbInfo = selectedDatabase
    ? databases.find((d) => d.name === selectedDatabase)
    : null;

  const selectedTables = selectedDatabase
    ? tablesMap[selectedDatabase] || []
    : [];

  const selectedTableSummary = selectedTable
    ? selectedTables.find((t) => t.name === selectedTable) || null
    : null;

  const selectedTableInfo = selectedTable
    ? tableDetailsMap[`${selectedDatabase}.${selectedTable}`] || null
    : null;

  const allTablesMap = tablesMap;

  return {
    searchTerm,
    setSearchTerm,
    tableSearchTerm,
    setTableSearchTerm,
    activeTab,
    setActiveTab,
    expandedDatabases,
    selectedDatabase,
    selectedTable,
    databases,
    loading,
    filteredDatabases,
    toggleDatabase,
    selectDatabase,
    selectTable,
    selectedDbInfo,
    selectedTables,
    selectedTableSummary,
    selectedTableInfo,
    selectedTableLoading,
    allTablesMap,
  };
}
