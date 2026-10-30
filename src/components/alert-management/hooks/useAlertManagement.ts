"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";

import {
  buildAlertChannelErrorMap,
  buildAlertFormErrorState,
  parseAlertNotificationTestForm,
} from "@/components/alert-management/form-validation";
import {
  applyAlertQueryTestColumns,
  applyAlertQueryTestFailure,
  applyAlertQueryTestSuccess,
  normalizeAlertMatchedSeverity,
} from "@/components/alert-management/form-state";
import { logger } from "@/lib/utils/logger";

import type {
  AlertHistory,
  AlertMutationResult,
  AlertNotificationTestResult,
  AlertQueryTestExecutionResult,
  AlertRule,
  AlertRuleFormData,
  ClusterOption,
} from "../types";
import {
  asNumber,
  asString,
  emptyAlertDialogValidationState,
  extractQueryTestColumns,
  getAlertRuleTestPayload,
  isRecord,
  parseAlertHistoryEntry,
  parseAlertRuleSummary,
  parseClusterList,
  parseEditAlertRuleRecord,
  validateAlertRuleForm,
} from "../alert-parsers";

type AlertStats = {
  activeAlerts: number;
  resolvedLast7d: number;
  totalRules: number;
  enabledRules: number;
};

// When opening the edit dialog, populate the form using only saved column info; the ClickHouse query is
// executed only when the user clicks "Run Test" (handleTestQuery).
const hydrateEditFormData = (
  baseFormData: AlertRuleFormData,
  options: { thresholdColumnName: string }
): AlertRuleFormData => {
  return applyAlertQueryTestColumns(
    baseFormData,
    options.thresholdColumnName ? [options.thresholdColumnName] : []
  );
};

const handleTestQuery = async (sourceFormData: AlertRuleFormData): Promise<AlertQueryTestExecutionResult> => {
  const validated = getAlertRuleTestPayload(sourceFormData);
  if (!validated.success) {
    return validated;
  }

  try {
    const response = await fetch("/api/alerts/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validated.data),
    });

    const raw: unknown = await response.json();
    const rec = isRecord(raw) ? raw : {};
    const { columns, numericColumns } = extractQueryTestColumns(rec);

    if (response.ok) {
      return {
        success: true as const,
        formData: applyAlertQueryTestSuccess(sourceFormData, {
          columns,
          numericColumns,
          rowCount: asNumber(rec.rowCount, undefined as unknown as number),
          thresholdMet: typeof rec.thresholdMet === "boolean" ? rec.thresholdMet : undefined,
          matchedSeverity: normalizeAlertMatchedSeverity(rec.matchedSeverity),
          executionTimeMs: asNumber(rec.executionTimeMs, undefined as unknown as number),
        }),
      };
    }

    const errMsg = asString(rec.error, "Query test failed");
    return {
      success: true as const,
      formData: applyAlertQueryTestFailure(sourceFormData, { columns, error: errMsg }),
    };
  } catch (err) {
    logger.error("Query test error:", err);
    return {
      success: true as const,
      formData: applyAlertQueryTestFailure(sourceFormData, { error: "Network error during test" }),
    };
  }
};

const handleTestNotification = async (
  sourceFormData: AlertRuleFormData,
  channelId: string
): Promise<AlertNotificationTestResult> => {
  const channel = sourceFormData.channels.find((candidate) => candidate.id === channelId);
  if (!channel) {
    return { success: false as const, validationState: emptyAlertDialogValidationState() };
  }

  if (channel.type === "Email") {
    return {
      success: false as const,
      validationState: emptyAlertDialogValidationState(),
      message: "Email test notifications are not yet supported",
    };
  }

  const validated = parseAlertNotificationTestForm(sourceFormData, channel);

  if (!validated.success) {
    const nextErrors = buildAlertFormErrorState(sourceFormData, validated.error);
    return {
      success: false as const,
      validationState: {
        fieldErrors: nextErrors.fieldErrors,
        thresholdErrors: nextErrors.thresholdErrors,
        channelErrors: buildAlertChannelErrorMap([channel], validated.error, "channel"),
      },
      message: validated.error.issues[0]?.message ?? "Check test notification input values",
    };
  }

  try {
    const response = await fetch("/api/alerts/test-notification", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validated.data),
    });

    const raw: unknown = await response.json();
    const rec = isRecord(raw) ? raw : {};

    if (!response.ok) {
      throw new Error(asString(rec.error, "Failed to send test notification"));
    }

    const channelLabel = channel.type;
    const severity = asString(rec.matchedSeverity);
    toast.success(
      severity
        ? `${channelLabel} channel: test notification sent (${severity})`
        : `${channelLabel} channel: test notification sent`
    );
    return { success: true as const };
  } catch (err) {
    logger.error("Test notification error:", err);
    toast.error(err instanceof Error ? err.message : "Failed to send test notification");
    return { success: false as const, validationState: emptyAlertDialogValidationState() };
  }
};

export function useAlertManagement() {
  const [selectedCluster, setSelectedCluster] = useState("all");
  const [clusters, setClusters] = useState<ClusterOption[]>([]);
  const [alertRules, setAlertRules] = useState<AlertRule[]>([]);
  const [alertHistory, setAlertHistory] = useState<AlertHistory[]>([]);
  const [stats, setStats] = useState<AlertStats>({
    activeAlerts: 0,
    resolvedLast7d: 0,
    totalRules: 0,
    enabledRules: 0,
  });

  const [loading, setLoading] = useState(true);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedRule, setSelectedRule] = useState<AlertRule | null>(null);
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState(() => {
    const tab = searchParams.get("tab");
    return tab === "history" ? "history" : "rules";
  });

  // Pagination state
  const [rulesPage, setRulesPage] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotalCount, setHistoryTotalCount] = useState(0);
  const RULES_PER_PAGE = 10;
  const HISTORY_PER_PAGE = 10;

  const resetDialogUiState = useCallback(() => {
    setSelectedRule(null);
  }, []);

  const openAddDialog = useCallback(() => {
    setIsEditDialogOpen(false);
    resetDialogUiState();
    setIsAddDialogOpen(true);
  }, [resetDialogUiState]);

  const handleAddDialogOpenChange = useCallback(
    (open: boolean) => {
      if (open) {
        openAddDialog();
        return;
      }

      setIsAddDialogOpen(false);
      resetDialogUiState();
    },
    [openAddDialog, resetDialogUiState]
  );

  const handleEditDialogOpenChange = useCallback(
    (open: boolean) => {
      setIsEditDialogOpen(open);

      if (!open) {
        resetDialogUiState();
      }
    },
    [resetDialogUiState]
  );

  useEffect(() => {
    const controller = new AbortController();
    async function fetchClusters() {
      try {
        const response = await fetch("/api/clusters", { signal: controller.signal });
        if (!response.ok) return;
        const data: unknown = await response.json();
        setClusters(parseClusterList(data));
      } catch (error) {
        if ((error as Error).name === 'AbortError') return;
        logger.error("Error fetching clusters:", error);
      }
    }
    void fetchClusters();
    return () => controller.abort(new DOMException('Component unmounted', 'AbortError'));
  }, []);

  const fetchAlertStats = useCallback(async (signal?: AbortSignal) => {
    try {
      const clusterParam = selectedCluster !== "all" ? `?clusterId=${selectedCluster}` : "";
      const cacheBustParam = `${clusterParam ? "&" : "?"}_=${Date.now()}`;
      const response = await fetch(`/api/alerts/stats${clusterParam}${cacheBustParam}`, {
        cache: "no-store",
        signal,
      });
      if (!response.ok) throw new Error("Failed to fetch alert stats");

      const data: unknown = await response.json();
      const rec = isRecord(data) ? data : {};

      setStats({
        activeAlerts: asNumber(rec.activeAlerts, 0),
        resolvedLast7d: asNumber(rec.resolvedLast7d, 0),
        totalRules: asNumber(rec.totalRules, 0),
        enabledRules: asNumber(rec.enabledRules, 0),
      });
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      logger.error("Error fetching alert stats:", err);
    }
  }, [selectedCluster]);

  const fetchAlertRules = useCallback(async (signal?: AbortSignal) => {
    try {
      setLoading(true);
      const response = await fetch("/api/alerts", { signal });
      if (!response.ok) throw new Error("Failed to fetch alerts");

      const data: unknown = await response.json();
      const rulesRaw = Array.isArray(data) ? data : [];
      const uiRules: AlertRule[] = rulesRaw
        .map(parseAlertRuleSummary)
        .filter((r): r is AlertRule => r !== null);

      setAlertRules(uiRules);
      await fetchAlertStats(signal);
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      logger.error("Error fetching alert rules:", err);
    } finally {
      setLoading(false);
    }
  }, [fetchAlertStats]);

  const fetchExecutionHistory = useCallback(
    async (page = 1, signal?: AbortSignal) => {
      try {
        const response = await fetch(
          `/api/execution-logs?limit=${HISTORY_PER_PAGE}&page=${page}&status=alert`,
          { signal }
        );
        const result: unknown = await response.json();
        const rec = isRecord(result) ? result : {};

        if (!response.ok) {
          logger.warn(
            "Execution history request failed:",
            asString(rec.error, "Failed to fetch execution logs")
          );
          setAlertHistory([]);
          setHistoryTotalCount(0);
          return;
        }

        const data = Array.isArray(rec.data) ? rec.data : [];
        const totalCount = asNumber(rec.totalCount, 0);

        const history: AlertHistory[] = data
          .map(parseAlertHistoryEntry)
          .filter((h): h is AlertHistory => h !== null);

        setAlertHistory(history);
        setHistoryTotalCount(totalCount);
        await fetchAlertStats(signal);
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        logger.warn("Error fetching execution history:", err);
        setAlertHistory([]);
        setHistoryTotalCount(0);
      }
    },
    [HISTORY_PER_PAGE, fetchAlertStats]
  );

  useEffect(() => {
    const controller = new AbortController();
    void fetchAlertRules(controller.signal);
    void fetchExecutionHistory(1, controller.signal);
    return () => controller.abort(new DOMException('Component unmounted', 'AbortError'));
  }, [fetchAlertRules, fetchExecutionHistory]);

  useEffect(() => {
    const controller = new AbortController();
    void fetchExecutionHistory(historyPage, controller.signal);
    return () => controller.abort(new DOMException('Component unmounted', 'AbortError'));
  }, [fetchExecutionHistory, historyPage]);

  useEffect(() => {
    const controller = new AbortController();
    void fetchAlertStats(controller.signal);
    return () => controller.abort(new DOMException('Component unmounted', 'AbortError'));
  }, [fetchAlertStats, selectedCluster]);

  const toggleRuleEnabled = async (ruleId: string) => {
    const rule = alertRules.find((r) => r.id === ruleId);
    if (!rule) return;

    try {
      const response = await fetch(`/api/alerts/${ruleId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !rule.enabled }),
      });

      if (!response.ok) throw new Error("Failed to update alert");
      setAlertRules((prev) => prev.map((r) => (r.id === ruleId ? { ...r, enabled: !r.enabled } : r)));
    } catch (err) {
      logger.error("Error toggling alert:", err);
      toast.error("Failed to update alert status");
    }
  };

  const persistAlertRule = useCallback(
    async (
      sourceFormData: AlertRuleFormData,
      options: {
        url: string;
        method: "POST" | "PATCH";
        errorLogMessage: string;
        errorToastMessage: string;
        onSuccess: () => void;
      }
    ): Promise<AlertMutationResult> => {
      const validated = validateAlertRuleForm(sourceFormData);
      if (!validated.success) {
        return validated;
      }

      try {
        const response = await fetch(options.url, {
          method: options.method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(validated.data),
        });

        if (!response.ok) throw new Error(`Failed to ${options.method === "POST" ? "create" : "update"} alert`);
        await fetchAlertRules();
        options.onSuccess();
        return { success: true as const };
      } catch (err) {
        logger.error(options.errorLogMessage, err);
        toast.error(options.errorToastMessage);
        return { success: false as const };
      }
    },
    [fetchAlertRules]
  );

  const handleAddRule = async (sourceFormData: AlertRuleFormData) => {
    return persistAlertRule(sourceFormData, {
      url: "/api/alerts",
      method: "POST",
      errorLogMessage: "Error creating alert:",
      errorToastMessage: "Failed to create alert rule",
      onSuccess: () => {
        setIsAddDialogOpen(false);
      },
    });
  };

  const openEditDialog = async (rule: AlertRule): Promise<AlertRuleFormData | null> => {
    setIsAddDialogOpen(false);
    setSelectedRule(rule);

    try {
      const response = await fetch(`/api/alerts/${rule.id}`);
      if (!response.ok) throw new Error("Failed to fetch alert details");
      const fullAlert: unknown = await response.json();
      const rec = isRecord(fullAlert) ? fullAlert : {};

      const payload = parseEditAlertRuleRecord(rec);
      if (!payload) throw new Error("Alert rule has no thresholds configured");

      const hydratedFormData = hydrateEditFormData(payload.baseFormData, {
        thresholdColumnName: payload.thresholdColumnName,
      });

      setIsEditDialogOpen(true);
      return hydratedFormData;
    } catch (err) {
      logger.error("Error loading alert details:", err);
      toast.error("Failed to load alert details");
      setSelectedRule(null);
      return null;
    }
  };

  const handleEditRule = async (sourceFormData: AlertRuleFormData) => {
    if (!selectedRule) return { success: false as const };
    return persistAlertRule(sourceFormData, {
      url: `/api/alerts/${selectedRule.id}`,
      method: "PATCH",
      errorLogMessage: "Error updating alert:",
      errorToastMessage: "Failed to update alert rule",
      onSuccess: () => {
        setIsEditDialogOpen(false);
        setSelectedRule(null);
      },
    });
  };

  const handleDeleteRule = async () => {
    if (!selectedRule) return;

    try {
      const response = await fetch(`/api/alerts/${selectedRule.id}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Failed to delete alert");
      await fetchAlertRules();
      setIsDeleteDialogOpen(false);
      setSelectedRule(null);
    } catch (err) {
      logger.error("Error deleting alert:", err);
      toast.error("Failed to delete alert rule");
    }
  };

  const openDeleteDialog = (rule: AlertRule) => {
    setSelectedRule(rule);
    setIsDeleteDialogOpen(true);
  };

  const handleResolveAlert = async (logId: string, resolved: boolean) => {
    try {
      const response = await fetch(`/api/execution-logs/${logId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolved }),
      });

      if (!response.ok) throw new Error("Failed to update execution log");

      setAlertHistory((prev) =>
        prev.map((h) =>
          h.id === logId
            ? { ...h, status: resolved ? "resolved" : "active", resolvedAt: resolved ? new Date().toISOString() : null }
            : h
        )
      );

      await fetchAlertStats();
    } catch (err) {
      logger.error("Error resolving alert:", err);
      toast.error("Failed to update alert status");
    }
  };

  return {
    // Data
    selectedCluster,
    clusters,
    alertRules,
    alertHistory,
    stats,
    loading,

    // UI state
    isAddDialogOpen,
    isEditDialogOpen,
    isDeleteDialogOpen,
    selectedRule,
    activeTab,
    rulesPage,
    historyPage,
    historyTotalCount,
    RULES_PER_PAGE,
    HISTORY_PER_PAGE,

    // State setter functions
    setSelectedCluster,
    setIsDeleteDialogOpen,
    setActiveTab,
    setRulesPage,
    setHistoryPage,

    // Actions
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
  };
}
