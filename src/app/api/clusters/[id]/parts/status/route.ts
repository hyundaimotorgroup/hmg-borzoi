import { NextResponse } from 'next/server';
import { executeClickHouseQuery, ClickHouseQueries } from '@/lib/clickhouse/index';
import { withClusterAccess } from '@/lib/auth/middleware';

export const GET = withClusterAccess(async (_request, { params }, user) => {
  try {
    const { id } = await params;
    const data = await executeClickHouseQuery(id, ClickHouseQueries.getPartsStatus(), undefined, user?.id);
    return NextResponse.json(data ?? []);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
