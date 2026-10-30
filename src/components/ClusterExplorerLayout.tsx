"use client";

import { useMemo, useState } from "react";
import { useSelectedCluster } from "@/contexts/SelectedClusterContext";
import { Database as DatabaseIcon, Network, PanelLeftOpen, RefreshCw, Server } from "lucide-react";
import { DatabaseExplorer } from "@/components/DatabaseExplorer";
import { DatabaseSelector } from "@/components/DatabaseSelector";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useClusters } from "@/components/user-management/hooks/useClusters";
import type { ClusterOption } from "@/components/user-management/types";

function getPhysicalClusterName(option: ClusterOption): string {
  if (!option.isLogical) return option.name;
  return option.displayName.split(" → ")[0] ?? option.displayName;
}

function getClusterFamilyName(option: ClusterOption): string {
  return getPhysicalClusterName(option).replace(/-(stg|stage|staging)$/i, "");
}

function getClusterEnvironmentRank(option: ClusterOption): number {
  const env = option.environment?.toLowerCase();
  if (env === "prod") return 0;
  if (env === "staging") return 1;
  if (env === "dev") return 2;
  if (/(?:-(?:stg|stage|staging))$/i.test(getPhysicalClusterName(option))) return 1;
  if (/(?:-dev)$/i.test(getPhysicalClusterName(option))) return 2;
  return 0;
}

export function getPhysicalClusterId(option: ClusterOption): string {
  if (option.isLogical) return option.physicalClusterId ?? "";
  return option.id.replace(/^physical:/, "");
}

export interface ClusterExplorerChildProps {
  clusterId: string;
  clusterName: string | undefined;
  selectedDatabase: string;
  selectedOptionId: string;
  resolvedOption: ClusterOption | null;
  refreshNonce: number;
}

interface ClusterExplorerLayoutProps {
  /** whether to show content only after a DB is selected */
  requireDatabase?: boolean;
  /** whether to show the left Table Explorer sidebar */
  showExplorer?: boolean;
  onTableSelect?: (database: string, table: string) => void;
  onRefresh?: () => void;
  refreshing?: boolean;
  children: (props: ClusterExplorerChildProps & { onReset: () => void }) => React.ReactNode;
}

export function ClusterExplorerLayout({
  requireDatabase = false,
  showExplorer = false,
  onTableSelect,
  onRefresh,
  refreshing = false,
  children,
}: ClusterExplorerLayoutProps) {
  const { setSelectedClusterId } = useSelectedCluster();
  const { clusterOptions } = useClusters();

  const sortedClusterOptions = useMemo(
    () =>
      [...clusterOptions].sort((l, r) => {
        const fc = getClusterFamilyName(l).localeCompare(getClusterFamilyName(r), undefined, { numeric: true, sensitivity: "base" });
        if (fc !== 0) return fc;
        const ec = getClusterEnvironmentRank(l) - getClusterEnvironmentRank(r);
        if (ec !== 0) return ec;
        const pc = getPhysicalClusterName(l).localeCompare(getPhysicalClusterName(r), undefined, { numeric: true, sensitivity: "base" });
        if (pc !== 0) return pc;
        if (l.isLogical !== r.isLogical) return l.isLogical ? 1 : -1;
        return l.displayName.localeCompare(r.displayName, undefined, { numeric: true, sensitivity: "base" });
      }),
    [clusterOptions]
  );

  const [selectedOptionId, setSelectedOptionId] = useState<string>("");
  const [selectedDatabase, setSelectedDatabase] = useState<string>("");
  const [isExplorerOpen, setIsExplorerOpen] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [explorerNonce, setExplorerNonce] = useState(0);

  const handleRefresh = () => {
    setExplorerNonce((n) => n + 1);
    setRefreshNonce((n) => n + 1);
    onRefresh?.();
  };

  const handleReset = () => {
    setRefreshNonce((n) => n + 1);
  };

  const resolvedOption = sortedClusterOptions.find((o) => o.id === selectedOptionId) ?? null;
  const effectiveClusterId = resolvedOption ? getPhysicalClusterId(resolvedOption) : "";
  const effectiveClusterName = resolvedOption?.isLogical ? resolvedOption.actualClusterName : undefined;

  const handleClusterSelect = (optionId: string) => {
    setSelectedOptionId(optionId);
    setSelectedDatabase("");
    setIsExplorerOpen(false);
    const option = sortedClusterOptions.find((o) => o.id === optionId);
    if (option) setSelectedClusterId(getPhysicalClusterId(option));
  };

  const handleDatabaseSelect = (dbName: string) => {
    setSelectedDatabase(dbName);
    if (showExplorer && dbName) setIsExplorerOpen(true);
    else setIsExplorerOpen(false);
  };

  const showContent = effectiveClusterId && (!requireDatabase || selectedDatabase);

  return (
    <div className="p-2 space-y-1">
      {/* Filter Bar */}
      <div className="flex items-center gap-3 flex-wrap bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg p-4">
        <label className="text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">
          Cluster:
        </label>
        <div className="w-80">
          <Select value={selectedOptionId || undefined} onValueChange={handleClusterSelect}>
            <SelectTrigger
              className={`h-9 ${
                resolvedOption?.isLogical
                  ? "border-purple-200 bg-purple-50/60 text-purple-900 dark:border-purple-800 dark:bg-purple-950/30 dark:text-purple-100"
                  : resolvedOption
                    ? "border-blue-200 bg-blue-50/60 text-blue-900 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-100"
                    : ""
              }`}
            >
              {resolvedOption ? (
                <div className="flex items-center gap-2 truncate">
                  {resolvedOption.isLogical ? (
                    <Network className="w-4 h-4 text-purple-600 dark:text-purple-400 flex-shrink-0" />
                  ) : (
                    <Server className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                  )}
                  <span className="truncate">{resolvedOption.displayName}</span>
                </div>
              ) : (
                <SelectValue placeholder="Select a cluster..." />
              )}
            </SelectTrigger>
            <SelectContent>
              {sortedClusterOptions.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  <div className="flex items-center gap-2">
                    {option.isLogical ? (
                      <Network className="w-3.5 h-3.5 text-purple-600 flex-shrink-0" />
                    ) : (
                      <Server className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
                    )}
                    <span>{option.displayName}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {effectiveClusterId && (
          <>
            <div className="w-px h-5 bg-gray-200 dark:bg-slate-600" />
            <label className="text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">
              Database:
            </label>
            <div className="w-80">
              <DatabaseSelector
                clusterId={effectiveClusterId}
                clusterName={effectiveClusterName}
                value={selectedDatabase}
                onSelect={handleDatabaseSelect}
              />
            </div>
          </>
        )}

        <div className="ml-auto">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
            className="h-8 w-8 p-0"
            title="Refresh table list"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Content Area */}
      {showContent ? (
        <div className="flex gap-6" style={{ height: "calc(100vh - 195px)" }}>
          {/* Table Explorer sidebar (only when showExplorer=true && database is selected) */}
          {showExplorer && isExplorerOpen && selectedDatabase && (
            <div className="flex-shrink-0 overflow-x-auto" style={{ width: 200 }}>
              <DatabaseExplorer
                key={selectedOptionId + selectedDatabase + explorerNonce}
                clusterId={effectiveClusterId}
                clusterName={effectiveClusterName}
                initialDatabase={selectedDatabase || undefined}
                restrictToDatabase={selectedDatabase || undefined}
                onTableSelect={onTableSelect}
                onClose={() => setIsExplorerOpen(false)}
              />
            </div>
          )}

          <div className="flex flex-1 min-w-0 flex-col">
            {showExplorer && !isExplorerOpen && selectedDatabase && (
              <div className="mb-3 flex-shrink-0">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsExplorerOpen(true)}
                  className="h-8 gap-1.5 rounded-full px-2.5 text-xs text-gray-600 dark:text-gray-300"
                >
                  <PanelLeftOpen className="w-3.5 h-3.5" />
                  Explorer
                </Button>
              </div>
            )}
            <div className="min-h-0 flex-1 overflow-auto">
              {children({
                clusterId: effectiveClusterId,
                clusterName: effectiveClusterName,
                selectedDatabase,
                selectedOptionId,
                resolvedOption,
                refreshNonce,
                onReset: handleReset,
              })}
            </div>
          </div>
        </div>
      ) : effectiveClusterId && requireDatabase ? (
        <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg p-12">
          <div className="text-center">
            <DatabaseIcon className="w-12 h-12 text-blue-600 dark:text-blue-400 mx-auto mb-4" />
            <p className="text-gray-600 dark:text-gray-400">Select a Database</p>
            <p className="text-sm text-gray-500 dark:text-gray-500 mt-1">
              Choose a database to explore its tables
            </p>
          </div>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg p-12">
          {sortedClusterOptions.length === 0 ? (
            <div className="text-center">
              <Server className="w-12 h-12 text-gray-400 dark:text-gray-600 mx-auto mb-4" />
              <p className="text-gray-600 dark:text-gray-400">No Accessible Clusters</p>
              <p className="text-sm text-gray-500 dark:text-gray-500 mt-1">
                You don&apos;t have access to any clusters
              </p>
            </div>
          ) : (
            <div className="text-center">
              <Server className="w-12 h-12 text-blue-600 dark:text-blue-400 mx-auto mb-4" />
              <p className="text-gray-600 dark:text-gray-400">Select a Cluster</p>
              <p className="text-sm text-gray-500 dark:text-gray-500 mt-1">
                Choose a cluster to get started
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-600 mt-3">
                You have access to {sortedClusterOptions.length} cluster{sortedClusterOptions.length !== 1 ? "s" : ""}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
