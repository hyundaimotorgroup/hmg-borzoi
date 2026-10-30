import { NextResponse } from 'next/server';
import { createClickHouseClient } from '@/lib/clickhouse/index';
import { withClusterAccess, withFeatureFlag } from '@/lib/auth/middleware';
import { isQueryEditorEnabled } from '@/lib/feature-flags';
import {
  parseRequestJson,
  prepareQueryForExecution,
  QUERY_EXECUTION_DEFAULT_LIMIT,
  queryExecutionSchema,
} from '@/lib/validation';

/**
 * POST /api/clusters/[id]/execute
 * SQL (Cluster read + CH )
 * Body: { query: string }
 */
export const POST = withFeatureFlag(isQueryEditorEnabled, withClusterAccess(async (request, { params }, user) => {
  const { id } = await params;
  const parsed = await parseRequestJson(request, queryExecutionSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  const {
    query,
    limitAdded,
    limitValue,
  } = prepareQueryForExecution(parsed.data.query, QUERY_EXECUTION_DEFAULT_LIMIT);

  const client = await createClickHouseClient(id, user.id);
  if (!client) {
    return NextResponse.json(
 { error: 'Cluster . CH .' },
      { status: 403 }
    );
  }

  try {
    const result = await client.queryWithMeta({ query, clickhouse_settings: { readonly: '1' } });
    await client.close();

    const columns: string[] = result.meta.map((m) => m.name);
    const rows: string[][] = result.data.map((row: Record<string, unknown>) =>
      columns.map((col) => {
        const val = row[col];
        return val === null || val === undefined ? '' : String(val);
      })
    );

    return NextResponse.json({
      columns,
      rows,
      rowCount: result.rows,
      executionTime: result.statistics.elapsed,
      bytesRead: result.statistics.bytes_read,
      rowsRead: result.statistics.rows_read,
      limitAdded,
      limitValue: limitAdded ? limitValue : undefined,
    });
  } catch (error) {
    await client.close();
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}));
