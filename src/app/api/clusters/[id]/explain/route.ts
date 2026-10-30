import { NextResponse } from 'next/server';
import { createClickHouseClient } from '@/lib/clickhouse/index';
import { withClusterAccess, withFeatureFlag } from '@/lib/auth/middleware';
import { isQueryEditorEnabled } from '@/lib/feature-flags';
import { z } from 'zod';
import { parseRequestJson } from '@/lib/validation';

const EXPLAIN_MODES = ['PLAN', 'PIPELINE', 'AST', 'SYNTAX', 'ESTIMATE', 'QUERY TREE'] as const;
type ExplainMode = (typeof EXPLAIN_MODES)[number];

const explainSchema = z.object({
  query: z.string().trim().min(1, 'Query is required'),
  mode: z.enum(EXPLAIN_MODES),
});

/**
 * POST /api/clusters/[id]/explain
 * ClickHouse EXPLAIN (PLAN / PIPELINE / AST / SYNTAX / ESTIMATE / QUERY TREE / ANALYZE)
 * Body: { query: string, mode: ExplainMode }
 */
export const POST = withFeatureFlag(isQueryEditorEnabled, withClusterAccess(async (request, { params }, user) => {
  const { id } = await params;
  const parsed = await parseRequestJson(request, explainSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  const { query, mode } = parsed.data;

  const client = await createClickHouseClient(id, user.id);
  if (!client) {
    return NextResponse.json(
 { error: 'Cluster . CH .' },
      { status: 403 }
    );
  }

  const explainQuery = buildExplainQuery(mode, query);

  try {
    const lines = await client.queryLines({ query: explainQuery });
    await client.close();

    return NextResponse.json({ mode, lines });
  } catch (error) {
    await client.close();
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}));

function buildExplainQuery(mode: ExplainMode, query: string): string {
  const trimmed = query.trim().replace(/;$/, '');
  if (mode === 'PLAN') {
    return `EXPLAIN PLAN indexes=1 ${trimmed}`;
  }
  return `EXPLAIN ${mode} ${trimmed}`;
}
