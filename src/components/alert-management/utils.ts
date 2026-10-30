import { AlertCircle, AlertTriangle, Bell } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { NOTIFICATION_TEMPLATES, type ChannelType, type TemplateType } from "@/lib/alert/templates";

import type {
  AlertRuleFormData,
  AlertSeverity,
  AlertStatus,
  NotificationChannel,
  NotificationChannelUiType,
  ThresholdRow,
} from "./types";

const thresholdSeverityOrder: Record<ThresholdRow["severity"], number> = {
  info: 0,
  warning: 1,
  critical: 2,
};

export const severityConfig: Record<
  AlertSeverity,
  { bg: string; text: string; icon: LucideIcon; color: string }
> = {
  critical: {
    bg: "bg-red-100",
    text: "text-red-800",
    icon: AlertCircle,
    color: "text-red-600",
  },
  warning: {
    bg: "bg-orange-100",
    text: "text-orange-800",
    icon: AlertTriangle,
    color: "text-orange-600",
  },
  info: {
    bg: "bg-blue-100",
    text: "text-blue-800",
    icon: Bell,
    color: "text-blue-600",
  },
};

export const statusConfig: Record<AlertStatus, { bg: string; text: string; label: string }> = {
  active: { bg: "bg-red-100", text: "text-red-800", label: "Active" },
  resolved: { bg: "bg-green-100", text: "text-green-800", label: "Resolved" },
};

export const CHANNEL_PLACEHOLDER: Record<NotificationChannelUiType, string> = {
  Slack: "https://hooks.slack.com/services/...",
  Teams: "https://outlook.office.com/webhook/...",
  Webhook: "https://your-webhook-url",
  Email: "alerts@example.com",
};

export const newChannel = (): NotificationChannel => ({
  id: `ch-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  type: "Slack",
  url: "",
  messageTemplate: "default — standard format (with table)",
  customMessage: JSON.stringify(
    {
      text: "🚨 {{ruleName}}",
      value: "{{queryResult}}",
      threshold: "{{threshold}}",
      timestamp: "{{timestamp}}",
    },
    null,
    2
  ),
});

export const newThresholdRow = (severity: AlertSeverity = "warning", operator = ">=", value = "0"): ThresholdRow => ({
  id: `th-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  severity,
  operator,
  value,
});

export const sortThresholdRows = (thresholds: ThresholdRow[]) =>
  [...thresholds].sort((left, right) => {
    const severityDiff = thresholdSeverityOrder[left.severity] - thresholdSeverityOrder[right.severity];
    if (severityDiff !== 0) return severityDiff;

    const leftValue = Number.parseFloat(left.value);
    const rightValue = Number.parseFloat(right.value);
    const leftComparable = Number.isFinite(leftValue) ? leftValue : Number.POSITIVE_INFINITY;
    const rightComparable = Number.isFinite(rightValue) ? rightValue : Number.POSITIVE_INFINITY;
    if (leftComparable !== rightComparable) return leftComparable - rightComparable;

    return left.id.localeCompare(right.id);
  });

const UI_TO_CHANNEL_TYPE: Record<NotificationChannelUiType, ChannelType> = {
  Slack: "slack",
  Teams: "teams",
  Webhook: "webhook",
  Email: "email",
};

export type DbNotificationChannel = {
  type: ChannelType;
  url?: string;
  to?: string;
  templateType: TemplateType;
  body?: unknown;
};

const templateTypeFromUiLabel = (label: string): TemplateType => {
  if (label === "custom") return "custom";
  if (label === "minimal — text only") return "compact";
  if (label === "verbose — full query result") return "verbose";
  return "basic";
};

export const uiChannelToDb = (ch: NotificationChannel): DbNotificationChannel => {
  const channelType = UI_TO_CHANNEL_TYPE[ch.type];
  const templateType = templateTypeFromUiLabel(ch.messageTemplate);

  // Resolve the actual template structure at save time and persist it to the DB.
  let resolvedBody: unknown;
  if (templateType === "custom") {
    resolvedBody = ch.customMessage;
  } else {
    const channelTemplates = NOTIFICATION_TEMPLATES[channelType];
    resolvedBody = channelTemplates?.[templateType]?.template;
  }

  return {
    type: channelType,
    ...(channelType === "email" ? { to: ch.url || undefined } : { url: ch.url || undefined }),
    templateType,
    ...(resolvedBody !== undefined && resolvedBody !== null ? { body: resolvedBody } : {}),
  };
};

const channelTypeToUi = (channelType: string): NotificationChannelUiType => {
  switch (channelType) {
    case "slack":
      return "Slack";
    case "teams":
      return "Teams";
    case "webhook":
      return "Webhook";
    case "email":
      return "Email";
    default:
      return "Slack";
  }
};

export const dbChannelToUi = (ch: unknown, idx: number): NotificationChannel => {
  const raw = (typeof ch === "object" && ch !== null ? ch : {}) as Record<string, unknown>;

  const typeRaw = typeof raw.type === "string" ? raw.type : "slack";
  const uiType = channelTypeToUi(typeRaw.toLowerCase());

  const templateTypeRaw = typeof raw.templateType === "string" ? raw.templateType : "basic";
  const body = raw.body;
  const url = typeof raw.url === "string" ? raw.url : typeof raw.to === "string" ? raw.to : "";

  let messageTemplate = "default — standard format (with table)";
  let customMessage = "";

  if (templateTypeRaw === "compact") {
    messageTemplate = "minimal — text only";
  } else if (templateTypeRaw === "verbose") {
    messageTemplate = "verbose — full query result";
  } else if (templateTypeRaw === "custom") {
    messageTemplate = "custom";
    if (typeof body === "string") {
      customMessage = body;
    } else if (body !== undefined && body !== null) {
      customMessage = JSON.stringify(body, null, 2);
    } else {
      customMessage = JSON.stringify(
        {
          text: "🚨 {{ruleName}}",
          value: "{{queryResult}}",
        },
        null,
        2
      );
    }
  }

  return {
    id: `ch-edit-${idx}`,
    type: uiType,
    url,
    messageTemplate,
    customMessage,
  };
};

export const emptyForm = (): AlertRuleFormData => ({
  name: "",
  cluster: "all",
  metric: "cpu_usage",
  description: "",
  checkInterval: "5",
  sqlQuery: "SELECT count() FROM system.tables",
  compareColumn: "",
  thresholds: [newThresholdRow("warning", ">=", "80")],
  channels: [newChannel()],
  ruleEnabled: true,
  queryTested: false,
  queryColumns: [],
  testResult: null,
  selectedTemplate: "custom",
  templateCategory: "all",
  timeRangeMinutes: "",
});
