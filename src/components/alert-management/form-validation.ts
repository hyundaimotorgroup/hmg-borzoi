import { z, type ZodError } from "zod";

import {
  alertNotificationTestSchema,
  alertRuleApiCreateSchema,
  alertRuleTestSchema,
  getNotificationChannelIssueMap,
} from "@/lib/alert/validation";
import { ALERT_SEVERITY_LEVELS, ALERT_THRESHOLD_OPERATORS } from "@/lib/alert/thresholds";

import type {
  AlertFormFieldErrorKey,
  AlertFormFieldErrors,
  AlertRuleFormData,
  AlertThresholdErrors,
  NotificationChannel,
} from "./types";
import { uiChannelToDb } from "./utils";

const numericStringSchema = z
  .string()
  .trim()
  .min(1, "Enter a valid number")
  .refine((value) => Number.isFinite(Number(value)), "Enter a valid number")
  .transform((value) => Number(value));

const alertThresholdRowFormSchema = z.object({
  id: z.string(),
  severity: z.enum(ALERT_SEVERITY_LEVELS),
  operator: z.enum(ALERT_THRESHOLD_OPERATORS),
  value: numericStringSchema,
});

const alertNotificationChannelFormSchema = z
  .object({
    id: z.string(),
    type: z.enum(["Slack", "Teams", "Webhook", "Email"]),
    url: z.string(),
    messageTemplate: z.string(),
    customMessage: z.string(),
  })
  .transform(uiChannelToDb);

const alertRuleFormInputSchema = z.object({
  cluster: z.string().trim(),
  name: z.string().trim(),
  description: z.string().trim(),
  sqlQuery: z.string().trim(),
  checkInterval: numericStringSchema,
  compareColumn: z.string().trim(),
  thresholds: z.array(alertThresholdRowFormSchema),
  channels: z.array(alertNotificationChannelFormSchema),
  ruleEnabled: z.boolean(),
});

const alertRuleTestInputSchema = alertRuleFormInputSchema.pick({
  cluster: true,
  sqlQuery: true,
  compareColumn: true,
  thresholds: true,
});

const alertNotificationTestInputSchema = z.object({
  cluster: z.string().trim(),
  name: z.string().trim(),
  description: z.string().trim(),
  sqlQuery: z.string().trim(),
  compareColumn: z.string().trim(),
  thresholds: z.array(alertThresholdRowFormSchema),
  channel: alertNotificationChannelFormSchema,
});

const toThresholdLevels = (
  thresholds: z.infer<typeof alertThresholdRowFormSchema>[]
) =>
  thresholds.map((threshold, index) => ({
    severity: threshold.severity,
    operator: threshold.operator,
    value: threshold.value,
    order: index,
  }));

export const parseAlertRuleForm = (formData: AlertRuleFormData) => {
  const parsed = alertRuleFormInputSchema.safeParse({
    cluster: formData.cluster,
    name: formData.name,
    description: formData.description,
    sqlQuery: formData.sqlQuery,
    checkInterval: formData.checkInterval,
    compareColumn: formData.compareColumn,
    thresholds: formData.thresholds,
    channels: formData.channels,
    ruleEnabled: formData.ruleEnabled,
  });

  if (!parsed.success) {
    return parsed;
  }

  return alertRuleApiCreateSchema.safeParse({
    clusterId: parsed.data.cluster,
    name: parsed.data.name,
    description: parsed.data.description || undefined,
    query: parsed.data.sqlQuery,
    checkIntervalMinutes: parsed.data.checkInterval,
    thresholds: toThresholdLevels(parsed.data.thresholds),
    thresholdColumnName: parsed.data.compareColumn || undefined,
    notificationChannels: parsed.data.channels,
    enabled: parsed.data.ruleEnabled,
  });
};

export const parseAlertRuleTestForm = (formData: AlertRuleFormData) => {
  const parsed = alertRuleTestInputSchema.safeParse({
    cluster: formData.cluster,
    sqlQuery: formData.sqlQuery,
    compareColumn: formData.compareColumn,
    thresholds: formData.thresholds,
  });

  if (!parsed.success) {
    return parsed;
  }

  return alertRuleTestSchema.safeParse({
    clusterId: parsed.data.cluster,
    query: parsed.data.sqlQuery,
    thresholds: toThresholdLevels(parsed.data.thresholds),
    thresholdColumnName: parsed.data.compareColumn || undefined,
  });
};

export const parseAlertNotificationTestForm = (
  formData: AlertRuleFormData,
  channel: NotificationChannel
) => {
  const parsed = alertNotificationTestInputSchema.safeParse({
    cluster: formData.cluster,
    name: formData.name,
    description: formData.description,
    sqlQuery: formData.sqlQuery,
    compareColumn: formData.compareColumn,
    thresholds: formData.thresholds,
    channel,
  });

  if (!parsed.success) {
    return parsed;
  }

  return alertNotificationTestSchema.safeParse({
    clusterId: parsed.data.cluster,
    name: parsed.data.name || "Test Alert",
    description: parsed.data.description || undefined,
    query: parsed.data.sqlQuery,
    thresholds: toThresholdLevels(parsed.data.thresholds),
    thresholdColumnName: parsed.data.compareColumn || undefined,
    channel: parsed.data.channel,
  });
};

export function buildAlertChannelErrorMap(
  channels: Pick<NotificationChannel, "id">[],
  error: ZodError,
  rootField: "notificationChannels" | "channel" = "notificationChannels"
) {
  return Object.fromEntries(
    Object.entries(getNotificationChannelIssueMap(error, rootField))
      .map(([index, message]) => {
        const channel = channels[Number(index)];
        return channel ? [channel.id, message] : null;
      })
      .filter((entry): entry is [string, string] => entry !== null)
  );
}

const ALERT_FIELD_PATH_TO_UI_KEY: Partial<Record<string, AlertFormFieldErrorKey>> = {
  clusterId: "cluster",
  name: "name",
  description: "description",
  query: "sqlQuery",
  checkIntervalMinutes: "checkInterval",
  thresholdColumnName: "compareColumn",
};

export function buildAlertFormErrorState(
  formData: Pick<AlertRuleFormData, "thresholds">,
  error: ZodError
): {
  fieldErrors: AlertFormFieldErrors;
  thresholdErrors: AlertThresholdErrors;
} {
  const fieldErrors: AlertFormFieldErrors = {};
  const thresholdErrors: AlertThresholdErrors = {};

  for (const issue of error.issues) {
    const [root, index] = issue.path;

    if (root === "thresholds" && typeof index === "number") {
      const threshold = formData.thresholds[index];
      if (threshold && !thresholdErrors[threshold.id]) {
        thresholdErrors[threshold.id] = issue.message;
      }
      continue;
    }

    if (typeof root === "string") {
      const fieldKey = ALERT_FIELD_PATH_TO_UI_KEY[root];
      if (fieldKey && !fieldErrors[fieldKey]) {
        fieldErrors[fieldKey] = issue.message;
      }
    }
  }

  return {
    fieldErrors,
    thresholdErrors,
  };
}
