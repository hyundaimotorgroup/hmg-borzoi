import { NextRequest, NextResponse } from 'next/server';
import { executeClickHouseQuery } from '@/lib/clickhouse/index';
import { quoteString } from '@/lib/clickhouse/utils';
import { withClusterAccess } from '@/lib/auth/middleware';
import { hasRole } from '@/lib/auth/permissions';
import { logger } from '@/lib/utils/logger';

export const POST = withClusterAccess(async (request: NextRequest, { params }, user) => {
  try {
    if (!(await hasRole(user.id, ["admin", "developer"]))) {
      return NextResponse.json({ error: 'Forbidden: Only admins and developers may kill queries' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json() as { queryId?: string };
    const queryId = body.queryId?.trim();

    if (!queryId) {
      return NextResponse.json({ error: 'queryId is required' }, { status: 400 });
    }

    const clusterRows = await executeClickHouseQuery<{ cluster: string }>(
      id, 'SELECT DISTINCT cluster FROM system.clusters LIMIT 1', undefined, user?.id
    );
    const clusterName = clusterRows?.[0]?.cluster;

    let initialQueryId: string | undefined;
    try {
      const processRows = await executeClickHouseQuery<{ initial_query_id: string }>(
        id,
        clusterName
          ? `SELECT initial_query_id FROM clusterAllReplicas(${quoteString(clusterName)}, system.processes) WHERE query_id = ${quoteString(queryId)} LIMIT 1`
          : `SELECT initial_query_id FROM system.processes WHERE query_id = ${quoteString(queryId)} LIMIT 1`,
        undefined,
        user?.id
      );
      initialQueryId = processRows?.[0]?.initial_query_id;
    } catch {
      initialQueryId = undefined;
    }

    const targetQueryIds = Array.from(new Set(
      [queryId, initialQueryId].filter((v): v is string => !!v)
    ));
    const queryIdsClause = targetQueryIds.map(qid => quoteString(qid)).join(', ');

    const killSql = clusterName
      ? `KILL QUERY ON CLUSTER ${quoteString(clusterName)} WHERE query_id IN (${queryIdsClause})`
      : `KILL QUERY WHERE query_id IN (${queryIdsClause})`;

    const rows = await executeClickHouseQuery<{ kill_status: string; query_id: string }>(
      id, killSql, undefined, user?.id
    );

    if (!rows) {
      return NextResponse.json({ error: 'Failed to execute kill query' }, { status: 500 });
    }

    const notFound = rows.length === 0 || rows.every(r => r.kill_status === 'not_found');
    if (notFound) {
      return NextResponse.json({ error: 'Query not found or already finished' }, { status: 404 });
    }

    logger.info(`[KillQuery] Killed query ${queryId}${initialQueryId && initialQueryId !== queryId ? ` (with initial query ${initialQueryId})` : ''} on cluster ${id} (ch cluster: ${clusterName ?? 'single'}) by user ${user?.id}`);
    return NextResponse.json({ success: true, queryId, initialQueryId, killStatus: rows.map(r => r.kill_status) });
  } catch (error) {
    logger.error('[KillQuery] Error:', error);
    return NextResponse.json(
      { error: 'Failed to kill query', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
});
