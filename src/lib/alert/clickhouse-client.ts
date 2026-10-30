import { createClickHouseClient } from '../clickhouse';
import { findForbiddenKeyword, hasMultipleStatements } from './query-policy';

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

  // Create client per cluster
  const client = await createClickHouseClient(clusterId, userId);

  if (!client) {
    throw new Error(`Failed to create ClickHouse client for cluster: ${clusterId}`);
  }

  try {
    const data = await client.query<Record<string, unknown>>({
      query,
      clickhouse_settings: { readonly: '1' },
    });
    await client.close();
    return data;
  } catch (error) {
    await client.close();
    throw error;
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
