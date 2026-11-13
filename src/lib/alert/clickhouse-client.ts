import { createClickHouseClient } from '../clickhouse';
import { findForbiddenKeyword, hasMultipleStatements } from './query-policy';
import { assertAlertClusterAccess } from './access';

/**
 * Validate user query
 *
 * Blocks multi-statement input and dangerous SQL keywords.
 * Acts as a second line of defense alongside the ClickHouse READ-ONLY account.
 */
export function validateQuery(query: string): void {
  if (hasMultipleStatements(query)) {
    throw new Error('Only a single SQL statement is allowed');
  }

  const forbidden = findForbiddenKeyword(query);
  if (forbidden) {
    throw new Error(`Forbidden keyword: ${forbidden}`);
  }
}

/**
 * ClickHouse query execution helper
 * Executes a query based on the cluster ID.
 */
export async function executeQuery(clusterId: string, query: string, userId?: string): Promise<Record<string, unknown>[]> {
  // Validate query
  validateQuery(query);

  await assertAlertClusterAccess(clusterId, userId);

  // Create client per cluster
  const client = await createClickHouseClient(clusterId, userId);

  try {
    // Client acquisition may await a shared pending creation or return a warm
    // pooled client. Neither is evidence of the owner's current permission.
    await assertAlertClusterAccess(clusterId, userId);
    if (!client) {
      throw new Error(`Failed to create ClickHouse client for cluster: ${clusterId}`);
    }
    const data = await client.query<Record<string, unknown>>({
      query,
      clickhouse_settings: { readonly: '1' },
    });
    return data;
  } finally {
    await client?.close();
  }
}

export interface ParsedResult {
  rows: Record<string, unknown>[];
  singleValue: number | null;
  isSingleRow: boolean;
}

export function parseResult(data: Record<string, unknown>[]): ParsedResult {
  if (!data || data.length === 0) {
    return {
      rows: [],
      singleValue: null,
      isSingleRow: false
    };
  }

  const rows = data.map(row => {
    const parsed: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      const numValue = parseFloat(String(value));
      parsed[key] = isNaN(numValue) ? value : numValue;
    }
    return parsed;
  });

  let singleValue: number | null = null;
  const firstRow = data[0];
  const firstValue = Object.values(firstRow)[0];
  const numValue = parseFloat(String(firstValue));

  if (!isNaN(numValue)) {
    singleValue = numValue;
  }

  return {
    rows,
    singleValue: data.length === 1 ? singleValue : null,
    isSingleRow: data.length === 1
  };
}
