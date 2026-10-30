import { applyTimeRangeToQuery, type QueryTemplate } from "@/lib/alert/query-templates";

import type { AlertRuleFormData, AlertSeverity } from "./types";

export function resetAlertQueryState(
  formData: AlertRuleFormData,
  overrides: Partial<AlertRuleFormData> = {}
): AlertRuleFormData {
  return {
    ...formData,
    ...overrides,
    queryTested: false,
    queryColumns: [],
    testResult: null,
  };
}

export function normalizeAlertMatchedSeverity(value: unknown): AlertSeverity | undefined {
  return value === "critical" || value === "warning" || value === "info" ? value : undefined;
}

function pickAlertCompareColumn({
  currentColumn,
  persistedColumn,
  columns,
  numericColumns,
}: {
  currentColumn?: string;
  persistedColumn?: string;
  columns: string[];
  numericColumns: string[];
}): string {
  const candidates = [currentColumn, persistedColumn, numericColumns[0], columns[0]];
  for (const candidate of candidates) {
    if (candidate && columns.includes(candidate)) {
      return candidate;
    }
  }
  return "";
}

export function applyAlertQueryTestSuccess(
  formData: AlertRuleFormData,
  options: {
    columns: string[];
    numericColumns?: string[];
    persistedColumn?: string;
    rowCount?: number;
    thresholdMet?: boolean;
    matchedSeverity?: AlertSeverity;
    executionTimeMs?: number;
  }
): AlertRuleFormData {
  return {
    ...formData,
    queryTested: true,
    queryColumns: options.columns,
    compareColumn: pickAlertCompareColumn({
      currentColumn: formData.compareColumn,
      persistedColumn: options.persistedColumn,
      columns: options.columns,
      numericColumns: options.numericColumns ?? [],
    }),
    testResult:
      options.columns.length > 0
        ? {
            success: true,
            rowCount: options.rowCount,
            thresholdMet: options.thresholdMet,
            matchedSeverity: options.matchedSeverity,
            executionTimeMs: options.executionTimeMs,
          }
        : null,
  };
}

export function applyAlertQueryTestColumns(
  formData: AlertRuleFormData,
  columns: string[]
): AlertRuleFormData {
  return {
    ...formData,
    queryTested: true,
    queryColumns: columns,
  };
}

export function applyAlertQueryTestFailure(
  formData: AlertRuleFormData,
  options: {
    columns?: string[];
    error: string;
  }
): AlertRuleFormData {
  return {
    ...formData,
    queryTested: true,
    queryColumns: options.columns ?? [],
    testResult: { success: false, error: options.error },
  };
}

export function applyAlertSqlQueryChange(
  formData: AlertRuleFormData,
  sqlQuery: string
): AlertRuleFormData {
  return resetAlertQueryState(formData, {
    sqlQuery,
    selectedTemplate: "custom",
  });
}

export function applyAlertTimeRangeChange(
  formData: AlertRuleFormData,
  timeRangeMinutes: string,
  template?: QueryTemplate
): AlertRuleFormData {
  if (!template || template.timeRangeMinutes === null || timeRangeMinutes.trim() === "") {
    return {
      ...formData,
      timeRangeMinutes,
    };
  }

  const parsedTimeRange = Number.parseInt(timeRangeMinutes, 10);
  if (!Number.isFinite(parsedTimeRange) || parsedTimeRange <= 0) {
    return {
      ...formData,
      timeRangeMinutes,
    };
  }

  return resetAlertQueryState(formData, {
    timeRangeMinutes,
    sqlQuery: applyTimeRangeToQuery(template.query, parsedTimeRange),
  });
}

export function applyAlertTemplateSelection(
  formData: AlertRuleFormData,
  template: QueryTemplate,
  previousTemplate?: QueryTemplate
): AlertRuleFormData {
  const timeRange = template.timeRangeMinutes != null ? String(template.timeRangeMinutes) : "";
  const query =
    template.timeRangeMinutes != null
      ? applyTimeRangeToQuery(template.query, template.timeRangeMinutes)
      : template.query;

  return resetAlertQueryState(formData, {
    selectedTemplate: template.id,
    templateCategory: template.category,
    name: !formData.name || formData.name === previousTemplate?.name ? template.name : formData.name,
    description:
      !formData.description || formData.description === previousTemplate?.description
        ? template.description
        : formData.description,
    sqlQuery: query,
    compareColumn:
      !formData.compareColumn || formData.compareColumn === previousTemplate?.suggestedColumn
        ? template.suggestedColumn
        : formData.compareColumn,
    checkInterval: String(template.suggestedCheckIntervalMinutes),
    thresholds:
      formData.thresholds.length === 1
        ? [{ ...formData.thresholds[0], operator: template.suggestedOperator, value: String(template.suggestedValue) }]
        : formData.thresholds,
    timeRangeMinutes: timeRange,
  });
}
