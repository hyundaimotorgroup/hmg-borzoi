import { NextResponse } from 'next/server';

import { executeQuery, parseResult, validateQuery } from '@/lib/alert/clickhouse-client';
import { buildThresholdFilteredQuery } from '@/lib/alert/query-builder';
import { sendNotificationToChannel, type NotificationChannel, type NotificationRuleContext } from '@/lib/alert/notifier';
import { createClickHouseClient } from '@/lib/clickhouse';
import { withRole } from '@/lib/auth/middleware';
import { hasClusterPermission } from '@/lib/auth/permissions';
import { alertNotificationTestSchema } from '@/lib/alert/validation';
import { assertNotificationChannelsHostsAllowed } from '@/lib/alert/host-check';
import { parseRequestJson } from '@/lib/validation';
import {
  ALERT_SEVERITY_RANK,
  formatThresholdCondition,
  getPrimaryThreshold,
  resolveMatchedThreshold,
  type AlertThresholdLevel,
} from '@/lib/alert/thresholds';

function getFirstNumericValue(row: Record<string, unknown>): number | null {
  for (const value of Object.values(row)) {
    const num = parseFloat(String(value));
    if (!Number.isNaN(num)) {
      return num;
    }
  }

  return null;
}

function compareThresholdValue(value: number, operator: string, threshold: number): boolean {
  switch (operator) {
    case '>':
      return value > threshold;
    case '<':
      return value < threshold;
    case '>=':
      return value >= threshold;
    case '<=':
      return value <= threshold;
    case '=':
      return value === threshold;
    case '!=':
      return value !== threshold;
    default:
      return false;
  }
}

export const POST = withRole(async (request, _context, user) => {
  try {
    const requestData = await parseRequestJson(request, alertNotificationTestSchema);
    if (!requestData.success) {
      return requestData.response;
    }
    const parsedBody = requestData.data;

    if (!(await hasClusterPermission(user.id, parsedBody.clusterId))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    validateQuery(parsedBody.query);
    await assertNotificationChannelsHostsAllowed([parsedBody.channel]);

    const startTime = Date.now();
    const originalQuery = parsedBody.query.trim().replace(/;$/, '');
    const schemaQuery = `SELECT * FROM (${originalQuery}) AS subquery LIMIT 5`;
    const schemaClient = await createClickHouseClient(parsedBody.clusterId, user.id);
    if (!schemaClient) {
      throw new Error(`Failed to create ClickHouse client for cluster: ${parsedBody.clusterId}`);
    }

    let schemaRows: Record<string, unknown>[] = [];
    try {
      const schemaResult = await schemaClient.queryWithMeta({
        query: schemaQuery,
        clickhouse_settings: { readonly: '1' },
      });
      schemaRows = parseResult(schemaResult.data).rows;
    } finally {
      await schemaClient.close();
    }

    const filteredQuery = buildThresholdFilteredQuery(originalQuery, {
      columnName: parsedBody.thresholdColumnName,
      thresholds: parsedBody.thresholds.map((threshold) => ({
        operator: threshold.operator,
        value: threshold.value,
      })),
    });

    const filteredData = await executeQuery(parsedBody.clusterId, filteredQuery, user.id);
    const queryResult = parseResult(filteredData);

    let matchedSeverity: string | null = null;
    let matchedThreshold: AlertThresholdLevel | null = null;
    let matchedValue: number | null = null;
    let triggeringRow: Record<string, unknown> | null = null;

    queryResult.rows.forEach((row, index) => {
      const value = parsedBody.thresholdColumnName
        ? (row[parsedBody.thresholdColumnName] !== undefined
            ? parseFloat(String(row[parsedBody.thresholdColumnName]))
            : getFirstNumericValue(row))
        : (index === 0 && queryResult.singleValue !== null && queryResult.singleValue !== undefined
            ? queryResult.singleValue
            : getFirstNumericValue(row));

      if (value === null) {
        return;
      }

      const matched = resolveMatchedThreshold(value, parsedBody.thresholds, compareThresholdValue);
      if (!matched) {
        return;
      }

      if (!matchedSeverity || ALERT_SEVERITY_RANK[matched.severity] > ALERT_SEVERITY_RANK[matchedSeverity as keyof typeof ALERT_SEVERITY_RANK]) {
        matchedSeverity = matched.severity;
        matchedThreshold = matched;
        matchedValue = value;
        triggeringRow = row;
      }
    });

    const fallbackThreshold = getPrimaryThreshold(parsedBody.thresholds);
    const fallbackRow = triggeringRow ?? queryResult.rows[0] ?? schemaRows[0] ?? { value: matchedValue ?? 'N/A' };
    const allRows = (queryResult.rows.length > 0 ? queryResult.rows : schemaRows).slice(0, 5);
    const notificationRule: NotificationRuleContext = {
      name: parsedBody.name,
      description: parsedBody.description ?? null,
      clusterId: parsedBody.clusterId,
      thresholds: parsedBody.thresholds,
      thresholdColumnName: parsedBody.thresholdColumnName ?? null,
    };

    await sendNotificationToChannel(
      notificationRule,
      parsedBody.channel as NotificationChannel,
      fallbackRow,
      allRows,
      Date.now() - startTime,
      matchedThreshold ?? fallbackThreshold ?? null,
      {
        fallbackToConfiguredThresholds: matchedThreshold !== null,
      }
    );

    return NextResponse.json({
      success: true,
      notificationSent: true,
      matchedSeverity,
      matchedThreshold: matchedThreshold ? formatThresholdCondition(matchedThreshold) : null,
      thresholdMet: matchedSeverity !== null,
      rowCount: allRows.length,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to send test notification',
      },
      { status: 400 }
    );
  }
}, ['admin', 'developer']);
