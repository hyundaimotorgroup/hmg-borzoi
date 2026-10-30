import { NextRequest, NextResponse } from 'next/server';
import { executeClickHouseQuery, ClickHouseQueries } from '@/lib/clickhouse/index';
import { withClusterAccess } from '@/lib/auth/middleware';

export const GET = withClusterAccess(async (request: NextRequest, { params }, user) => {
  try {
    const { id } = await params;
    const node = request.nextUrl.searchParams.get('node') || 'all';

    const query = node === 'all'
      ? ClickHouseQueries.getMutationsDetail()
      : ClickHouseQueries.getMutationsDetailForNode(node);

    const data = await executeClickHouseQuery(id, query, undefined, user?.id);
    return NextResponse.json(data ?? []);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
