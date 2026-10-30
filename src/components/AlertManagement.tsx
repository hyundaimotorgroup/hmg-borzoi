"use client";

import { useCallback } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Bell,
  Plus,
  AlertTriangle,
  AlertCircle,
  CheckCircle,
  Server,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSettings } from "@/contexts/SettingsContext";
import { AlertHistoryTab } from "./alert-management/AlertHistoryTab";
import { AlertRuleDialog } from "./alert-management/AlertRuleDialog";
import { AlertRulesTab } from "./alert-management/AlertRulesTab";
import { ClusterSelectItems } from "./alert-management/ClusterSelectItems";
import { useAlertManagement } from "./alert-management/hooks/useAlertManagement";
import {
  useAlertRuleDialogState,
  type AlertRuleDialogState,
} from "./alert-management/hooks/useAlertRuleDialogState";
import { emptyForm } from "./alert-management/utils";
import { PanelLoader } from "@/components/ui/loading-spinner";
import type {
  AlertMutationResult,
  AlertNotificationTestResult,
  AlertQueryTestExecutionResult,
  AlertRule,
  AlertRuleFormData,
} from "./alert-management/types";

function applyDialogFailure(
  dialogState: AlertRuleDialogState,
  result: Extract<AlertMutationResult, { success: false }>
) {
  if (result.validationState) {
    dialogState.replaceValidationState(result.validationState);
  }
  if (result.message) {
    toast.error(result.message);
  }
}

function applyDialogMergedFailure(
  dialogState: AlertRuleDialogState,
  result: Extract<AlertQueryTestExecutionResult | AlertNotificationTestResult, { success: false }>
) {
  dialogState.mergeValidationState(result.validationState);
  if (result.message) {
    toast.error(result.message);
  }
}

function createSubmitHandler(
  dialogState: AlertRuleDialogState,
  submitAction: (formData: AlertRuleFormData) => Promise<AlertMutationResult>
) {
  return async (nextFormData: AlertRuleFormData) => {
    const result = await submitAction(nextFormData);
    if (!result.success) {
      applyDialogFailure(dialogState, result);
      return;
    }
    dialogState.resetState();
  };
}

export function AlertManagement() {
  const addDialogFormId = "alert-rule-add-form";
  const editDialogFormId = "alert-rule-edit-form";
  const { generalSettings } = useSettings();
  const timezone = generalSettings.timezone || "UTC";
  const addDialog = useAlertRuleDialogState();
  const editDialog = useAlertRuleDialogState();
  const {
    selectedCluster,
    setSelectedCluster,
    clusters,
    alertRules,
    alertHistory,
    stats,
    loading,
    isAddDialogOpen,
    isEditDialogOpen,
    isDeleteDialogOpen,
    setIsDeleteDialogOpen,
    selectedRule,
    activeTab,
    setActiveTab,
    rulesPage,
    setRulesPage,
    historyPage,
    setHistoryPage,
    historyTotalCount,
    RULES_PER_PAGE,
    HISTORY_PER_PAGE,
    toggleRuleEnabled,
    openAddDialog,
    handleAddDialogOpenChange,
    handleEditDialogOpenChange,
    handleAddRule,
    openEditDialog,
    handleEditRule,
    handleDeleteRule,
    openDeleteDialog,
    handleTestQuery,
    handleTestNotification,
    handleResolveAlert,
  } = useAlertManagement();

  const createTestQueryHandler = useCallback(
    (dialogState: AlertRuleDialogState) =>
      async (nextFormData: AlertRuleFormData) => {
        const result = await handleTestQuery(nextFormData);
        if (!result.success) {
          applyDialogMergedFailure(dialogState, result);
          return null;
        }

        dialogState.clearFieldErrors(["cluster", "sqlQuery", "compareColumn"]);
        dialogState.clearThresholdErrors();
        return result.formData;
      },
    [handleTestQuery]
  );

  const createTestNotificationHandler = useCallback(
    (dialogState: AlertRuleDialogState) =>
      async (nextFormData: AlertRuleFormData, channelId: string) => {
        dialogState.setTestingChannelId(channelId);
        const result = await handleTestNotification(nextFormData, channelId);
        dialogState.setTestingChannelId(null);

        if (!result.success) {
          applyDialogMergedFailure(dialogState, result);
          return;
        }

        dialogState.clearChannelError(channelId);
      },
    [handleTestNotification]
  );

  const handleOpenAddDialog = useCallback((prefilledCluster?: string) => {
    addDialog.resetState();
    openAddDialog();
    if (prefilledCluster && prefilledCluster !== "all") {
      addDialog.setHydratedFormData({ ...emptyForm(), cluster: prefilledCluster });
    }
  }, [addDialog, openAddDialog]);

  const handleAddDialogChange = useCallback(
    (open: boolean) => {
      addDialog.resetState();
      handleAddDialogOpenChange(open);
    },
    [addDialog, handleAddDialogOpenChange]
  );

  const handleEditDialogChange = useCallback(
    (open: boolean) => {
      if (!open) {
        editDialog.resetState();
      }
      handleEditDialogOpenChange(open);
    },
    [editDialog, handleEditDialogOpenChange]
  );

  const handleOpenEditDialog = useCallback(
    async (rule: AlertRule) => {
      editDialog.resetUiState();
      const nextFormData = await openEditDialog(rule);
      if (nextFormData) {
        editDialog.setHydratedFormData(nextFormData);
      }
    },
    [editDialog, openEditDialog]
  );

  const handleCreateRule = useCallback(
    async (nextFormData: AlertRuleFormData) => {
      await createSubmitHandler(addDialog, handleAddRule)(nextFormData);
    },
    [addDialog, handleAddRule]
  );

  const handleSaveRule = useCallback(
    async (nextFormData: AlertRuleFormData) => {
      await createSubmitHandler(editDialog, handleEditRule)(nextFormData);
    },
    [editDialog, handleEditRule]
  );

  const handleAddTestQuery = useCallback(
    async (nextFormData: AlertRuleFormData) => createTestQueryHandler(addDialog)(nextFormData),
    [addDialog, createTestQueryHandler]
  );

  const handleEditTestQuery = useCallback(
    async (nextFormData: AlertRuleFormData) => createTestQueryHandler(editDialog)(nextFormData),
    [createTestQueryHandler, editDialog]
  );

  const handleAddTestNotification = useCallback(
    async (nextFormData: AlertRuleFormData, channelId: string) =>
      createTestNotificationHandler(addDialog)(nextFormData, channelId),
    [addDialog, createTestNotificationHandler]
  );

  const handleEditTestNotification = useCallback(
    async (nextFormData: AlertRuleFormData, channelId: string) =>
      createTestNotificationHandler(editDialog)(nextFormData, channelId),
    [createTestNotificationHandler, editDialog]
  );

  if (loading) {
    return (
      <div className="p-8">
        <div className="flex items-center justify-center min-h-[400px]">
          <PanelLoader label="Loading alerts..." className="py-0" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: "Active Alerts", value: stats.activeAlerts, bg: "bg-red-100 dark:bg-red-900/30", icon: <AlertCircle className="w-6 h-6 text-red-600 dark:text-red-400" /> },
          { label: "Resolved (7d)", value: stats.resolvedLast7d, bg: "bg-green-100 dark:bg-green-900/30", icon: <CheckCircle className="w-6 h-6 text-green-600 dark:text-green-400" /> },
          { label: "Total Rules", value: stats.totalRules, bg: "bg-blue-100 dark:bg-blue-900/30", icon: <Bell className="w-6 h-6 text-blue-600 dark:text-blue-400" /> },
          { label: "Enabled Rules", value: stats.enabledRules, bg: "bg-orange-100 dark:bg-orange-900/30", icon: <AlertTriangle className="w-6 h-6 text-orange-600 dark:text-orange-400" /> },
        ].map(({ label, value, bg, icon }) => (
          <Card key={label}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{label}</p>
                  <p className="text-3xl text-gray-900 dark:text-white mt-2">{value}</p>
                </div>
                <div className={`w-12 h-12 ${bg} rounded-lg flex items-center justify-center`}>{icon}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex items-center gap-3 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg p-4">
        <label className="text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">Cluster:</label>
        <div className="w-80">
          <Select value={selectedCluster} onValueChange={setSelectedCluster}>
            <SelectTrigger className="h-9"><SelectValue placeholder="Select a cluster..." /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                <div className="flex items-center gap-2"><Server className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400 flex-shrink-0" /><span className="font-medium">All Clusters</span></div>
              </SelectItem>
              <ClusterSelectItems clusters={clusters} />
            </SelectContent>
          </Select>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="rules">Alert Rules</TabsTrigger>
            <TabsTrigger value="history">Alert History</TabsTrigger>
          </TabsList>
          <Button
            onClick={() => handleOpenAddDialog(selectedCluster)}
            className="bg-gray-900 hover:bg-gray-800 h-8 text-sm"
            size="sm"
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" />Add Alert Rule
          </Button>
        </div>

        <TabsContent value="rules" className="space-y-4">
          <AlertRulesTab
            selectedCluster={selectedCluster}
            alertRules={alertRules}
            rulesPage={rulesPage}
            RULES_PER_PAGE={RULES_PER_PAGE}
            setRulesPage={setRulesPage}
            toggleRuleEnabled={toggleRuleEnabled}
            openEditDialog={handleOpenEditDialog}
            openDeleteDialog={openDeleteDialog}
          />
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          <AlertHistoryTab
            selectedCluster={selectedCluster}
            alertHistory={alertHistory}
            historyPage={historyPage}
            historyTotalCount={historyTotalCount}
            HISTORY_PER_PAGE={HISTORY_PER_PAGE}
            timezone={timezone}
            setHistoryPage={setHistoryPage}
            handleResolveAlert={handleResolveAlert}
          />
        </TabsContent>
      </Tabs>

      <AlertRuleDialog
        open={isAddDialogOpen}
        onOpenChange={handleAddDialogChange}
        formId={addDialogFormId}
        prefix="add"
        switchId="add-rule-enabled"
        title="Create Alert Rule"
        description="Define a SQL query and threshold to trigger automated alerts"
        submitLabel="Create Rule"
        clusters={clusters}
        dialogState={addDialog}
        handleTestQuery={handleAddTestQuery}
        handleTestNotification={handleAddTestNotification}
        onSubmit={handleCreateRule}
      />

      <AlertRuleDialog
        open={isEditDialogOpen}
        onOpenChange={handleEditDialogChange}
        formId={editDialogFormId}
        prefix="edit"
        switchId="edit-rule-enabled"
        title="Edit Alert Rule"
        description="Update the SQL query and settings for this alert rule"
        submitLabel="Save Changes"
        clusters={clusters}
        dialogState={editDialog}
        handleTestQuery={handleEditTestQuery}
        handleTestNotification={handleEditTestNotification}
        onSubmit={handleSaveRule}
      />

      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Alert Rule</DialogTitle>
            <DialogDescription>Are you sure you want to delete &quot;{selectedRule?.name}&quot;? This action cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteRule}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
