"use client";

import { useState, useMemo, useCallback } from "react";
import type { Cluster } from "@/lib/services/cluster.service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Server, Plus, Pencil, Trash2, Search, Eye, CheckCircle, AlertCircle, XCircle, Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { DataTable } from "@/components/ui/data-table";
import { type ColumnDef } from "@tanstack/react-table";
import { useSettings } from "@/contexts/SettingsContext";
import { formatDateWithTimezone } from "@/lib/utils/time-formatter";
import { useClusterManagement } from "./hooks/useClusterManagement";
import { ClusterFormModal } from "./ClusterFormModal";
import { ClusterNodePanel } from "./ClusterNodePanel";
import { ClusterDeleteDialog } from "./ClusterDeleteDialog";
import { defaultClusterFormValues, type ClusterFormValues } from "@/lib/validation";

const statusConfig = {
  healthy: { bg: "bg-green-100", text: "text-green-800", label: "Healthy", icon: CheckCircle },
  degraded: { bg: "bg-orange-100", text: "text-orange-800", label: "Degraded", icon: AlertCircle },
  unreachable: { bg: "bg-red-100", text: "text-red-800", label: "Unreachable", icon: XCircle },
} as const;

const environmentConfig = {
  dev: { bg: "bg-blue-100", text: "text-blue-800", label: "Development" },
  staging: { bg: "bg-yellow-100", text: "text-yellow-800", label: "Staging" },
  prod: { bg: "bg-purple-100", text: "text-purple-800", label: "Production" },
} as const;

interface ClusterManagementProps {
  currentUser: string;
}

export function ClusterManagement({ currentUser }: ClusterManagementProps) {
  const { generalSettings } = useSettings();
  const timezone = generalSettings.timezone || "UTC";
  const [searchQuery, setSearchQuery] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const [selectedCluster, setSelectedCluster] = useState<Cluster | null>(null);
  const [formInitialValues, setFormInitialValues] = useState<ClusterFormValues>(defaultClusterFormValues);

  const {
    clusters,
    loading,
    summaryLoadingIds,
    isTestingConnection,
    connectionTestResult,
    setConnectionTestResult,
    detailData,
    handleAddCluster,
    handleEditCluster,
    handleDeleteCluster,
    handleTestConnection,
    openDetailDialog,
  } = useClusterManagement();

  const filteredClusters = clusters.filter((cluster) => {
    const matchesSearch =
      cluster.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      cluster.host.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

  void currentUser;

  const openAddDialog = () => {
    setFormInitialValues(defaultClusterFormValues);
    setConnectionTestResult(null);
    setIsAddDialogOpen(true);
  };

  const openEditDialog = useCallback((cluster: Cluster) => {
    setSelectedCluster(cluster);
    setFormInitialValues({
      name: cluster.name,
      host: cluster.host,
      port: cluster.port,
      protocol: cluster.protocol,
      username: cluster.username,
      password: "",
      useTLS: cluster.useTLS,
      environment: cluster.environment,
    });
    setConnectionTestResult(null);
    setIsEditDialogOpen(true);
  }, [setConnectionTestResult]);

  const closeFormModal = () => {
    setIsAddDialogOpen(false);
    setIsEditDialogOpen(false);
    setSelectedCluster(null);
    setFormInitialValues(defaultClusterFormValues);
  };

  const handleFormSubmit = async (values: ClusterFormValues) => {
    try {
      if (isEditDialogOpen && selectedCluster) {
        await handleEditCluster(selectedCluster, values);
      } else {
        await handleAddCluster(values);
      }
      closeFormModal();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Operation failed.";
      toast.error(message);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!selectedCluster) return;
    try {
      await handleDeleteCluster(selectedCluster);
      setIsDeleteDialogOpen(false);
      setSelectedCluster(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Delete failed.";
      toast.error(message);
    }
  };

  const openDetailDialogForCluster = useCallback(async (cluster: Cluster) => {
    setSelectedCluster(cluster);
    setIsDetailDialogOpen(true);
    await openDetailDialog(cluster);
  }, [openDetailDialog]);

  const columns = useMemo<ColumnDef<Cluster>[]>(() => [
    {
      accessorKey: "name",
      header: "Cluster Name",
      size: 160,
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <Server className="w-4 h-4 text-amber-600 dark:text-amber-500 flex-shrink-0" />
          {row.original.name}
        </div>
      ),
    },
    {
      accessorKey: "host",
      header: "Host",
      size: 180,
      cell: ({ row }) => (
        <span className="text-sm text-gray-600 dark:text-gray-400">
          {row.original.host}:{row.original.port}
        </span>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      size: 110,
      meta: { truncate: false as const },
      cell: ({ row }) => {
        const cluster = row.original;
        const isSummaryLoading = summaryLoadingIds.has(cluster.id);
        const statusKey = cluster.status ?? 'unreachable';
        const StatusIcon = statusConfig[statusKey].icon;
        return isSummaryLoading ? (
          <Skeleton className="h-5 w-20" />
        ) : (
          <Badge className={`${statusConfig[statusKey].bg} ${statusConfig[statusKey].text} dark:bg-opacity-30`}>
            <StatusIcon className="w-3 h-3 mr-1" />
            {statusConfig[statusKey].label}
          </Badge>
        );
      },
    },
    {
      accessorKey: "environment",
      header: "Environment",
      size: 110,
      meta: { truncate: false as const },
      cell: ({ row }) => (
        <Badge className={`${environmentConfig[row.original.environment].bg} ${environmentConfig[row.original.environment].text} dark:bg-opacity-30`}>
          {environmentConfig[row.original.environment].label}
        </Badge>
      ),
    },
    {
      accessorKey: "nodes",
      header: "Nodes",
      size: 70,
      meta: { align: "center" as const, truncate: false as const },
      cell: ({ row }) => {
        const cluster = row.original;
        return summaryLoadingIds.has(cluster.id)
          ? <Skeleton className="h-4 w-8 mx-auto" />
          : <span className="">{cluster.nodes ?? '-'}</span>;
      },
    },
    {
      accessorKey: "version",
      header: "Version",
      size: 90,
      meta: { align: "center" as const },
      cell: ({ row }) => summaryLoadingIds.has(row.original.id)
        ? <Skeleton className="h-4 w-16 mx-auto" />
        : <span className="text-sm">{row.original.version}</span>,
    },
    {
      accessorKey: "uptime",
      header: "Uptime",
      size: 80,
      meta: { align: "center" as const },
      cell: ({ row }) => summaryLoadingIds.has(row.original.id)
        ? <Skeleton className="h-4 w-16 mx-auto" />
        : <span className="text-sm">{row.original.uptime?.split(" ")[0]}</span>,
    },
    {
      accessorKey: "protocol",
      header: "Protocol",
      size: 90,
      meta: { truncate: false as const },
      cell: ({ row }) => (
        <Badge variant="outline" className="text-xs dark:border-slate-600">
          {row.original.useTLS ? "HTTPS" : "HTTP"}
        </Badge>
      ),
    },
    {
      accessorKey: "createdAt",
      header: "Registered",
      size: 100,
      cell: ({ getValue }) => (
        <span className="text-sm text-gray-600 dark:text-gray-400">
          {formatDateWithTimezone(getValue<string>(), timezone, {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          })}
        </span>
      ),
    },
    {
      id: "actions",
      header: "Actions",
      size: 100,
      meta: { align: "right" as const, truncate: false as const },
      cell: ({ row }) => {
        const cluster = row.original;
        return (
          <div className="flex justify-end gap-1">
            <Button variant="ghost" size="sm" aria-label={`View details for ${cluster.name}`}
              onClick={() => { void openDetailDialogForCluster(cluster); }}>
              <Eye className="w-4 h-4" aria-hidden="true" />
            </Button>
            <Button variant="ghost" size="sm" aria-label={`Edit ${cluster.name}`} onClick={() => openEditDialog(cluster)}>
              <Pencil className="w-4 h-4" aria-hidden="true" />
            </Button>
            <Button variant="ghost" size="sm" aria-label={`Delete ${cluster.name}`}
              onClick={() => { setSelectedCluster(cluster); setIsDeleteDialogOpen(true); }}>
              <Trash2 className="w-4 h-4 text-red-600" aria-hidden="true" />
            </Button>
          </div>
        );
      },
    },
  ], [openDetailDialogForCluster, openEditDialog, summaryLoadingIds, timezone]);

  return (
    <div className="p-8 space-y-6">
      <div className="flex justify-end">
        <Button onClick={openAddDialog} className="bg-gray-900 hover:bg-gray-800">
          <Plus className="w-4 h-4 mr-2" />
          Add Cluster
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              Registered Clusters
              {summaryLoadingIds.size > 0 && (
                <Loader2 className="w-4 h-4 animate-spin text-gray-400" aria-label="Loading cluster status" />
              )}
            </CardTitle>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                placeholder="Search clusters..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={filteredClusters}
            isLoading={loading && clusters.length === 0}
            emptyMessage={
              <div className="py-12 text-center">
                <Server className="w-12 h-12 text-gray-400 dark:text-gray-600 mx-auto mb-4" />
                <p className="text-gray-600 dark:text-gray-400">No results found.</p>
              </div>
            }
          />
        </CardContent>
      </Card>

      <ClusterFormModal
        isOpen={isAddDialogOpen || isEditDialogOpen}
        isEditMode={isEditDialogOpen}
        initialValues={formInitialValues}
        isTestingConnection={isTestingConnection}
        connectionTestResult={connectionTestResult}
        onSubmit={handleFormSubmit}
        onTestConnection={handleTestConnection}
        onClose={closeFormModal}
      />

      <ClusterDeleteDialog
        isOpen={isDeleteDialogOpen}
        cluster={selectedCluster}
        onConfirm={handleDeleteConfirm}
        onClose={setIsDeleteDialogOpen}
      />

      <ClusterNodePanel
        isOpen={isDetailDialogOpen}
        cluster={selectedCluster}
        detailData={detailData}
        onClose={setIsDetailDialogOpen}
      />
    </div>
  );
}
