"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Database,
  PanelLeftClose,
  Search,
  Network,
} from "lucide-react";
import { useDatabaseTables } from "./database-management/hooks/useDatabaseTables";
import { getTableTypeIcon } from "./database-management/utils";

interface DatabaseExplorerProps {
  clusterId: string;
  clusterName?: string;
  initialDatabase?: string;
  /** Show only this DB (table view of the selected DB) */
  restrictToDatabase?: string;
  onTableSelect?: (database: string, table: string) => void;
  onClose?: () => void;
}

export function DatabaseExplorer({
  clusterId,
  clusterName,
  initialDatabase,
  restrictToDatabase,
  onTableSelect,
  onClose,
}: DatabaseExplorerProps) {
  const [databaseTableSearchMap, setDatabaseTableSearchMap] = useState<Record<string, string>>({});
  const {
    searchTerm,
    setSearchTerm,
    expandedDatabases,
    selectedDatabase,
    selectedTable,
    loading,
    filteredDatabases,
    toggleDatabase,
    selectDatabase,
    selectTable,
    allTablesMap,
  } = useDatabaseTables(clusterId, clusterName, {
    fetchSelectedTableDetail: false,
    tableListMode: "names",
  });

  // Auto-expand the corresponding DB when initialDatabase changes
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

  return (
    <div className="w-full min-w-0 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg flex flex-col h-full overflow-hidden">
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2 mb-3">
          <div className="flex-1">
            <h2 className="text-gray-900 dark:text-white">Table Explorer</h2>
          </div>
          {onClose && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
              onClick={onClose}
              aria-label="Hide table explorer"
              title="Hide table explorer"
            >
              <PanelLeftClose className="w-4 h-4" aria-hidden="true" />
            </Button>
          )}
        </div>
        {!restrictToDatabase && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Search databases..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 h-9 focus-visible:ring-1 focus-visible:ring-ring/30"
            />
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-auto p-2">
        {loading ? (
          <div className="flex items-center justify-center p-8">
            <div className="text-sm text-gray-600 dark:text-gray-400">Loading databases...</div>
          </div>
        ) : (
          (restrictToDatabase
            ? filteredDatabases.filter((d) => d.name === restrictToDatabase)
            : filteredDatabases
          ).map((db) => {
            const isExpanded = expandedDatabases.has(db.name);
            const tables = allTablesMap[db.name] || [];
            const hasLoadedTables = Object.prototype.hasOwnProperty.call(allTablesMap, db.name);
            const tableSearchTerm = (databaseTableSearchMap[db.name] || "").trim().toLowerCase();
            const visibleTables = tableSearchTerm
              ? tables.filter((table) => table.name.toLowerCase().includes(tableSearchTerm))
              : tables;
            const isSelected = selectedDatabase === db.name && !selectedTable;

            /* restrictToDatabase mode: Display the table list directly without a DB header */
            if (restrictToDatabase) {
              return (
                <div key={db.name}>
                  {/* Table search */}
                  <div className="px-2 py-0.5">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                      <Input
                        placeholder="Search tables..."
                        value={databaseTableSearchMap[db.name] || ""}
                        onChange={(e) =>
                          setDatabaseTableSearchMap((prev) => ({ ...prev, [db.name]: e.target.value }))
                        }
                        className="h-7 pl-8 text-xs focus-visible:ring-1 focus-visible:ring-ring/30"
                      />
                    </div>
                  </div>
                  {!hasLoadedTables ? (
                    <div className="px-2 py-1 text-xs text-gray-500 dark:text-gray-400">Loading tables...</div>
                  ) : visibleTables.length === 0 ? (
                    <div className="px-2 py-1 text-xs text-gray-500 dark:text-gray-400">No tables found</div>
                  ) : (
                    <div className="space-y-0.5">
                      {visibleTables.map((table) => {
                        const isTableSelected = selectedDatabase === db.name && selectedTable === table.name;
                        const typeInfo = getTableTypeIcon(table.tableType);
                        const IconComp = typeInfo.icon;
                        return (
                          <button
                            key={table.name}
                            type="button"
                            className={`flex items-center gap-1.5 min-w-max px-2 py-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 dark:focus-visible:ring-slate-400 ${
                              isTableSelected ? "bg-blue-50 dark:bg-blue-900/30" : ""
                            }`}
                            onClick={(e) => {
                              e.stopPropagation();
                              selectTable(db.name, table.name);
                              onTableSelect?.(db.name, table.name);
                            }}
                          >
                            <span className={typeInfo.color}><IconComp className="w-3.5 h-3.5" aria-hidden="true" /></span>
                            <span className="text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap" title={table.name}>
                              {table.name}
                            </span>
                            {table.dependencies && table.dependencies.length > 0 && (
                              <Network className="w-3 h-3 text-gray-400" aria-hidden="true" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }

            /* Normal mode: DB header + collapsible tree */
            return (
              <div key={db.name} className="mb-1">
                <div className={`flex items-center gap-1 rounded ${isSelected ? "bg-green-50 dark:bg-green-900/30" : ""}`}>
                  <button
                    type="button"
                    className={`flex items-center gap-1 flex-1 px-1 py-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 dark:focus-visible:ring-slate-400 ${
                      isSelected ? "hover:bg-green-100 dark:hover:bg-green-900/40" : ""
                    }`}
                    onClick={() => {
                      if (!isExpanded) toggleDatabase(db.name);
                      selectDatabase(db.name);
                    }}
                  >
                    <Database className="w-4 h-4 text-green-600 dark:text-green-500" aria-hidden="true" />
                    <span className="text-sm text-gray-900 dark:text-white whitespace-nowrap" title={db.name}>
                      {db.name}
                    </span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">{db.tablesCount}</span>
                  </button>
                </div>

                {isExpanded && (
                  <div className="ml-6 mt-0.5 space-y-0.5">
                    <div className="px-2 py-0.5">
                      <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                        <Input
                          placeholder="Search tables..."
                          value={databaseTableSearchMap[db.name] || ""}
                          onChange={(e) =>
                            setDatabaseTableSearchMap((prev) => ({ ...prev, [db.name]: e.target.value }))
                          }
                          className="h-7 pl-8 text-xs focus-visible:ring-1 focus-visible:ring-ring/30"
                        />
                      </div>
                    </div>
                    {!hasLoadedTables ? (
                      <div className="px-2 py-1 text-xs text-gray-500 dark:text-gray-400">
                        Loading tables...
                      </div>
                    ) : null}

                    {visibleTables.map((table) => {
                      const isTableSelected = selectedDatabase === db.name && selectedTable === table.name;
                      const typeInfo = getTableTypeIcon(table.tableType);
                      const IconComp = typeInfo.icon;

                      return (
                        <button
                          key={table.name}
                          type="button"
                          className={`flex items-center gap-1.5 min-w-max px-2 py-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 dark:focus-visible:ring-slate-400 ${
                            isTableSelected ? "bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-900/40" : ""
                          }`}
                          onClick={(e) => {
                            e.stopPropagation();
                            selectTable(db.name, table.name);
                            onTableSelect?.(db.name, table.name);
                          }}
                        >
                          <span className={typeInfo.color}><IconComp className="w-3.5 h-3.5" aria-hidden="true" /></span>
                          <span
                            className="text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap"
                            title={table.name}
                          >
                            {table.name}
                          </span>
                          {table.dependencies && table.dependencies.length > 0 && (
                            <Network className="w-3 h-3 text-gray-400" aria-hidden="true" />
                          )}
                        </button>
                      );
                    })}

                    {hasLoadedTables && visibleTables.length === 0 ? (
                      <div className="px-2 py-1 text-xs text-gray-500 dark:text-gray-400">
                        No tables found
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            );
          })
        )}

        {filteredDatabases.length === 0 && (
          <div className="text-center py-8">
            <Database className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
            <p className="text-sm text-gray-500 dark:text-gray-400">No databases found</p>
          </div>
        )}
      </div>
    </div>
  );
}
