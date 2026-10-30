import type { AlertRule } from '@prisma/client';
import { NOTIFICATION_TEMPLATES } from './templates';
import { logger } from '@/lib/utils/logger';
import { prisma } from '@/lib/prisma';
import https from 'node:https';
import http from 'node:http';
import { createSafeLookup, isPrivateOrReservedHost } from '@/lib/validation/network';
import {
  formatThresholdCondition,
  getHighestSeverity,
  getPrimaryThreshold,
  parseThresholdLevels,
  type AlertSeverityLevel,
  type AlertThresholdLevel,
} from './thresholds';

const WEBHOOK_TIMEOUT_MS = 10_000;
// Absolute wall-clock cap on the whole request/response cycle. `timeout` above only
// resets Node's per-socket *idle* timer, so a peer that trickles a few bytes more
// often than every WEBHOOK_TIMEOUT_MS never triggers it — this bounds total duration
// regardless of activity.
const WEBHOOK_MAX_DURATION_MS = 30_000;
const WEBHOOK_MAX_RESPONSE_BYTES = 1024 * 1024; // 1MB
// Alert bodies can embed query results, so plaintext HTTP would expose that
// data on the wire. Only opt in for a known internal/dev endpoint via env var —
// and never in production, where a misconfigured env var must not silently
// downgrade every webhook to plaintext.
const ALLOW_INSECURE_WEBHOOKS =
  process.env.NODE_ENV !== 'production' && process.env.ALERT_ALLOW_INSECURE_WEBHOOKS === 'true';

async function fetchWebhook(url: string, body: string, contentType = 'application/json'): Promise<{ ok: boolean; status: number; statusText: string; text: () => Promise<string> }> {
  const parsedUrl = new URL(url);

  if (parsedUrl.protocol !== 'https:' && !ALLOW_INSECURE_WEBHOOKS) {
    throw new Error('Webhook URL must use https:// (set ALERT_ALLOW_INSECURE_WEBHOOKS=true to allow plaintext HTTP for internal/dev use).');
  }

  // Re-check the hostname immediately before sending, in addition to the check done
  // at channel-registration time (see alert/validation.ts) — this guards against
  // DNS rebinding between the time a URL was saved and the time it's actually sent to.
  if (await isPrivateOrReservedHost(parsedUrl.hostname)) {
    throw new Error('Webhook URL resolves to a private, loopback, or reserved network address and is not allowed.');
  }

  return new Promise((resolve, reject) => {
    const isHttps = parsedUrl.protocol === 'https:';
    const baseOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? '443' : '80'),
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'POST',
      headers: { 'Content-Type': contentType, 'Content-Length': Buffer.byteLength(body) },
      // Pin the resolver used for the actual connection to the same
      // private/reserved-IP check above, so a hostname that resolves to a
      // public IP during the pre-check above but a private one by the time
      // the socket connects (DNS rebinding) is still blocked.
      lookup: createSafeLookup(),
      // Bound how long we wait on an unresponsive/slow-drip webhook endpoint.
      timeout: WEBHOOK_TIMEOUT_MS,
    };

    let settled = false;
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadlineTimer);
      fn();
    };

    const onResponse = (res: http.IncomingMessage) => {
      let data = '';
      let receivedBytes = 0;

      res.on('data', (chunk: Buffer) => {
        receivedBytes += chunk.length;
        // Bound how much of a malicious/misbehaving endpoint's response we buffer in memory.
        if (receivedBytes > WEBHOOK_MAX_RESPONSE_BYTES) {
          res.destroy();
          req.destroy();
          settle(() => reject(new Error(`Webhook response exceeded maximum size of ${WEBHOOK_MAX_RESPONSE_BYTES} bytes`)));
          return;
        }
        data += chunk;
      });
      res.on('end', () => {
        const status = res.statusCode ?? 0;
        settle(() => resolve({ ok: status >= 200 && status < 300, status, statusText: res.statusMessage ?? '', text: () => Promise.resolve(data) }));
      });
    };

    const req = isHttps
      ? https.request(baseOptions, onResponse)
      : http.request(baseOptions, onResponse);

    const deadlineTimer = setTimeout(() => {
      req.destroy(new Error(`Webhook request exceeded maximum duration of ${WEBHOOK_MAX_DURATION_MS}ms`));
    }, WEBHOOK_MAX_DURATION_MS);

    req.on('timeout', () => {
      req.destroy(new Error(`Webhook request timed out after ${WEBHOOK_TIMEOUT_MS}ms`));
    });
    req.on('error', (err) => settle(() => reject(err)));
    req.write(body);
    req.end();
  });
}

type SlackBlock = { type: string; fields?: { type: string; text: string }[] } | { type: 'divider' };

export type NotificationChannel =
  | { type: 'slack'; url: string; templateType?: string; body?: Record<string, unknown> }
  | { type: 'email'; url?: string; to?: string; templateType?: string; body?: Record<string, unknown> }
  | { type: 'webhook'; url: string; templateType?: string; body?: Record<string, unknown> }
  | { type: 'teams'; url: string; templateType?: string; body?: Record<string, unknown> };

export type NotificationRuleContext = Pick<AlertRule, 'name' | 'description' | 'clusterId' | 'thresholds' | 'thresholdColumnName'>;

type NotificationRuleWithChannels = NotificationRuleContext & Pick<AlertRule, 'notificationChannels'>;

function normalizeChannel(channel: NotificationChannel): NotificationChannel {
  let body = channel.body;

  if (channel.templateType && channel.templateType !== 'custom') {
    const templates = NOTIFICATION_TEMPLATES[channel.type as keyof typeof NOTIFICATION_TEMPLATES];
    const template = templates?.[channel.templateType as keyof typeof templates];
    if (template) {
      body = (template as { template: Record<string, unknown> }).template;
    }
  } else if (!body && channel.templateType === 'custom') {
    body = undefined;
  }

  return {
    ...channel,
    body: parseCustomBody(body),
  };
}

function parseNotificationChannelsFromRule(rule: NotificationRuleWithChannels): NotificationChannel[] {
  let channels: NotificationChannel[];

  if (typeof rule.notificationChannels === 'string') {
    try {
      channels = JSON.parse(rule.notificationChannels) as NotificationChannel[];
    } catch (error) {
      logger.error('[Notifier] Failed to parse notificationChannels:', error);
      throw new Error('Invalid notification channels format');
    }
  } else {
    channels = rule.notificationChannels as NotificationChannel[];
  }

  if (!channels || !Array.isArray(channels) || channels.length === 0) {
    throw new Error('No notification channels configured');
  }

  return channels;
}

export async function sendNotification(
  rule: NotificationRuleWithChannels,
  triggeringRow: Record<string, unknown>,
  allRows?: Record<string, unknown>[],
  executionTimeMs?: number,
  matchedThreshold?: AlertThresholdLevel | null
): Promise<void> {
  const channels = parseNotificationChannelsFromRule(rule).map(normalizeChannel);

  const cluster = await prisma.cluster.findUnique({ where: { id: rule.clusterId }, select: { name: true } }).catch(() => null);

  const singleValue = getFirstNumericValue(triggeringRow);
  const ruleThresholds = parseThresholdLevels(rule.thresholds);
  const effectiveThreshold = matchedThreshold ?? getPrimaryThreshold(ruleThresholds) ?? null;
  const message = formatMessage(rule, singleValue ?? 0, effectiveThreshold);
  const variables = getMessageVariables(rule, triggeringRow, allRows, executionTimeMs, cluster?.name, effectiveThreshold);

  const results = await Promise.allSettled(
    channels.map(channel => sendToChannel(channel, message, variables))
  );

  const failures = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
  if (failures.length === channels.length) {
    const errors = failures
      .map(f => (f.reason instanceof Error ? f.reason.message : String(f.reason)))
      .join('; ');
    throw new Error(`All notification channels failed: ${errors}`);
  }

}

/**
 * A recovery notification sent once when transitioning from firing → resolved state.
 * Per-channel custom templates (body) are not used; the same fixed format is applied to all channel types.
 */
export async function sendResolvedNotification(
  rule: NotificationRuleWithChannels,
  previousSeverity: AlertSeverityLevel,
  executionTimeMs?: number
): Promise<void> {
  const channels = parseNotificationChannelsFromRule(rule);

  const cluster = await prisma.cluster.findUnique({ where: { id: rule.clusterId }, select: { name: true } }).catch(() => null);
  const message = formatResolvedMessage(rule, previousSeverity, cluster?.name, executionTimeMs);

  const results = await Promise.allSettled(
    channels.map(channel => sendResolvedToChannel(channel, message))
  );

  const failures = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
  if (failures.length === channels.length) {
    const errors = failures
      .map(f => (f.reason instanceof Error ? f.reason.message : String(f.reason)))
      .join('; ');
    throw new Error(`All notification channels failed: ${errors}`);
  }
}

function formatResolvedMessage(
  rule: NotificationRuleContext,
  previousSeverity: AlertSeverityLevel,
  clusterName?: string,
  executionTimeMs?: number
): string {
  return `
✅ Resolved: ${rule.name}

Previous Severity: ${previousSeverity}
Cluster: ${clusterName || rule.clusterId}
Description: ${rule.description || 'N/A'}
${executionTimeMs !== undefined ? `Execution Time: ${executionTimeMs}ms\n` : ''}
Time: ${new Date().toISOString()}
`.trim();
}

async function sendResolvedToChannel(channel: NotificationChannel, message: string): Promise<void> {
  switch (channel.type) {
    case 'slack':
      await sendResolvedWebhookPayload(
        channel.url,
        JSON.stringify({ text: message, username: 'ClickHouse Alert', icon_emoji: ':white_check_mark:' })
      );
      break;

    case 'teams':
      await sendResolvedWebhookPayload(
        channel.url,
        JSON.stringify({
          type: 'message',
          attachments: [{
            contentType: 'application/vnd.microsoft.card.adaptive',
            contentUrl: null,
            content: {
              $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
              type: 'AdaptiveCard',
              version: '1.2',
              msteams: { width: 'Full' },
              body: [{ type: 'TextBlock', text: message, wrap: true }],
            },
          }],
        })
      );
      break;

    case 'webhook':
      await sendResolvedWebhookPayload(channel.url, JSON.stringify({ text: message }));
      break;

    case 'email':
      throw new Error('Email notifications are not yet supported. Configure Slack, Teams, or Webhook instead.');

    default:
      throw new Error(`Unknown notification type: ${(channel as { type: string }).type}`);
  }
}

async function sendResolvedWebhookPayload(url: string, body: string): Promise<void> {
  const response = await fetchWebhook(url, body);
  if (!response.ok) {
    // Deliberately excludes the response body — this error's message can end up in
    // production logs (see sendSlack/sendTeams), so it must not carry secrets/PII.
    throw new Error(`Notification error: ${response.status} ${response.statusText}`);
  }
}

export async function sendNotificationToChannel(
  rule: NotificationRuleContext,
  channel: NotificationChannel,
  triggeringRow: Record<string, unknown>,
  allRows?: Record<string, unknown>[],
  executionTimeMs?: number,
  matchedThreshold?: AlertThresholdLevel | null,
  options: VariableBuildOptions = {}
): Promise<void> {
  const normalizedChannel = normalizeChannel(channel);
  const cluster = await prisma.cluster.findUnique({ where: { id: rule.clusterId }, select: { name: true } }).catch(() => null);

  const singleValue = getFirstNumericValue(triggeringRow);
  const ruleThresholds = parseThresholdLevels(rule.thresholds);
  const effectiveThreshold = matchedThreshold ?? getPrimaryThreshold(ruleThresholds) ?? null;
  const message = formatMessage(rule, singleValue ?? 0, effectiveThreshold);
  const variables = getMessageVariables(rule, triggeringRow, allRows, executionTimeMs, cluster?.name, effectiveThreshold, options);

  await sendToChannel(normalizedChannel, message, variables);
}

function hasValidPayload(payload: unknown): boolean {
  if (!payload) return false;
  if (typeof payload === 'string') return payload.trim() !== '';
  if (typeof payload === 'object') return Object.keys(payload as object).length > 0;
  return false;
}

function parseCustomBody(body: unknown): Record<string, unknown> | undefined {
  if (!body) return undefined;

  if (typeof body === 'string') {
    try {
      return JSON.parse(body) as Record<string, unknown>;
    } catch (_e) {
      return { text: body };
    }
  }

  if (typeof body === 'object' && body !== null) {
    return body as Record<string, unknown>;
  }

  return undefined;
}

function createMarkdownTable(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '';

  const firstRow = rows[0];
  const columns = Object.keys(firstRow);

  const header = '| ' + columns.join(' | ') + ' |';
  const separator = '| ' + columns.map(() => '---').join(' | ') + ' |';

  const body = rows
    .map(row => {
      const values = columns.map(col => {
        const val = row[col];
        return String(val ?? '-').replace(/\|/g, '\\|');
      });
      return '| ' + values.join(' | ') + ' |';
    })
    .join('\n');

  return [header, separator, body].join('\n');
}

function createHtmlTable(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '';

  const firstRow = rows[0];
  const columns = Object.keys(firstRow);

  let html = '<table style="border-collapse: collapse; width: 100%; border: 1px solid #ddd;">\n';

  html += '  <thead>\n    <tr style="background-color: #f2f2f2;">\n';
  columns.forEach(col => {
    html += `      <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">${col}</th>\n`;
  });
  html += '    </tr>\n  </thead>\n';

  html += '  <tbody>\n';
  rows.forEach((row, idx) => {
    const bgColor = idx % 2 === 0 ? 'white' : '#f9f9f9';
    html += `    <tr style="background-color: ${bgColor};">\n`;
    columns.forEach(col => {
      const val = row[col] ?? '-';
      html += `      <td style="border: 1px solid #ddd; padding: 8px;">${String(val)}</td>\n`;
    });
    html += '    </tr>\n';
  });
  html += '  </tbody>\n';
  html += '</table>';

  return html;
}

function createTeamsTableContent(rows: Record<string, unknown>[]): unknown[] {
  if (rows.length === 0) return [];

  const result: unknown[] = [];
  const preferredDetailOrder = ['shard', 'replica', 'disk_usage'];

  const createMetricColumn = (key: string, value: unknown, valueSize: 'small' | 'default' | 'medium' = 'default') => ({
    type: 'Column',
    width: 'stretch',
    items: [
      { type: 'TextBlock', text: key, weight: 'bolder', size: 'small', isSubtle: true, wrap: true },
      { type: 'TextBlock', text: String(value ?? '-'), size: valueSize, wrap: true, spacing: 'none' },
    ],
  });

  rows.forEach((row, rowIdx) => {
    const columns = Object.keys(row);
    const rowBlocks: Record<string, unknown>[] = [];

    if (rows.length > 1) {
      rowBlocks.push({
        type: 'TextBlock',
        text: `Result ${rowIdx + 1}`,
        size: 'small',
        weight: 'bolder',
        color: 'accent',
        wrap: true,
      });
    }

    if (columns.includes('host')) {
      rowBlocks.push({
        type: 'Container',
        spacing: rows.length === 1 && rowIdx === 0 ? 'none' : 'medium',
        items: [
          { type: 'TextBlock', text: 'host', weight: 'bolder', size: 'small', isSubtle: true, wrap: true },
          { type: 'TextBlock', text: String(row.host ?? '-'), weight: 'bolder', size: 'medium', wrap: true, spacing: 'none' },
        ],
      });

      const orderedKeys = [
        ...preferredDetailOrder.filter((key) => key in row),
        ...columns.filter((key) => key !== 'host' && !preferredDetailOrder.includes(key)),
      ];

      for (let i = 0; i < orderedKeys.length; i += 3) {
        const group = orderedKeys.slice(i, i + 3);
        const paddedGroup = [...group];

        while (paddedGroup.length < 3) {
          paddedGroup.push('');
        }

        rowBlocks.push({
          type: 'ColumnSet',
          spacing: 'medium',
          columns: paddedGroup.map((key) => {
            if (!key) {
              return {
                type: 'Column',
                width: 'stretch',
                items: [],
              };
            }

            return createMetricColumn(key, row[key]);
          }),
        });
      }
    } else {
      for (let i = 0; i < columns.length; i += 3) {
        const group = columns.slice(i, i + 3);
        const paddedGroup = [...group];

        while (paddedGroup.length < 3) {
          paddedGroup.push('');
        }

        rowBlocks.push({
          type: 'ColumnSet',
          spacing: i === 0 && rows.length === 1 ? 'none' : 'medium',
          columns: paddedGroup.map((key) => {
            if (!key) {
              return {
                type: 'Column',
                width: 'stretch',
                items: [],
              };
            }

            return createMetricColumn(key, row[key]);
          }),
        });
      }
    }

    result.push({
      type: 'Container',
      ...(rowIdx > 0 ? { separator: true, spacing: 'medium' } : { spacing: 'medium' }),
      items: rowBlocks,
    });
  });

  return result;
}

function normalizeTeamsCard(card: unknown): Record<string, unknown> {
  const defaultCardBody = [
    {
      type: 'TextBlock',
      text: 'Cannot display notification content.',
      wrap: true,
    },
  ];

  const defaultCard: Record<string, unknown> = {
    $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
    type: 'AdaptiveCard',
    version: '1.2',
    msteams: { width: 'Full' },
    body: defaultCardBody,
  };

  if (card === null || typeof card !== 'object' || Array.isArray(card)) {
    return defaultCard;
  }

  const cardObject = card as Record<string, unknown>;
  const body = Array.isArray(cardObject.body) ? cardObject.body : defaultCardBody;
  const normalizedCard: Record<string, unknown> = {
    ...cardObject,
    $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
    type: 'AdaptiveCard',
    version: '1.2',
    body,
    msteams: {
      ...(cardObject.msteams !== null && typeof cardObject.msteams === 'object' && !Array.isArray(cardObject.msteams)
        ? (cardObject.msteams as Record<string, unknown>)
        : {}),
      width: 'Full',
    },
  };

  delete normalizedCard.actions;

  return normalizedCard;
}

function createSlackTableBlocks(rows: Record<string, unknown>[]): SlackBlock[] {
  if (rows.length === 0) return [];

  const firstRow = rows[0];
  const columns = Object.keys(firstRow);

  const blocks: SlackBlock[] = [];

  rows.forEach((row, idx) => {
    const fields: { type: string; text: string }[] = [];

    columns.forEach(col => {
      fields.push({
        type: 'mrkdwn',
        text: `*${col}*\n${String(row[col] ?? '-')}`
      });
    });

    blocks.push({
      type: 'section',
      fields,
    });

    if (idx < rows.length - 1) {
      blocks.push({ type: 'divider' });
    }
  });

  return blocks;
}

function getFirstNumericValue(row: Record<string, unknown>): number | null {
  for (const value of Object.values(row)) {
    const num = parseFloat(String(value));
    if (!isNaN(num)) {
      return num;
    }
  }
  return null;
}

interface MessageVariables {
  ruleName: string;
  clusterName: string;
  severity: string;
  description: string;
  queryResult: Record<string, unknown>;
  resultValue: string;
  threshold: string;
  timestamp: string;
  executionTime?: number;
  executionTimeText: string;
  triggeringRows?: Record<string, unknown>[];
  allRows?: Record<string, unknown>[];
  allRowsMarkdownTable?: string;
  allRowsSlackBlocks?: SlackBlock[];
  allRowsTeamsContent?: unknown[];
  allRowsJson?: string;
  allRowsHtmlTable?: string;
  [key: string]: unknown;
}

interface VariableBuildOptions {
  fallbackToConfiguredThresholds?: boolean;
}

function cleanupThresholdAlias(row: Record<string, unknown>, originalColumnName?: string): Record<string, unknown> {
  if ('_threshold_val' in row) {
    const { _threshold_val, ...rest } = row;
    // Replace aggregate function names (count(), sum(), etc.) with human-readable names
    const isAggregateFunc = /^(sum|avg|count|min|max|any|groupArray)\s*\(/i.test((originalColumnName || '').trim());
    const displayName = (!originalColumnName || isAggregateFunc) ? 'Result value' : originalColumnName;
    return { ...rest, [displayName]: _threshold_val };
  }
  return row;
}

function getMessageVariables(
  rule: NotificationRuleContext,
  triggeringRow: Record<string, unknown>,
  allRows?: Record<string, unknown>[],
  executionTimeMs?: number,
  clusterName?: string,
  matchedThreshold?: AlertThresholdLevel | null,
  options: VariableBuildOptions = {}
): MessageVariables {
  const { fallbackToConfiguredThresholds = true } = options;
  const cleanRow = cleanupThresholdAlias(triggeringRow, rule.thresholdColumnName ?? undefined);
  const cleanAllRows = allRows?.map(r => cleanupThresholdAlias(r, rule.thresholdColumnName ?? undefined));

  const firstNumericValue = getFirstNumericValue(cleanRow);
  const now = new Date();
  const timestamp = now.toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\. /g, '-').replace('.', '')
    + ' ' + now.toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const baseVariables: MessageVariables = {
    ruleName: rule.name,
    clusterName: clusterName || rule.clusterId,
    severity: matchedThreshold?.severity ?? (fallbackToConfiguredThresholds ? getHighestSeverity(parseThresholdLevels(rule.thresholds)) : 'test'),
    description: rule.description || 'None',
    queryResult: cleanRow,
    resultValue: firstNumericValue !== null ? String(firstNumericValue) : 'N/A',
    threshold: matchedThreshold
      ? formatThresholdCondition(matchedThreshold)
      : fallbackToConfiguredThresholds
        ? formatThresholdCondition(getPrimaryThreshold(parseThresholdLevels(rule.thresholds)) ?? { operator: '>=', value: 0 })
        : 'Test send',
    timestamp,
    executionTime: executionTimeMs,
    executionTimeText: executionTimeMs !== undefined ? `${executionTimeMs}ms` : 'N/A',
  };

  if (cleanAllRows && cleanAllRows.length > 0) {
    baseVariables.triggeringRows = [cleanRow];
    baseVariables.allRows = cleanAllRows;
    baseVariables.allRowsMarkdownTable = createMarkdownTable(cleanAllRows);
    baseVariables.allRowsSlackBlocks = createSlackTableBlocks(cleanAllRows);
    baseVariables.allRowsTeamsContent = createTeamsTableContent(cleanAllRows);
    baseVariables.allRowsJson = JSON.stringify(cleanAllRows);
    baseVariables.allRowsHtmlTable = createHtmlTable(cleanAllRows);
  }

  return baseVariables;
}

function substituteVariables(text: string, variables: MessageVariables): string {
  let result = text;

  Object.entries(variables).forEach(([key, value]) => {
    if (key === 'queryResult' && typeof value === 'object' && value !== null) {
      Object.entries(value as Record<string, unknown>).forEach(([colKey, colValue]) => {
        const placeholder = `{{${key}.${colKey}}}`;
        const displayValue = colValue !== null && colValue !== undefined ? String(colValue) : 'N/A';
        result = result.replace(new RegExp(placeholder, 'g'), displayValue);
      });
      const placeholder = `{{${key}}}`;
      const displayValue = formatRowAsText(value as Record<string, unknown>);
      result = result.replace(new RegExp(placeholder, 'g'), displayValue);
    } else if (Array.isArray(value)) {
      const placeholder = `{{${key}}}`;
      result = result.replace(new RegExp(placeholder, 'g'), JSON.stringify(value));
    } else if (typeof value === 'object' && value !== null) {
      const placeholder = `{{${key}}}`;
      result = result.replace(new RegExp(placeholder, 'g'), JSON.stringify(value));
    } else {
      const placeholder = `{{${key}}}`;
      const displayValue = value !== null && value !== undefined ? String(value) : 'N/A';
      result = result.replace(new RegExp(placeholder, 'g'), displayValue);
    }
  });
  return result;
}

function formatRowAsText(row: Record<string, unknown>): string {
  const entries = Object.entries(row)
    .map(([key, value]) => {
      const displayValue = value !== null && value !== undefined ? String(value) : 'N/A';
      return `${key}: ${displayValue}`;
    });
  return entries.join(', ');
}

function substituteVariablesInObject(obj: unknown, variables: MessageVariables): unknown {
  if (typeof obj === 'string') {
    return substituteVariables(obj, variables);
  }

  // ✨ Array expansion - automatically spread {{allRowsSlackBlocks}}
  if (Array.isArray(obj)) {
    const result: unknown[] = [];

    for (const item of obj as unknown[]) {
      if (typeof item === 'string' && item === '{{allRowsSlackBlocks}}') {
        if (Array.isArray(variables.allRowsSlackBlocks)) {
          result.push(...variables.allRowsSlackBlocks);
        }
      } else if (typeof item === 'string' && item === '{{allRowsTeamsContent}}') {
        if (Array.isArray(variables.allRowsTeamsContent)) {
          result.push(...variables.allRowsTeamsContent);
        }
      } else if (typeof item === 'string') {
        result.push(substituteVariables(item, variables));
      } else if (Array.isArray(item)) {
        result.push(substituteVariablesInObject(item, variables));
      } else if (item !== null && typeof item === 'object') {
        result.push(substituteVariablesInObject(item, variables));
      } else {
        result.push(item);
      }
    }

    return result;
  }

  if (obj !== null && typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    Object.entries(obj as Record<string, unknown>).forEach(([k, value]) => {
      if (typeof value === 'string') {
        result[k] = substituteVariables(value, variables);
      } else if (Array.isArray(value)) {
        result[k] = substituteVariablesInObject(value, variables);
      } else if (value !== null && typeof value === 'object') {
        result[k] = substituteVariablesInObject(value, variables);
      } else {
        result[k] = value;
      }
    });
    return result;
  }

  return obj;
}

function formatMessage(
  rule: NotificationRuleContext,
  value: number,
  matchedThreshold?: AlertThresholdLevel | null
): string {
  const fallbackThreshold = getPrimaryThreshold(parseThresholdLevels(rule.thresholds));
  return `
🚨 Alert: ${rule.name}

Query Result: ${value}
Threshold: ${formatThresholdCondition(matchedThreshold ?? fallbackThreshold ?? { operator: '>=', value: 0 })}

Description: ${rule.description || 'N/A'}

Time: ${new Date().toISOString()}
`.trim();
}

async function sendToChannel(
  channel: NotificationChannel,
  message: string,
  variables: MessageVariables
): Promise<void> {
  const payload = hasValidPayload(channel.body) ? channel.body : message;

  switch (channel.type) {
    case 'slack':
      await sendSlack(channel.url, payload, variables);
      break;

    case 'email': {
      const recipient = channel.to || channel.url;
      if (!recipient) throw new Error('Email channel missing recipient address');
      await sendEmail(recipient, payload, variables);
      break;
    }

    case 'webhook':
      await sendWebhook(channel.url, payload, variables);
      break;

    case 'teams':
      await sendTeams(channel.url, payload, variables);
      break;

    default:
      throw new Error(`Unknown notification type: ${(channel as { type: string }).type}`);
  }
}

async function sendSlack(webhookUrl: string, payload: unknown, variables: MessageVariables): Promise<void> {
  try {
    let body: unknown;

    if (typeof payload === 'string') {
      body = {
        text: substituteVariables(payload, variables),
        username: 'ClickHouse Alert',
        icon_emoji: ':rotating_light:'
      };
    } else {
      body = substituteVariablesInObject(payload, variables);

      if (body !== null && typeof body === 'object' && !Array.isArray(body)) {
        const bodyObj = body as Record<string, unknown>;
        if (bodyObj.blocks && Array.isArray(bodyObj.blocks)) {
          const blocks = bodyObj.blocks as unknown[];
          const slackBlocks = variables.allRowsSlackBlocks;

          if (Array.isArray(slackBlocks) && bodyObj.allRowsSlackBlocks === slackBlocks) {
            bodyObj.blocks = [
              ...blocks.filter((b): b is Record<string, unknown> =>
                typeof b === 'object' && b !== null && !(b as Record<string, unknown>).allRowsSlackBlocks
              ),
              ...slackBlocks
            ];
            delete bodyObj.allRowsSlackBlocks;
          }
        }

        delete bodyObj.allRowsMarkdownTable;
        delete bodyObj.allRowsSlackBlocks;
        delete bodyObj.allRows;
        delete bodyObj.triggeringRows;
      }
    }

    const response = await fetchWebhook(webhookUrl, JSON.stringify(body));

    logger.debug(`[Slack] ← status: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      // Deliberately excludes the response body from the thrown error: logger.error
      // below is not dev-gated, so anything included here ends up in production logs.
      throw new Error(`Slack API error: ${response.status} ${response.statusText}`);
    }
  } catch (error) {
    logger.error('[Notifier] Slack send failed:', error);
    throw error;
  }
}

async function sendTeams(webhookUrl: string, payload: unknown, variables: MessageVariables): Promise<void> {
  try {
    let body: unknown;

    if (typeof payload === 'string') {
      body = {
        type: 'message',
        attachments: [{
          contentType: 'application/vnd.microsoft.card.adaptive',
          contentUrl: null,
          content: {
            $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
            type: 'AdaptiveCard',
            version: '1.2',
            msteams: { width: 'Full' },
            body: [{ type: 'TextBlock', text: substituteVariables(payload, variables), wrap: true }],
          },
        }],
      };
    } else {
      const card = normalizeTeamsCard(substituteVariablesInObject(payload, variables));
      body = {
        type: 'message',
        attachments: [{
          contentType: 'application/vnd.microsoft.card.adaptive',
          contentUrl: null,
          content: card,
        }],
      };
    }

    const response = await fetchWebhook(webhookUrl, JSON.stringify(body));

    logger.debug(`[Teams] ← status: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      // Deliberately excludes the response body from the thrown error: logger.error
      // below is not dev-gated, so anything included here ends up in production logs.
      throw new Error(`Teams API error: ${response.status} ${response.statusText}`);
    }
  } catch (error) {
    logger.error('[Notifier] Teams send failed:', error);
    throw error;
  }
}

async function sendEmail(_to: string, _payload: unknown, _variables: MessageVariables): Promise<void> {
  throw new Error('Email notifications are not yet supported. Configure Slack, Teams, or Webhook instead.');
}

async function sendWebhook(url: string, payload: unknown, variables: MessageVariables): Promise<void> {
  try {
    let contentType = 'application/json';
    let bodyString: string;

    if (typeof payload === 'string') {
      bodyString = substituteVariables(payload, variables);
      contentType = 'text/plain';
    } else {
      const body = substituteVariablesInObject(payload, variables);
      if (body !== null && typeof body === 'object' && !Array.isArray(body)) {
        const bodyObj = body as Record<string, unknown>;
        delete bodyObj.allRowsMarkdownTable;
        delete bodyObj.allRowsSlackBlocks;
        delete bodyObj.allRows;
        delete bodyObj.triggeringRows;
        bodyString = JSON.stringify(bodyObj);
      } else {
        bodyString = JSON.stringify(body);
      }
    }

    const response = await fetchWebhook(url, bodyString, contentType);

    if (!response.ok) {
      throw new Error(`Webhook error: ${response.statusText}`);
    }
  } catch (error) {
    logger.error('[Notifier] Webhook send failed:', error);
    throw error;
  }
}
