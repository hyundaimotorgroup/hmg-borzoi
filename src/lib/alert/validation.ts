import { type ZodError, z } from 'zod';

import {
  ALERT_SEVERITY_LEVELS,
  ALERT_THRESHOLD_OPERATORS,
  parseThresholdLevels,
  type AlertThresholdLevel,
} from './thresholds';
import { findForbiddenKeyword, hasMultipleStatements } from './query-policy';

// Alert bodies can embed query results, so plaintext HTTP would expose that
// data on the wire. Only opt in for a known internal/dev endpoint via env var —
// and never in production, where a misconfigured env var must not silently
// downgrade every webhook to plaintext.
const ALLOW_INSECURE_WEBHOOKS =
  process.env.NODE_ENV !== 'production' && process.env.ALERT_ALLOW_INSECURE_WEBHOOKS === 'true';

export const notificationChannelSchema = z
  .object({
    type: z.enum(['slack', 'email', 'webhook', 'teams']),
    url: z.string().url('Invalid URL format').optional(),
    to: z.string().email('Invalid email format').optional(),
    templateType: z.enum(['basic', 'compact', 'verbose', 'custom']).default('basic'),
    body: z.any().optional(),
  })
  .refine(
    (data) => {
      if (data.type === 'slack' || data.type === 'webhook' || data.type === 'teams') {
        return !!data.url;
      }
      if (data.type === 'email') {
        return !!data.to;
      }
      return true;
    },
    { message: 'Enter an address matching the channel type' }
  )
  .refine(
    (data) => {
      if (!data.url || ALLOW_INSECURE_WEBHOOKS) return true;
      if (data.type === 'slack' || data.type === 'webhook' || data.type === 'teams') {
        try {
          return new URL(data.url).protocol === 'https:';
        } catch {
          return false;
        }
      }
      return true;
    },
    { message: 'Webhook/Slack/Teams URLs must use https://' }
  );

export const thresholdLevelSchema = z.object({
  severity: z.enum(ALERT_SEVERITY_LEVELS),
  operator: z.enum(ALERT_THRESHOLD_OPERATORS),
  value: z
    .number()
    .finite('Enter a valid number'),
  order: z.number().int().nonnegative().optional(),
});

function validateThresholdLevels(thresholds: AlertThresholdLevel[], ctx: z.RefinementCtx) {
  const seenSeverities = new Set<string>();
  const operatorFamily = thresholds[0]?.operator;
  const ordered = [...thresholds].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  thresholds.forEach((threshold, index) => {
    if (seenSeverities.has(threshold.severity)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['thresholds', index, 'severity'],
        message: 'Each severity level can only be set once',
      });
    }
    seenSeverities.add(threshold.severity);

    if (!operatorFamily) return;

    const monotonicFamilies: Record<string, string[]> = {
      '>': ['>', '>='],
      '>=': ['>', '>='],
      '<': ['<', '<='],
      '<=': ['<', '<='],
      '=': ['='],
      '!=': ['!='],
    };

    if (!monotonicFamilies[operatorFamily]?.includes(threshold.operator)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['thresholds', index, 'operator'],
        message: 'Only operators in the same direction can be combined',
      });
    }
  });

  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1];
    const current = ordered[index];

    if ((operatorFamily === '>' || operatorFamily === '>=') && current.value <= previous.value) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['thresholds', index, 'value'],
        message: 'Ascending thresholds must have increasing values',
      });
    }

    if ((operatorFamily === '<' || operatorFamily === '<=') && current.value >= previous.value) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['thresholds', index, 'value'],
        message: 'Descending thresholds must have decreasing values',
      });
    }
  }
}

const querySchema = z
  .string()
  .min(1, 'SQL query is required')
  .refine((val) => val.trim().toLowerCase().startsWith('select'), 'Only SELECT queries are allowed')
  .refine((val) => !hasMultipleStatements(val), 'Only a single SQL statement is allowed')
  .refine(
    (val) => !findForbiddenKeyword(val),
    'Data mutation queries are not allowed (INSERT, UPDATE, DELETE, etc.)'
  );

const clusterIdSchema = z
  .string()
  .trim()
  .min(1, 'Select a cluster')
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'A valid cluster ID is required')
  .refine((value) => value !== 'all', 'Please select a specific cluster');

const thresholdsSchema = z.array(thresholdLevelSchema).min(1, 'At least one threshold is required');

const alertRuleSchemaBase = z.object({
  clusterId: clusterIdSchema,
  name: z.string().min(1, 'Alert rule name is required').max(100, 'Alert rule name must not exceed 100 characters'),
  description: z.string().max(500, 'Description must not exceed 500 characters').optional(),
  query: querySchema,
  checkIntervalMinutes: z
    .number()
    .int('Integers only')
    .min(1, 'Minimum check interval is 1 minute')
    .max(1440, 'Maximum check interval is 1440 minutes (24 hours)'),
  thresholds: thresholdsSchema,
  thresholdColumnName: z.string().optional(),
  notificationChannels: z
    .array(notificationChannelSchema)
    .min(1, 'At least one notification channel is required')
    .max(5, 'Up to 5 notification channels can be configured'),
  resultDisplayMode: z.enum(['showOnlyTriggering', 'showAll']).default('showOnlyTriggering'),
  enabled: z.boolean().default(true),
});

export const alertRuleSchema = alertRuleSchemaBase.superRefine((data, ctx) => {
  validateThresholdLevels(data.thresholds, ctx);
});

export const alertRulePatchSchema = alertRuleSchemaBase.partial().superRefine((data, ctx) => {
  if (data.thresholds) {
    validateThresholdLevels(data.thresholds, ctx);
  }
});

export const alertRuleApiCreateSchema = alertRuleSchema;
export const alertRuleApiPatchSchema = alertRulePatchSchema;

export const alertRuleTestSchema = z
  .object({
    clusterId: clusterIdSchema,
    query: querySchema,
    thresholds: thresholdsSchema,
    thresholdColumnName: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    validateThresholdLevels(data.thresholds, ctx);
  });

export const alertNotificationTestSchema = z
  .object({
    clusterId: clusterIdSchema,
    name: z.string().min(1, 'Alert rule name is required').max(100, 'Alert rule name must not exceed 100 characters'),
    description: z.string().max(500, 'Description must not exceed 500 characters').optional(),
    query: querySchema,
    thresholds: thresholdsSchema,
    thresholdColumnName: z.string().optional(),
    channel: notificationChannelSchema,
  })
  .superRefine((data, ctx) => {
    validateThresholdLevels(data.thresholds, ctx);
  });

export const alertRuleTriggerSchema = z.object({
  alertRuleId: z.string().trim().min(1, 'alertRuleId is required'),
});

export function serializeAlertThresholds(thresholds: AlertThresholdLevel[]) {
  return thresholds.map((threshold) => ({
    severity: threshold.severity,
    operator: threshold.operator,
    value: threshold.value,
    ...(threshold.order !== undefined ? { order: threshold.order } : {}),
  }));
}

export function getNotificationChannelIssueMap(
  error: ZodError,
  rootField: 'notificationChannels' | 'channel' = 'notificationChannels'
): Record<number, string> {
  const channelIssues: Record<number, string> = {};

  for (const issue of error.issues) {
    const [root, index] = issue.path;
    if (root !== rootField) {
      continue;
    }

    const channelIndex = typeof index === 'number' ? index : 0;
    if (channelIssues[channelIndex]) {
      continue;
    }

    channelIssues[channelIndex] = issue.message;
  }

  return channelIssues;
}

export function parseNotificationChannels(raw: unknown): NotificationChannel[] {
  let channels: unknown = raw;

  if (typeof channels === 'string') {
    try {
      channels = JSON.parse(channels);
    } catch {
      return [];
    }
  }

  if (!Array.isArray(channels)) {
    channels = channels && typeof channels === 'object' ? [channels] : [];
  }

  const validChannels: NotificationChannel[] = [];
  for (const channel of channels as unknown[]) {
    const result = notificationChannelSchema.safeParse(channel);
    if (result.success) {
      validChannels.push(result.data);
    }
  }
  return validChannels;
}

export function serializeAlertRuleResponse<T extends { notificationChannels: unknown; thresholds?: unknown }>(rule: T) {
  return {
    ...rule,
    notificationChannels: parseNotificationChannels(rule.notificationChannels),
    thresholds: parseThresholdLevels(rule.thresholds),
  };
}

export type NotificationChannel = z.infer<typeof notificationChannelSchema>;
