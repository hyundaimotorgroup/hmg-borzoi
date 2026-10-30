import { NextResponse } from 'next/server';
import { validateQuery, parseResult } from '@/lib/alert/clickhouse-client';
import { createClickHouseClient } from '@/lib/clickhouse';
import { withRole } from '@/lib/auth/middleware';
import { hasClusterPermission } from '@/lib/auth/permissions';
import { alertRuleTestSchema } from '@/lib/alert/validation';
import { parseRequestJson } from '@/lib/validation';
import {
  ALERT_SEVERITY_RANK,
  formatThresholdCondition,
  resolveMatchedThreshold,
} from '@/lib/alert/thresholds';

function isNumericClickHouseType(type: string): boolean {
  const normalized = type.replace(/\s+/g, '');
  return /^(?:Nullable\()?(?:U?Int(?:8|16|32|64|128|256)|Float(?:32|64)|Decimal(?:32|64|128|256)?\(|Int(?:8|16|32|64|128|256))/.test(normalized);
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

export const POST = withRole(async (request, _context, user) => {
  try {
    const requestData = await parseRequestJson(request, alertRuleTestSchema);
    if (!requestData.success) {
      return requestData.response;
    }
    const parsedBody = requestData.data;

    if (!(await hasClusterPermission(user.id, parsedBody.clusterId))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    validateQuery(parsedBody.query);
    
    const startTime = Date.now();
    const originalQuery = parsedBody.query.trim().replace(/;$/, '');
    const client = await createClickHouseClient(parsedBody.clusterId, user.id);
    if (!client) {
      throw new Error(`Failed to create ClickHouse client for cluster: ${parsedBody.clusterId}`);
    }

    let result;
    try {
      result = await client.queryWithMeta({
        query: originalQuery,
        clickhouse_settings: { readonly: '1' },
      });
    } finally {
      await client.close();
    }
    const executionTime = Date.now() - startTime;
    const columns = result.meta.map((column) => column.name);
    const numericColumns = result.meta
      .filter((column) => isNumericClickHouseType(column.type))
      .map((column) => column.name);

    const queryData = result.data;
    const queryResult = parseResult(queryData);

    let matchedSeverity: string | null = null;
    let matchedThreshold: string | null = null;
    let matchedValue: number | null = null;

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
        matchedThreshold = formatThresholdCondition(matched);
        matchedValue = value;
      }
    });

    const thresholdMet = matchedSeverity !== null;
    
    return NextResponse.json({
      success: true,
      queryResult: matchedValue,
      rowCount: queryResult.rows.length,
      thresholdMet,
      matchedSeverity,
      matchedThreshold,
      thresholds: parsedBody.thresholds,
      executionTimeMs: executionTime,
      rawData: queryData.slice(0, 10),
      columns,
      numericColumns,
    });
    
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Query execution failed'
      },
      { status: 400 });
  }
}, ['admin', 'developer']);

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
