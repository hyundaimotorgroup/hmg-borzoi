"use client";

import { useState, useMemo } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { Search, RefreshCw, Terminal, AlertCircle, X, Server } from "lucide-react";

import { PanelLoader } from "@/components/ui/loading-spinner";

import { QueryTextCell } from "@/components/query/QueryTextCell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import type { AuditCluster, RunningQuery } from "../types";
import { formatBytes, formatElapsed, STATUS_CONFIG, ENVIRONMENT_LABELS } from "../utils";

type Props = {
  clusters: AuditCluster[];
  selectedClusterId: string;
  onClusterChange: (val: string) => void;
  querySearchTerm: string;
  setQuerySearchTerm: (val: string) => void;
  runningLoading: boolean;
  runningError: string | null;
  filteredRunningQueries: RunningQuery[];
  runningQueries: RunningQuery[];
  killQuery: (queryId: string) => void | Promise<void>;
  fetchRunningQueries: () => void;
};

export function RunningQueriesTab({
  clusters,
  selectedClusterId,
  onClusterChange,
  querySearchTerm,
  setQuerySearchTerm,
  runningLoading,
  runningError,
  filteredRunningQueries,
  runningQueries,
  killQuery,
  fetchRunningQueries,
}: Props) {
  const [pendingKillId, setPendingKillId] = useState<string | null>(null);
  const [killing, setKilling] = useState(false);

  const handleKillConfirm = async () => {
    if (!pendingKillId) return;
    setKilling(true);
    try {
      await killQuery(pendingKillId);
    } finally {
      setKilling(false);
      setPendingKillId(null);
    }
  };

  const columns = useMemo<ColumnDef<RunningQuery>[]>(
    () => [
      {
        accessorKey: "queryId",
        header: "Query ID",
        size: 260,
        meta: { truncate: false as const },
        cell: ({ getValue }) => (
          <span className="font-mono text-xs">{getValue<string>()}</span>
        ),
      },
      {
        accessorKey: "user",
        header: "User",
        size: 100,
      },
      {
        accessorKey: "query",
        header: "Query",
        size: 480,
        meta: { truncate: false as const },
        cell: ({ row }) => (
          <QueryTextCell query={row.original.query} queryId={row.original.queryId} />
        ),
      },
      {
        accessorKey: "elapsed",
        header: "Elapsed",
        size: 100,
        meta: { align: "right" as const },
        cell: ({ getValue }) => formatElapsed(getValue<number>()),
      },
      {
        accessorKey: "readRows",
        header: "Read Rows",
        size: 110,
        meta: { align: "right" as const },
        cell: ({ getValue }) => getValue<number>().toLocaleString(),
      },
      {
        accessorKey: "readBytes",
        header: "Read Bytes",
        size: 110,
        meta: { align: "right" as const },
        cell: ({ getValue }) => formatBytes(getValue<number>()),
      },
      {
        accessorKey: "memoryUsage",
        header: "Memory",
        size: 110,
        meta: { align: "right" as const },
        cell: ({ getValue }) => `${getValue<number>().toFixed(1)} MB`,
      },
      {
        id: "action",
        header: "Action",
        size: 80,
        meta: { align: "right" as const, truncate: false as const },
        cell: ({ row }) => (
          <Button
            variant="outline"
            size="sm"
            className="text-red-600 hover:text-red-700"
            aria-label={`Kill query ${row.original.queryId}`}
            onClick={() => setPendingKillId(row.original.queryId)}
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </Button>
        ),
      },
    ],
    []
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Select value={selectedClusterId} onValueChange={onClusterChange}>
              <SelectTrigger>
                <SelectValue placeholder="Select Cluster" />
              </SelectTrigger>
              <SelectContent>
                {clusters.map((cluster) => (
                  <SelectItem key={cluster.id} value={cluster.id}>
                    <div className="flex items-center gap-2">
                      <Server className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400 flex-shrink-0" />
                      <span className="font-medium">{cluster.name}</span>
                      {cluster.environment && (
                        <span className="text-xs text-gray-500">({ENVIRONMENT_LABELS[cluster.environment] ?? cluster.environment})</span>
                      )}
                      <Badge className={`${(STATUS_CONFIG[cluster.status ?? 'healthy']).color} text-xs px-1.5 py-0 ml-1`}>
                        {(STATUS_CONFIG[cluster.status ?? 'healthy']).label}
                      </Badge>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Search query ID, users, queries..."
                value={querySearchTerm}
                onChange={(e) => setQuerySearchTerm(e.target.value)}
                className="pl-10"
                disabled={!selectedClusterId}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {!selectedClusterId ? (
        <Card>
          <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
            <div className="flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800/60 mb-5">
              <Terminal className="w-8 h-8 text-gray-400 dark:text-gray-500" />
            </div>
            <p className="text-gray-600 dark:text-gray-400">Select a Cluster</p>
            <p className="text-sm text-gray-500 dark:text-gray-500 mt-1">
              Select a cluster from the dropdown above to view running queries
            </p>
          </div>
        </Card>
      ) : runningLoading ? (
        <Card>
          <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
            <PanelLoader />
            <p className="text-gray-500 dark:text-gray-400 text-sm" aria-live="polite">Loading…</p>
          </div>
        </Card>
      ) : runningError ? (
        <Card className="border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950">
          <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
            <AlertCircle className="w-8 h-8 mx-auto text-red-500 mb-2" />
            <p className="text-red-700 dark:text-red-400 text-sm mb-3">{runningError}</p>
            <Button variant="outline" size="sm" onClick={fetchRunningQueries}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Retry
            </Button>
          </div>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base dark:text-white">
              Running Queries ({filteredRunningQueries.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <DataTable
              columns={columns}
              data={filteredRunningQueries}
              emptyMessage={
                runningQueries.length === 0
                  ? "No running queries."
                  : "No results found."
              }
            />
          </CardContent>
        </Card>
      )}

      <Dialog open={!!pendingKillId} onOpenChange={(open) => { if (!open) setPendingKillId(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Kill Query</DialogTitle>
            <DialogDescription>
              Are you sure you want to kill this query?{" "}
              <br />
              This action cannot be undone.
              <br />
              <span className="font-mono text-xs mt-1 block text-gray-600 dark:text-gray-400 truncate">
                {pendingKillId}
              </span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingKillId(null)} disabled={killing}>Cancel</Button>
            <Button variant="destructive" onClick={handleKillConfirm} disabled={killing}>
              {killing ? 'Killing...' : 'Kill Query'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
