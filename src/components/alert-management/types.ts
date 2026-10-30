import type { AlertThresholdLevel } from "@/lib/alert/thresholds";

export type AlertSeverity = "critical" | "warning" | "info";
export type AlertStatus = "active" | "resolved";

export type NotificationChannelUiType = "Slack" | "Teams" | "Webhook" | "Email";

export interface AlertRule {
  id: string;
  name: string;
  cluster: string;
  metric: string;
  condition: string;
  threshold: number;
  duration: number;
  severity: AlertSeverity;
  enabled: boolean;
  notificationChannels: string[];
  createdAt: string;
  thresholdColumnName?: string;
  thresholds?: AlertThresholdLevel[];
}

export interface AlertHistory {
  id: string;
  ruleName: string;
  cluster: string;
  severity: AlertSeverity;
  message: string;
  triggeredAt: string;
  status: AlertStatus;
  resolvedAt?: string | null;
}

export interface NotificationChannel {
  id: string;
  type: NotificationChannelUiType;
  url: string;
  messageTemplate: string;
  customMessage: string;
}

export interface QueryTestResult {
  success: boolean;
  rowCount?: number;
  thresholdMet?: boolean;
  matchedSeverity?: AlertSeverity;
  executionTimeMs?: number;
  error?: string;
}

export interface ThresholdRow {
  id: string;
  severity: AlertSeverity;
  operator: string;
  value: string;
}

export interface AlertRuleFormData {
  name: string;
  cluster: string;
  metric: string;
  description: string;
  checkInterval: string;
  sqlQuery: string;
  compareColumn: string;
  thresholds: ThresholdRow[];
  channels: NotificationChannel[];
  ruleEnabled: boolean;
  queryTested: boolean;
  queryColumns: string[];
  testResult: QueryTestResult | null;
  selectedTemplate: string;
  templateCategory: string;
  timeRangeMinutes: string;
}

export type AlertFormFieldErrorKey =
  | "name"
  | "cluster"
  | "description"
  | "sqlQuery"
  | "checkInterval"
  | "compareColumn";

export type AlertFormFieldErrors = Partial<Record<AlertFormFieldErrorKey, string>>;
export type AlertThresholdErrors = Record<string, string>;
export type AlertRuleFormSyncOptions = {
  clearFieldErrors?: AlertFormFieldErrorKey[];
  clearThresholdErrors?: boolean;
  clearChannelErrors?: boolean;
};

export interface AlertDialogValidationState {
  fieldErrors: AlertFormFieldErrors;
  thresholdErrors: AlertThresholdErrors;
  channelErrors: Record<string, string>;
}

export type AlertMutationResult =
  | { success: true }
  | {
      success: false;
      validationState?: AlertDialogValidationState;
      message?: string;
    };

export type AlertValidationFailureResult = {
  success: false;
  validationState: AlertDialogValidationState;
  message?: string;
};

export type AlertQueryTestExecutionResult =
  | { success: true; formData: AlertRuleFormData }
  | AlertValidationFailureResult;

export type AlertNotificationTestResult = { success: true } | AlertValidationFailureResult;

export interface ClusterOption {
  id: string;
  name: string;
  environment: string;
  status?: string;
}
