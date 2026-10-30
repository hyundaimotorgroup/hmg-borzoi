"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Database,
  Table,
  ArrowLeft,
  Search,
  SlidersHorizontal,
  HardDrive,
  ChevronRight,
  Layers,
  Network,
  BarChart2,
  ArrowRight,
  Key,
  Code,
  Package,
  Server,
  MapPin,
} from "lucide-react";
import type { DatabaseTableManagementProps } from "./database-management/types";
import type { TableTypeFilter } from "./database-management/types";
import {
  formatNumber,
  formatDDL,
  getTableType,
  getTableTypeIcon,
  getTableTypeBadgeVariant,
  isLogicalObjectTableType,
} from "./database-management/utils";
import { useDatabaseTables } from "./database-management/hooks/useDatabaseTables";
import { TableLineageTab } from "./database-management/TableLineageTab";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import {
  buildLineageDependencies,
  buildLineageUrl,
  collectReverseLineageDependencies,
  getLineageRelationshipLabel,
  type LineageRow,
} from "./database-management/lineage";

interface TableNavigationHistoryEntry {
  database: string;
  table: string;
  activeTab: string;
}

interface ApiSummaryTableRow {
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
  dependencies_database?: string[];
  dependencies_table?: string[];
}

interface ApiSummaryTablesResponse {
  tables?: ApiSummaryTableRow[];
  pagination?: {
    total?: number;
    limit?: number;
    offset?: number;
    returned?: number;
    hasMore?: boolean;
    nextOffset?: number | null;
  };
}

const SUMMARY_PAGE_SIZE = 30;

const TABLE_TYPE_FILTER_OPTIONS: Array<{
  value: TableTypeFilter;
  label: string;
}> = [
  { value: "all", label: "All" },
  { value: "local", label: "Local" },
  { value: "distributed", label: "Dist" },
  { value: "materializedView", label: "MV" },
  { value: "view", label: "View" },
];

function getTableTypeFilterLabel(filter: TableTypeFilter): string {
  return TABLE_TYPE_FILTER_OPTIONS.find((option) => option.value === filter)?.label ?? "All";
}

export function DatabaseTableManagement({ clusterId, clusterName, actualClusterName, initialDatabase, externalNavigateTo }: DatabaseTableManagementProps) {
  const {
    activeTab,
    setActiveTab,
    expandedDatabases,
    selectedDatabase,
    selectedTable,
    loading,
    filteredDatabases,
    toggleDatabase,
    selectDatabase,
    selectTable,
    selectedDbInfo,
    selectedTableSummary,
    selectedTableInfo,
    selectedTableLoading,
    allTablesMap,
  } = useDatabaseTables(clusterId, actualClusterName, { tableListMode: "names" });

  // Auto-expand if initialDatabase is provided after load
  const autoExpandedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!initialDatabase || loading || filteredDatabases.length === 0) return;
    if (autoExpandedRef.current === initialDatabase) return;
    autoExpandedRef.current = initialDatabase;
    if (!expandedDatabases.has(initialDatabase)) {
      toggleDatabase(initialDatabase);
    }
    selectDatabase(initialDatabase);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialDatabase, loading, filteredDatabases.length]);

  const [lineageRows, setLineageRows] = useState<LineageRow[]>([]);
  const [lineageLoading, setLineageLoading] = useState(false);
  const [lineageError, setLineageError] = useState<string | null>(null);
  const [tableNavigationHistory, setTableNavigationHistory] = useState<TableNavigationHistoryEntry[]>([]);
  const [summaryTables, setSummaryTables] = useState<ApiSummaryTableRow[]>([]);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryPage, setSummaryPage] = useState(1);
  const [summaryTotal, setSummaryTotal] = useState(0);
  const [summaryTableSearch, setSummaryTableSearch] = useState("");
  const [databaseTableTypeFilterMap, setDatabaseTableTypeFilterMap] = useState<Record<string, TableTypeFilter>>({});
  const selectedDatabaseTableTypeFilter = selectedDatabase
    ? databaseTableTypeFilterMap[selectedDatabase] || "all"
    : "all";

  useEffect(() => {
    setSummaryPage(1);
  }, [selectedDatabase, selectedDatabaseTableTypeFilter, summaryTableSearch]);

  useEffect(() => {
    let cancelled = false;

    async function fetchSummaryTables() {
      if (!selectedDatabase || selectedTable) {
        if (!cancelled) {
          setSummaryLoading(false);
        }
        return;
      }

      try {
        if (!cancelled) {
          setSummaryLoading(true);
        }

        const offset = (summaryPage - 1) * SUMMARY_PAGE_SIZE;
        const params = new URLSearchParams({
          limit: String(SUMMARY_PAGE_SIZE),
          offset: String(offset),
        });
        if (actualClusterName) {
          params.set("cluster", actualClusterName);
        }
        if (selectedDatabaseTableTypeFilter !== "all") {
          params.set("tableType", selectedDatabaseTableTypeFilter);
        }
        if (summaryTableSearch.trim()) {
          params.set("search", summaryTableSearch.trim());
        }

        const url = `/api/clusters/${clusterId}/databases/${selectedDatabase}/tables?${params.toString()}`;
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error("Failed to fetch summary tables");
        }

        const data = await response.json() as ApiSummaryTablesResponse;
        if (!cancelled) {
          setSummaryTables(Array.isArray(data.tables) ? data.tables : []);
          setSummaryTotal(Number(data.pagination?.total ?? 0));
          setSummaryLoading(false);
        }
      } catch {
        if (!cancelled) {
          setSummaryTables([]);
          setSummaryTotal(0);
          setSummaryLoading(false);
        }
      }
    }

    void fetchSummaryTables();

    return () => {
      cancelled = true;
    };
  }, [actualClusterName, clusterId, selectedDatabase, selectedDatabaseTableTypeFilter, selectedTable, summaryPage, summaryTableSearch]);

  const totalSummaryPages = Math.max(1, Math.ceil(summaryTotal / SUMMARY_PAGE_SIZE));
  const summaryStart = summaryTotal === 0 ? 0 : (summaryPage - 1) * SUMMARY_PAGE_SIZE + 1;
  const summaryEnd = summaryTotal === 0 ? 0 : Math.min(summaryPage * SUMMARY_PAGE_SIZE, summaryTotal);

  useEffect(() => {
    let cancelled = false;

    async function fetchLineage() {
      if (!selectedDatabase || !selectedTable) {
        if (!cancelled) {
          setLineageRows([]);
          setLineageLoading(false);
          setLineageError(null);
        }
        return;
      }

      try {
        if (!cancelled) {
          setLineageRows([]);
          setLineageLoading(true);
          setLineageError(null);
        }

        const lineageUrl = buildLineageUrl(clusterId, selectedDatabase, selectedTable, actualClusterName);
        const response = await fetch(lineageUrl);
        if (!response.ok) {
          throw new Error("Failed to fetch lineage");
        }
        const data = await response.json() as { nodes?: LineageRow[] };
        if (!cancelled) {
          setLineageRows(Array.isArray(data.nodes) ? data.nodes : []);
          setLineageLoading(false);
        }
      } catch (error) {
        if (!cancelled) {
          setLineageRows([]);
          setLineageLoading(false);
          setLineageError(error instanceof Error ? error.message : "Failed to fetch lineage");
        }
      }
    }

    void fetchLineage();
    return () => {
      cancelled = true;
    };
  }, [actualClusterName, clusterId, selectedDatabase, selectedTable]);

  const logicalLineageRows = useMemo(() => {
    const byTable = new Map<string, LineageRow>();
    lineageRows.forEach((row) => {
      const key = `${row.database}.${row.name}`;
      if (!byTable.has(key)) {
        byTable.set(key, row);
      }
    });
    return [...byTable.values()];
  }, [lineageRows]);

  const knownLineageTableKeys = useMemo(
    () => new Set(logicalLineageRows.map((row) => `${row.database}.${row.name}`)),
    [logicalLineageRows],
  );

  const navigateToTable = (
    database: string,
    table: string,
    options?: { preserveCurrent?: boolean },
  ) => {
    const preserveCurrent = options?.preserveCurrent ?? true;
    const isSameSelection = selectedDatabase === database && selectedTable === table;

    if (
      preserveCurrent &&
      selectedDatabase &&
      selectedTable &&
      !isSameSelection
    ) {
      setTableNavigationHistory((prev) => {
        const currentEntry = {
          database: selectedDatabase,
          table: selectedTable,
          activeTab,
        };
        const lastEntry = prev[prev.length - 1];
        if (
          lastEntry &&
          lastEntry.database === currentEntry.database &&
          lastEntry.table === currentEntry.table &&
          lastEntry.activeTab === currentEntry.activeTab
        ) {
          return prev;
        }
        return [...prev, currentEntry];
      });
    }

    selectTable(database, table);
  };

  const prevExternalNonceRef = useRef(-1);
  useEffect(() => {
    if (!externalNavigateTo) return;
    if (externalNavigateTo.nonce === prevExternalNonceRef.current) return;
    prevExternalNonceRef.current = externalNavigateTo.nonce;
    selectTable(externalNavigateTo.database, externalNavigateTo.table);
  }, [externalNavigateTo, selectTable]);

  const navigateBackToPreviousTable = () => {
    if (tableNavigationHistory.length === 0) {
      if (selectedDatabase) {
        selectDatabase(selectedDatabase);
      }
      return;
    }

    setTableNavigationHistory((prev) => {
      const previous = prev[prev.length - 1];
      if (!previous) return prev;
      selectTable(previous.database, previous.table);
      setActiveTab(previous.activeTab);
      return prev.slice(0, -1);
    });
  };


  return (
    <div className="flex bg-gray-50 dark:bg-gray-900">
      {/* Content area */}
      <div className="flex-1">
        {selectedTable ? (
          <div className="p-6 space-y-6">
            <div>
              <div className="flex items-center gap-3">
                {tableNavigationHistory.length > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={navigateBackToPreviousTable}
                    className="gap-1"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Previous
                  </Button>
                )}
                {tableNavigationHistory.length === 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={navigateBackToPreviousTable}
                    className="gap-1"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Tables
                  </Button>
                )}
                {(() => {
                  const typeInfo = getTableTypeIcon((selectedTableInfo ?? selectedTableSummary)?.tableType || "MergeTree");
                  const IconComp = typeInfo.icon;
                  return <span className={typeInfo.color}><IconComp className="w-6 h-6" /></span>;
                })()}
                <h1 className="text-2xl text-gray-900 dark:text-white">{selectedTable}</h1>
                {(selectedTableInfo ?? selectedTableSummary) && (
                  <Badge variant={getTableTypeBadgeVariant((selectedTableInfo ?? selectedTableSummary)?.tableType || "MergeTree")}>
                    {(selectedTableInfo ?? selectedTableSummary)?.tableType}
                  </Badge>
                )}
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Database: <span className="text-green-600 dark:text-green-500">{selectedDatabase}</span> • Cluster: {clusterName}
              </p>
              {selectedTableInfo?.description && (
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 italic">{selectedTableInfo.description}</p>
              )}
            </div>

            {selectedTableLoading || !selectedTableInfo ? (
              <Card>
                <CardContent className="p-10 text-center text-sm text-gray-600 dark:text-gray-400">
                  Loading table details...
                </CardContent>
              </Card>
            ) : (() => {
              const lineageSelectedRow = logicalLineageRows.find(
                (row) => row.database === selectedDatabase && row.name === selectedTableInfo.name,
              );
              const effectiveDependencies = (
                lineageSelectedRow
                  ? buildLineageDependencies(lineageSelectedRow, selectedDatabase ?? "")
                  : (selectedTableInfo.dependencies ?? [])
              ).filter((dep) => knownLineageTableKeys.has(`${dep.database}.${dep.table}`));
              const reverseDeps = collectReverseLineageDependencies(
                logicalLineageRows,
                selectedDatabase ?? "",
                selectedTableInfo.name,
              );
              const relatedDependencies = [
                ...effectiveDependencies.map((dep) => ({
                  key: `forward:${dep.database}.${dep.table}:${dep.relationshipType}:${dep.type}`,
                  database: dep.database,
                  table: dep.table,
                  tableType: allTablesMap[dep.database]?.find((table) => table.name === dep.table)?.tableType,
                  direction: "upstream" as const,
                  description: getLineageRelationshipLabel(dep.relationshipType, dep.type, "forward"),
                })),
                ...reverseDeps.map((dep) => ({
                  key: `reverse:${dep.database}.${dep.table}:${dep.relationshipType}:${dep.dependencyType}`,
                  database: dep.database,
                  table: dep.table,
                  tableType: allTablesMap[dep.database]?.find((table) => table.name === dep.table)?.tableType ?? dep.tableType,
                  direction: dep.relationshipType === "materialized_view_to_table" && dep.dependencyType === "target"
                    ? "upstream" as const
                    : "downstream" as const,
                  description: getLineageRelationshipLabel(dep.relationshipType, dep.dependencyType, "reverse"),
                })),
              ];

              const hasDeps = effectiveDependencies.length > 0 || reverseDeps.length > 0;
              const hasKeys = !!(selectedTableInfo.partitionKey || selectedTableInfo.sortingKey || selectedTableInfo.primaryKey);
              const hasPlacements = selectedTableInfo.placements.length > 0;
              const isLogicalObject = isLogicalObjectTableType(selectedTableInfo.tableType);
              const hasStorageMetrics = !isLogicalObject && (selectedTableInfo.parts > 0 || selectedTableInfo.partitions > 0);
              const hasColumns = selectedTableInfo.columns.length > 0;
              const topologyLabel =
                isLogicalObject
                  ? `${selectedTableInfo.nodeCount} node(s) definition`
                  : selectedTableInfo.shardCount > 0 && selectedTableInfo.replicaCount > 0
                  ? `${selectedTableInfo.shardCount} shard(s) x ${selectedTableInfo.replicaCount} replica(s)`
                  : `${selectedTableInfo.nodeCount} node(s)`;

              return (
                <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-2">
                  <TabsList>
                    <TabsTrigger value="overview">Overview</TabsTrigger>
                    <TabsTrigger value="ddl">DDL</TabsTrigger>
                    {hasKeys && <TabsTrigger value="keys">Keys</TabsTrigger>}
                    {hasDeps && <TabsTrigger value="dependencies">Dependencies</TabsTrigger>}
                    {hasPlacements && <TabsTrigger value="placement">Placement</TabsTrigger>}
                    <TabsTrigger value="lineage">Lineage</TabsTrigger>
                  </TabsList>

                  <TabsContent value="overview" className="mt-4">
                    <div className="space-y-4">
                      <div className="overflow-x-auto">
                        <div className="grid min-w-[1080px] grid-cols-5 gap-3">
                          <Card><CardContent className="p-4 flex flex-col justify-center"><div className="flex items-center gap-2 text-blue-600"><BarChart2 className="w-4 h-4" /><span className="text-xs uppercase tracking-wide">Cluster Rows</span></div><p className="mt-3 text-2xl text-gray-900 dark:text-white leading-tight">{isLogicalObject ? "N/A" : selectedTableInfo.rows}</p></CardContent></Card>
                          <Card><CardContent className="p-4 flex flex-col justify-center"><div className="flex items-center gap-2 text-green-600"><HardDrive className="w-4 h-4" /><span className="text-xs uppercase tracking-wide">Cluster Size</span></div><p className="mt-3 text-2xl text-gray-900 dark:text-white leading-tight">{isLogicalObject ? "N/A" : selectedTableInfo.size}</p></CardContent></Card>
                          <Card><CardContent className="p-4 flex flex-col justify-center"><div className="flex items-center gap-2 text-amber-600"><Server className="w-4 h-4" /><span className="text-xs uppercase tracking-wide">{isLogicalObject ? "Defined On" : "Coverage"}</span></div><p className="mt-3 text-2xl text-gray-900 dark:text-white leading-tight">{selectedTableInfo.nodeCount}</p><p className="mt-1 text-xs text-gray-500 dark:text-gray-400">node(s)</p></CardContent></Card>
                          <Card><CardContent className="p-4 flex flex-col justify-center"><div className="flex items-center gap-2 text-violet-600"><Layers className="w-4 h-4" /><span className="text-xs uppercase tracking-wide">{isLogicalObject ? "Placement" : "Topology"}</span></div><p className="mt-3 text-lg text-gray-900 dark:text-white leading-tight">{topologyLabel}</p></CardContent></Card>
                          <Card><CardContent className="p-4 flex flex-col justify-center"><div className="flex items-center gap-2 text-orange-600"><Package className="w-4 h-4" /><span className="text-xs uppercase tracking-wide">{isLogicalObject ? "Storage" : "Active Parts"}</span></div><p className="mt-3 text-2xl text-gray-900 dark:text-white leading-tight">{hasStorageMetrics ? formatNumber(selectedTableInfo.parts) : "N/A"}</p><p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{hasStorageMetrics ? `${selectedTableInfo.partitions} unique partition(s)` : isLogicalObject ? "logical object only" : "no active parts"}</p></CardContent></Card>
                        </div>
                      </div>
                      <Card className="dark:!bg-slate-800">
                        <CardContent className="p-4">
                          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
                            <div><p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Table Name</p><p className="text-sm font-mono text-gray-900 dark:text-white break-all">{selectedTableInfo.name}</p></div>
                            <div><p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Engine</p><Badge variant="secondary" className="text-xs">{selectedTableInfo.engine}</Badge></div>
                            <div>
                              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Table Type</p>
                              {(() => {
                                const typeInfo = getTableTypeIcon(selectedTableInfo.tableType);
                                const IconComp = typeInfo.icon;
                                return (
                                  <div className="flex items-center gap-1.5">
                                    <span className={typeInfo.color}><IconComp className="w-3.5 h-3.5" /></span>
                                    <Badge variant={getTableTypeBadgeVariant(selectedTableInfo.tableType)} className="text-xs">{selectedTableInfo.tableType}</Badge>
                                  </div>
                                );
                              })()}
                            </div>
                            <div><p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{isLogicalObject ? "Definition Coverage" : "Placement Coverage"}</p><p className="text-sm text-gray-900 dark:text-white">{isLogicalObject ? `Defined on ${selectedTableInfo.nodeCount} node(s)` : `${selectedTableInfo.nodeCount} nodes across ${selectedTableInfo.shardCount} shard(s)`}</p></div>
                          </div>
                          <div className="mt-4 rounded-lg border border-dashed border-gray-200 bg-gray-50/70 px-3 py-2 text-xs text-gray-600 dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-300">
                            {isLogicalObject
                              ? <>This object is defined across nodes. Shard and replica placement indicates where the definition exists, not where physical data is stored.</>
                              : <>Cluster-wide totals are aggregated across every node returned by <code>clusterAllReplicas</code>. Per-node placement remains available in the <code>Placement</code> tab.</>}
                          </div>
                        </CardContent>
                      </Card>
                      {hasColumns && (() => {
                        const totalUncompressed = selectedTableInfo.columns.reduce(
                          (sum, c) => sum + (c.dataUncompressedBytes ?? 0), 0
                        );
                        const fmtBytes = (b: number) => {
                          if (b >= 1073741824) return `${(b / 1073741824).toFixed(2)} GB`;
                          if (b >= 1048576) return `${(b / 1048576).toFixed(2)} MB`;
                          if (b >= 1024) return `${(b / 1024).toFixed(2)} KB`;
                          return `${b} B`;
                        };
                        return (
                          <Card>
                            <CardHeader>
                              <CardTitle className="flex items-center gap-2">
                                <Code className="w-5 h-5 text-slate-600" />
                                Column Information
                                <Badge variant="outline" className="ml-2 text-xs">{selectedTableInfo.columns.length} columns</Badge>
                              </CardTitle>
                            </CardHeader>
                            <CardContent>
                              <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                  <thead>
                                    <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-slate-800">
                                      <th className="text-left py-2 px-3 text-gray-700 dark:text-gray-300">#</th>
                                      <th className="text-left py-2 px-3 text-gray-700 dark:text-gray-300">Column</th>
                                      <th className="text-left py-2 px-3 text-gray-700 dark:text-gray-300">Type</th>
                                      <th className="text-left py-2 px-3 text-gray-700 dark:text-gray-300">Size</th>
                                      <th className="text-left py-2 px-3 text-gray-700 dark:text-gray-300">Size%</th>
                                      <th className="text-left py-2 px-3 text-gray-700 dark:text-gray-300">Compression</th>
                                      <th className="text-left py-2 px-3 text-gray-700 dark:text-gray-300">Default</th>
                                      <th className="text-left py-2 px-3 text-gray-700 dark:text-gray-300">Comment</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {selectedTableInfo.columns.map((column) => {
                                      const uncompressed = column.dataUncompressedBytes ?? 0;
                                      const compressed = column.dataCompressedBytes ?? 0;
                                      const pct = totalUncompressed > 0
                                        ? ((uncompressed / totalUncompressed) * 100).toFixed(1)
                                        : null;
                                      const ratio = uncompressed > 0 && compressed > 0
                                        ? ((1 - compressed / uncompressed) * 100).toFixed(1)
                                        : null;
                                      return (
                                        <tr key={column.name} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-slate-800/50">
                                          <td className="py-2 px-3 text-xs font-mono text-gray-400 dark:text-gray-500">{column.position || "-"}</td>
                                          <td className="py-2 px-3 font-mono text-sm text-gray-900 dark:text-white whitespace-nowrap">{column.name}</td>
                                          <td className="py-2 px-3"><Badge variant="secondary" className="font-mono text-xs whitespace-nowrap">{column.type}</Badge></td>
                                          <td className="py-2 px-3 text-xs text-gray-600 dark:text-gray-300 whitespace-nowrap">
                                            {totalUncompressed === 0 ? <span className="text-gray-400">N/A</span> : fmtBytes(uncompressed)}
                                          </td>
                                          <td className="py-2 px-3 text-xs whitespace-nowrap">
                                            {totalUncompressed === 0 ? <span className="text-gray-400">N/A</span> : <span className="text-blue-600 dark:text-blue-400">{pct !== null ? `${pct}%` : "0%"}</span>}
                                          </td>
                                          <td className="py-2 px-3 text-xs whitespace-nowrap">
                                            {totalUncompressed === 0 ? <span className="text-gray-400">N/A</span> : <span className="text-emerald-600 dark:text-emerald-400">{ratio !== null ? `${ratio}%` : "0%"}</span>}
                                          </td>
                                          <td className="py-2 px-3 text-xs text-gray-600 dark:text-gray-300 whitespace-nowrap">
                                            {column.defaultKind
                                              ? `${column.defaultKind}${column.defaultExpression ? ` ${column.defaultExpression}` : ""}`
                                              : "-"}
                                          </td>
                                          <td className="py-2 px-3 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">{column.comment || "-"}</td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })()}
                    </div>
                  </TabsContent>

                  <TabsContent value="ddl" className="mt-4">
                    <Card>
                      <CardHeader><CardTitle className="flex items-center gap-2"><Code className="w-5 h-5 text-gray-600" />DDL (Data Definition Language)</CardTitle></CardHeader>
                      <CardContent>
                        {selectedTableInfo.ddl ? (
                          <pre className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 overflow-x-auto text-xs font-mono text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-700 leading-relaxed">{formatDDL(selectedTableInfo.ddl)}</pre>
                        ) : (
                          <p className="text-sm text-gray-500 italic">No DDL available for this table.</p>
                        )}
                      </CardContent>
                    </Card>
                  </TabsContent>

                  {hasKeys && (
                    <TabsContent value="keys" className="mt-4">
                      <Card>
                        <CardHeader><CardTitle className="flex items-center gap-2"><Key className="w-5 h-5 text-amber-600" />Indexes &amp; Keys</CardTitle></CardHeader>
                        <CardContent>
                          <div className="space-y-3">
                            <div className="flex items-start justify-between py-2 border-b border-gray-100 dark:border-gray-700"><span className="text-sm text-gray-600 dark:text-gray-400">Engine</span><Badge variant="secondary">{selectedTableInfo.engine}</Badge></div>
                            {selectedTableInfo.partitionKey && (<div className="flex items-start justify-between py-2 border-b border-gray-100 dark:border-gray-700"><span className="text-sm text-gray-600 dark:text-gray-400">Partition Key</span><code className="rounded bg-gray-50 px-2 py-1 text-sm font-mono text-gray-900 dark:bg-gray-800 dark:text-gray-100">{selectedTableInfo.partitionKey}</code></div>)}
                            {selectedTableInfo.sortingKey && (<div className="flex items-start justify-between py-2 border-b border-gray-100 dark:border-gray-700"><span className="text-sm text-gray-600 dark:text-gray-400">Sorting Key (ORDER BY)</span><code className="rounded bg-gray-50 px-2 py-1 text-sm font-mono text-gray-900 dark:bg-gray-800 dark:text-gray-100">{selectedTableInfo.sortingKey}</code></div>)}
                            {selectedTableInfo.primaryKey && (<div className="flex items-start justify-between py-2 border-b border-gray-100 dark:border-gray-700"><span className="text-sm text-gray-600 dark:text-gray-400">Primary Key</span><code className="rounded bg-gray-50 px-2 py-1 text-sm font-mono text-gray-900 dark:bg-gray-800 dark:text-gray-100">{selectedTableInfo.primaryKey}</code></div>)}
                            {selectedTableInfo.projects && selectedTableInfo.projects.length > 0 && (
                              <div className="flex items-start justify-between py-2">
                                <span className="text-sm text-gray-600 dark:text-gray-400">Projection Columns</span>
                                <div className="flex flex-wrap gap-1 justify-end max-w-md">
                                  {selectedTableInfo.projects.map((col) => <Badge key={col} variant="outline" className="text-xs">{col}</Badge>)}
                                </div>
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    </TabsContent>
                  )}

                  {hasDeps && (
                    <TabsContent value="dependencies" className="mt-4 space-y-4">
                      <Card>
                        <CardHeader><CardTitle className="flex items-center gap-2"><Network className="w-5 h-5 text-blue-600" />Dependencies</CardTitle></CardHeader>
                        <CardContent className="dark:!bg-slate-800">
                          <div className="space-y-3">
                            <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">Upstream sources and downstream views, distributed tables, or materialized views related to this table.</p>
                            {relatedDependencies.map((dependency) => {
                              const typeInfo = dependency.tableType ? getTableTypeIcon(dependency.tableType) : null;
                              const IconComp = typeInfo?.icon;
                              const toneClass = dependency.direction === "upstream"
                                ? "bg-slate-50 hover:bg-slate-100 border-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 dark:border-slate-700"
                                : "bg-slate-50 hover:bg-slate-100 border-purple-200 dark:bg-slate-900 dark:hover:bg-slate-800 dark:border-slate-700";
                              const arrowClass = dependency.direction === "upstream"
                                ? "text-gray-400 dark:text-gray-500"
                                : "text-purple-400 dark:text-purple-500";

                              return (
                                <button
                                  key={dependency.key}
                                  type="button"
                                  className={`appearance-none flex items-center justify-between w-full p-3 rounded-lg transition-colors border text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 dark:focus-visible:ring-slate-400 ${toneClass}`}
                                  onClick={() => navigateToTable(dependency.database, dependency.table)}
                                >
                                  <div className="flex items-center gap-3">
                                    <ArrowRight className={`w-4 h-4 ${arrowClass}`} aria-hidden="true" />
                                    {typeInfo && IconComp ? (
                                      <span className={typeInfo.color}><IconComp className="w-3.5 h-3.5" aria-hidden="true" /></span>
                                    ) : null}
                                    <div>
                                      <div className="flex items-center gap-2">
                                        <span className="text-gray-900 dark:text-white">{dependency.database}.{dependency.table}</span>
                                        <Badge
                                          variant={dependency.direction === "upstream" ? "secondary" : "outline"}
                                          className={`text-[10px] uppercase ${
                                            dependency.direction === "upstream"
                                              ? "dark:bg-slate-800 dark:text-slate-200"
                                              : "border-purple-300 text-purple-700 dark:border-purple-700 dark:bg-purple-900/30 dark:text-purple-200"
                                          }`}
                                        >
                                          {dependency.direction}
                                        </Badge>
                                        {dependency.tableType && (
                                          <Badge variant="outline" className="text-xs dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700">
                                            {dependency.tableType}
                                          </Badge>
                                        )}
                                      </div>
                                      <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{dependency.description}</p>
                                    </div>
                                  </div>
                                  <ChevronRight className={`w-4 h-4 ${arrowClass}`} aria-hidden="true" />
                                </button>
                              );
                            })}
                          </div>
                        </CardContent>
                      </Card>
                    </TabsContent>
                  )}

                  {hasPlacements && (
                    <TabsContent value="placement" className="mt-4">
                      <Card className="dark:!bg-slate-800">
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2">
                            <MapPin className="w-5 h-5 text-emerald-600" />
                            {isLogicalObject ? "Definition Placement" : "Node Placement"}
                            <Badge variant="outline" className="ml-2 text-xs">{selectedTableInfo.nodeCount} nodes</Badge>
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          {isLogicalObject && (
                            <p className="mb-4 text-xs text-gray-600 dark:text-gray-400">
                              These shard and replica values show where the object definition is available. They do not represent persisted data distribution.
                            </p>
                          )}
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="border-b border-gray-200 dark:border-gray-700">
                                  <th className="text-left py-2 px-3 text-gray-700 dark:text-gray-300">Host</th>
                                  <th className="text-left py-2 px-3 text-gray-700 dark:text-gray-300">Address</th>
                                  <th className="text-center py-2 px-3 text-gray-700 dark:text-gray-300">Shard</th>
                                  <th className="text-center py-2 px-3 text-gray-700 dark:text-gray-300">Replica</th>
                                  <th className="text-right py-2 px-3 text-gray-700 dark:text-gray-300">Rows</th>
                                  <th className="text-right py-2 px-3 text-gray-700 dark:text-gray-300">Size</th>
                                  <th className="text-right py-2 px-3 text-gray-700 dark:text-gray-300">Parts</th>
                                  <th className="text-right py-2 px-3 text-gray-700 dark:text-gray-300">Partitions</th>
                                </tr>
                              </thead>
                              <tbody>
                                {selectedTableInfo.placements.map((placement) => (
                                  <tr key={`${placement.hostName}-${placement.shardNum}-${placement.replicaNum}`} className="border-b border-gray-100 dark:border-gray-800">
                                    <td className="py-3 px-3">
                                      <div className="flex flex-col">
                                        <span className="text-gray-900 dark:text-white">{placement.hostName}</span>
                                        {placement.port > 0 && <span className="text-xs text-gray-500 dark:text-gray-400">port {placement.port}</span>}
                                      </div>
                                    </td>
                                    <td className="py-3 px-3 font-mono text-xs text-gray-600 dark:text-gray-300">{placement.hostAddress || "-"}</td>
                                    <td className="py-3 px-3 text-center"><Badge variant="outline">S{placement.shardNum || "-"}</Badge></td>
                                    <td className="py-3 px-3 text-center"><Badge variant="secondary">R{placement.replicaNum || "-"}</Badge></td>
                                    <td className="py-3 px-3 text-right font-mono text-gray-900 dark:text-white">{isLogicalObject ? "N/A" : formatNumber(placement.rows)}</td>
                                    <td className="py-3 px-3 text-right font-mono text-gray-900 dark:text-white">{isLogicalObject ? "N/A" : placement.size}</td>
                                    <td className="py-3 px-3 text-right">{isLogicalObject ? <span className="text-gray-400 text-xs">N/A</span> : placement.parts > 0 ? <Badge variant={placement.parts > 100 ? "destructive" : "outline"}>{placement.parts}</Badge> : <span className="text-gray-400 text-xs">0</span>}</td>
                                    <td className="py-3 px-3 text-right font-mono text-gray-900 dark:text-white">{isLogicalObject ? "N/A" : placement.partitions}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </CardContent>
                      </Card>
                    </TabsContent>
                  )}

                  {selectedDatabase && (
                    <TabsContent value="lineage" className="mt-4">
                      <TableLineageTab
                        clusterId={clusterId}
                        database={selectedDatabase}
                        tableName={selectedTableInfo.name}
                        clusterName={actualClusterName}
                        prefetchedRows={lineageRows}
                        prefetchedLoading={lineageLoading}
                        prefetchedError={lineageError}
                      />
                    </TabsContent>
                  )}
                </Tabs>
              );
            })()}
          </div>
        ) : selectedDatabase && selectedDbInfo ? (
          <div className="p-6 space-y-6">
            <div>
              <div className="flex items-center gap-2">
                <Database className="w-8 h-8 text-green-600" />
                <h1 className="text-2xl text-gray-900 dark:text-white">{selectedDbInfo.name}</h1>
              </div>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">Cluster: {clusterName} • {selectedDbInfo.tablesCount} tables</p>
            </div>
              <Card className="dark:!bg-slate-800">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Table className="w-5 h-5 text-green-600" />
                    Tables ({summaryStart}-{summaryEnd} / {summaryTotal})
                  </CardTitle>
                </div>
                <div className="flex items-center gap-2 pt-2">
                  <div className="relative flex-1 max-w-sm">
                    <Search className="absolute top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" style={{ left: 10 }} />
                    <Input
                      placeholder="Search tables..."
                      value={summaryTableSearch}
                      onChange={(e) => setSummaryTableSearch(e.target.value)}
                      className="h-9"
                      style={{ paddingLeft: 34 }}
                    />
                  </div>
                  <Select
                    value={selectedDatabaseTableTypeFilter}
                    onValueChange={(value) =>
                      setDatabaseTableTypeFilterMap((prev) => ({
                        ...prev,
                        ...(selectedDatabase ? { [selectedDatabase]: value as TableTypeFilter } : {}),
                      }))
                    }
                  >
                    <SelectTrigger className="h-9 w-[120px] px-2 text-sm">
                      <div className="flex items-center gap-1.5 truncate">
                        <SlidersHorizontal className="h-3.5 w-3.5 text-gray-400" />
                        <span className="truncate">{getTableTypeFilterLabel(selectedDatabaseTableTypeFilter)}</span>
                      </div>
                    </SelectTrigger>
                    <SelectContent>
                      {TABLE_TYPE_FILTER_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value} className="text-sm">
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent>
                {summaryLoading ? (
                  <div className="py-10 text-center text-sm text-gray-500">Loading tables...</div>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-gray-200">
                            <th className="text-left py-3 px-4 text-gray-700">Table Name</th>
                            <th className="text-left py-3 px-4 text-gray-700">Type</th>
                            <th className="text-left py-3 px-4 text-gray-700">Engine</th>
                            <th className="text-right py-3 px-4 text-gray-700">Cluster Rows</th>
                            <th className="text-right py-3 px-4 text-gray-700">Cluster Size</th>
                            <th className="text-center py-3 px-4 text-gray-700">Shards</th>
                            <th className="text-center py-3 px-4 text-gray-700">Replicas</th>
                            <th className="text-center py-3 px-4 text-gray-700">Nodes</th>
                            <th className="text-right py-3 px-4 text-gray-700">Parts</th>
                            <th className="text-center py-3 px-4 text-gray-700">Dependencies</th>
                          </tr>
                        </thead>
                        <tbody>
                          {summaryTables.map((table) => {
                            const tableType = getTableType(table.engine);
                            const typeInfo = getTableTypeIcon(tableType);
                            const IconComp = typeInfo.icon;
                            const dependencyCount = Array.isArray(table.dependencies_table) ? table.dependencies_table.length : 0;
                            return (
                              <tr
                                key={table.name}
                                className="cursor-pointer border-b border-gray-100 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gray-900 dark:focus-visible:ring-slate-400"
                                tabIndex={0}
                                onClick={() => navigateToTable(selectedDatabase, table.name)}
                                onKeyDown={(e: KeyboardEvent<HTMLTableRowElement>) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    navigateToTable(selectedDatabase, table.name);
                                  }
                                }}
                              >
                                <td className="py-4 px-4"><div className="flex items-center gap-2"><span className={typeInfo.color}><IconComp className="w-3.5 h-3.5" /></span><span className="text-gray-900 dark:text-white">{table.name}</span></div></td>
                                <td className="py-4 px-4"><Badge variant={getTableTypeBadgeVariant(tableType)} className="text-xs">{tableType}</Badge></td>
                                <td className="py-4 px-4"><Badge variant="secondary" className="text-xs">{table.engine}</Badge></td>
                                <td className="py-4 px-4 text-right font-mono text-sm">{isLogicalObjectTableType(tableType) ? "N/A" : formatNumber(table.rows)}</td>
                                <td className="py-4 px-4 text-right font-mono text-sm">{isLogicalObjectTableType(tableType) ? "N/A" : (table.size || "-")}</td>
                                <td className="py-4 px-4 text-center">{isLogicalObjectTableType(tableType) ? <span className="text-gray-400 text-xs">Def</span> : <Badge variant="outline">{Number(table.shard_count) || 0}</Badge>}</td>
                                <td className="py-4 px-4 text-center">{isLogicalObjectTableType(tableType) ? <span className="text-gray-400 text-xs">Def</span> : <Badge variant="secondary">{Number(table.replica_count) || 0}</Badge>}</td>
                                <td className="py-4 px-4 text-center"><Badge variant="outline">{Number(table.node_count) || 0}</Badge></td>
                                <td className="py-4 px-4 text-right">{!isLogicalObjectTableType(tableType) ? <Badge variant={(Number(table.parts) || 0) > 100 ? "destructive" : "outline"}>{Number(table.parts) || 0}</Badge> : <span className="text-gray-400 text-xs">N/A</span>}</td>
                                <td className="py-4 px-4 text-center">{dependencyCount > 0 ? <div className="flex items-center justify-center gap-1"><Network className="w-3.5 h-3.5 text-blue-600" /><span className="text-xs text-gray-600 dark:text-gray-300">{dependencyCount}</span></div> : <span className="text-gray-400 text-xs">-</span>}</td>
                              </tr>
                            );
                          })}
                          {summaryTables.length === 0 && (
                            <tr>
                              <td colSpan={11} className="py-10 text-center text-sm text-gray-500">
                                {summaryTableSearch.trim() || selectedDatabaseTableTypeFilter !== "all"
                                  ? "No tables match current search/filter"
                                  : "No tables found"}
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                    <div className="mt-4 flex items-center justify-between">
                      <p className="text-xs text-gray-500">
                        Showing {summaryStart}-{summaryEnd} of {summaryTotal}
                      </p>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setSummaryPage((prev) => Math.max(1, prev - 1))}
                          disabled={summaryPage === 1}
                        >
                          Previous
                        </Button>
                        <span className="text-sm text-gray-600">
                          Page {summaryPage} / {totalSummaryPages}
                        </span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setSummaryPage((prev) => Math.min(totalSummaryPages, prev + 1))}
                          disabled={summaryPage >= totalSummaryPages}
                        >
                          Next
                        </Button>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="flex h-full flex-col p-6">
            <div className="flex flex-1 items-center justify-center">
              <div className="text-center">
                <Database className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg text-gray-900 mb-2">Select a Database</h3>
                <p className="text-sm text-gray-600">Choose a database from the left sidebar to view details</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
