import { format, isValid } from "date-fns";
import {
  buildAlertChannelErrorMap,
  buildAlertFormErrorState,
  parseAlertRuleForm,
  parseAlertRuleTestForm,
} from "@/components/alert-management/form-validation";
import {
  getHighestSeverity,
  getPrimaryThreshold,
  parseThresholdLevels,
  type AlertThresholdLevel,
} from "@/lib/alert/thresholds";
import { logger } from "@/lib/utils/logger";

import type {
  AlertDialogValidationState,
  AlertHistory,
  AlertRule,
  AlertRuleFormData,
  ClusterOption,
} from "./types";
import { dbChannelToUi, emptyForm, newChannel, newThresholdRow, sortThresholdRows } from "./utils";

export const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
export const asString = (v: unknown, fallback = ""): string => (typeof v === "string" ? v : fallback);
export const asNumber = (v: unknown, fallback = 0): number => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
export const asBoolean = (v: unknown, fallback = false): boolean => (typeof v === "boolean" ? v : fallback);

const toThresholdRows = (thresholds: AlertThresholdLevel[]) =>
  sortThresholdRows(
    thresholds
      .map((threshold) => newThresholdRow(threshold.severity, threshold.operator, String(threshold.value || 0)))
      .map((threshold, index) => ({ ...threshold, id: `th-edit-${index}` }))
  );

export const parseClusterList = (data: unknown): ClusterOption[] => {
  if (!Array.isArray(data)) return [];
  const clusters: ClusterOption[] = [];
  for (const item of data) {
    if (!isRecord(item)) continue;
    const id = asString(item.id);
    const name = asString(item.name);
    const environment = asString(item.environment);
    const status = asString(item.status, "healthy");
    if (!id || !name) continue;
    clusters.push({ id, name, environment, status });
  }
  return clusters;
};

const parseNotificationChannelNames = (rawChannels: unknown, ruleId: string): string[] => {
  if (Array.isArray(rawChannels)) {
    return rawChannels
      .map((ch): string => {
        if (typeof ch === "string") return ch;
        if (isRecord(ch)) return asString(ch.type, "unknown");
        return "unknown";
      })
      .filter(Boolean);
  }

  if (rawChannels) {
    logger.warn(`[AlertManagement] notificationChannels is not array for rule ${ruleId}:`, rawChannels);
  }
  return [];
};

const parseStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.length > 0) : [];

export const extractQueryTestColumns = (
  payload: Record<string, unknown>,
  persistedColumn?: string
) => {
  let columns = parseStringArray(payload.columns);
  const numericColumns = parseStringArray(payload.numericColumns);

  if (columns.length === 0 && isRecord(payload.queryResult)) {
    columns = Object.keys(payload.queryResult);
  }

  if (columns.length === 0 && persistedColumn) {
    columns = [persistedColumn];
  }

  return { columns, numericColumns };
};

const formatDateYYYYMMDD = (value: unknown): string => {
  const raw = typeof value === "string" ? value : value instanceof Date ? value.toISOString() : "";
  const d = raw ? new Date(raw) : new Date(NaN);
  if (!isValid(d)) return "";
  return format(d, 'yyyy-MM-dd');
};

export const emptyAlertDialogValidationState = (): AlertDialogValidationState => ({
  fieldErrors: {},
  thresholdErrors: {},
  channelErrors: {},
});

export const parseAlertRuleSummary = (raw: unknown): AlertRule | null => {
  if (!isRecord(raw)) return null;
  const id = asString(raw.id);
  const name = asString(raw.name);
  if (!id || !name) return null;

  const clusterId = asString(raw.clusterId, "all");
  const checkIntervalMinutes = asNumber(raw.checkIntervalMinutes, 0);
  const enabled = asBoolean(raw.enabled, true);
  const thresholdColumnName = asString(raw.thresholdColumnName) || undefined;
  const channels = parseNotificationChannelNames(raw.notificationChannels, id);
  const thresholds = parseThresholdLevels(raw.thresholds);
  if (thresholds.length === 0) return null;
  const primaryThreshold = getPrimaryThreshold(thresholds);
  const severity = getHighestSeverity(thresholds);

  return {
    id,
    name,
    cluster: clusterId || "all",
    metric: "custom_query",
    condition: primaryThreshold?.operator || ">=",
    threshold: primaryThreshold?.value ?? 0,
    duration: checkIntervalMinutes,
    severity: severity as AlertRule["severity"],
    enabled,
    notificationChannels: channels,
    createdAt: formatDateYYYYMMDD(raw.createdAt),
    thresholdColumnName,
    thresholds,
  };
};

export const parseAlertHistoryEntry = (log: unknown): AlertHistory | null => {
  if (!isRecord(log)) return null;
  const id = asString(log.id);
  if (!id) return null;

  const error = typeof log.error === "string" ? log.error : "";
  const thresholdMet = asBoolean(log.thresholdMet, false);
  const executedAt = asString(log.executedAt);
  const alertRule = isRecord(log.alertRule) ? log.alertRule : undefined;
  const matchedSeverity = asString(log.matchedSeverity);

  let severity: AlertHistory["severity"] = "info";
  if (error) severity = "critical";
  else if (matchedSeverity === "critical" || matchedSeverity === "warning" || matchedSeverity === "info") {
    severity = matchedSeverity;
  } else if (thresholdMet) severity = "warning";

  const resolvedAtRaw = log.resolvedAt != null ? asString(log.resolvedAt) : null;
  const status: AlertHistory["status"] = resolvedAtRaw ? "resolved" : "active";

  let message = "";
  if (error) message = `Error: ${error}`;
  else if (thresholdMet) message = "Threshold exceeded (query returned value that met the condition)";
  else message = "Normal - Threshold not met";

  return {
    id,
    ruleName: alertRule ? asString(alertRule.name, "Unknown Rule") : "Unknown Rule",
    cluster: alertRule ? asString(alertRule.clusterId, "unknown") : "unknown",
    severity,
    message,
    triggeredAt: executedAt || "",
    status,
    resolvedAt: resolvedAtRaw,
  };
};

export const validateAlertRuleForm = (sourceFormData: AlertRuleFormData) => {
  const parsed = parseAlertRuleForm(sourceFormData);
  if (parsed.success) {
    return { success: true as const, data: parsed.data };
  }

  const nextErrors = buildAlertFormErrorState(sourceFormData, parsed.error);
  return {
    success: false as const,
    validationState: {
      fieldErrors: nextErrors.fieldErrors,
      thresholdErrors: nextErrors.thresholdErrors,
      channelErrors: buildAlertChannelErrorMap(sourceFormData.channels, parsed.error),
    },
    message: parsed.error.issues[0]?.message ?? "Check alert rule input values",
  };
};

export const getAlertRuleTestPayload = (sourceFormData: AlertRuleFormData) => {
  const parsed = parseAlertRuleTestForm(sourceFormData);
  if (parsed.success) {
    return { success: true as const, data: parsed.data };
  }

  const nextErrors = buildAlertFormErrorState(sourceFormData, parsed.error);
  return {
    success: false as const,
    validationState: {
      fieldErrors: nextErrors.fieldErrors,
      thresholdErrors: nextErrors.thresholdErrors,
      channelErrors: {},
    },
    message: parsed.error.issues[0]?.message ?? "Check query test input values",
  };
};

export type EditAlertRulePayload = {
  baseFormData: AlertRuleFormData;
  thresholdColumnName: string;
};

export const parseEditAlertRuleRecord = (rec: Record<string, unknown>): EditAlertRulePayload | null => {
  const clusterId = asString(rec.clusterId);
  const query = asString(rec.query);
  const thresholds = parseThresholdLevels(rec.thresholds);
  if (thresholds.length === 0) return null;
  const thresholdColumnName = asString(rec.thresholdColumnName);
  const checkIntervalMinutes = asNumber(rec.checkIntervalMinutes);
  const enabled = asBoolean(rec.enabled, true);

  const notificationChannelsRaw = rec.notificationChannels;
  const channels =
    Array.isArray(notificationChannelsRaw) && notificationChannelsRaw.length > 0
      ? notificationChannelsRaw.map((ch, idx) => dbChannelToUi(ch, idx))
      : [newChannel()];

  return {
    baseFormData: {
      ...emptyForm(),
      name: asString(rec.name),
      description: asString(rec.description),
      cluster: clusterId,
      sqlQuery: query,
      checkInterval: checkIntervalMinutes.toString(),
      thresholds: toThresholdRows(thresholds),
      compareColumn: thresholdColumnName,
      ruleEnabled: enabled,
      channels,
    },
    thresholdColumnName,
  };
};
