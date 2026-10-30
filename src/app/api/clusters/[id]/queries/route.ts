import { NextResponse } from 'next/server';
import { executeClickHouseQuery, ClickHouseQueries } from '@/lib/clickhouse/index';
import { withClusterAccess } from '@/lib/auth/middleware';
import { resolveTimeseriesRange, TimeseriesRangeError } from '@/lib/metrics/timeseries-range';

function normalizePositiveInteger(value: string | null, fallback: number): number {
  const parsed = Number.parseInt(value || "", 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }

  return parsed;
}

/**
 * GET /api/clusters/[id]/queries?type=running|recent|failed&timeRange=1h
 * Cluster (Cluster read )
 */
export const GET = withClusterAccess(async (request, { params }, user) => {
  try {
    const { id } = await params;
    const searchParams = request.nextUrl.searchParams;
    const type = searchParams.get('type') || 'running';
    const limit = normalizePositiveInteger(searchParams.get('limit'), 100);
    const page = normalizePositiveInteger(searchParams.get('page'), 1);
    const pageSize = Math.min(normalizePositiveInteger(searchParams.get('pageSize'), 20), 100);
    const search = (searchParams.get('search') || '').trim().slice(0, 200);
    const resolvedRange = resolveTimeseriesRange({
      mode: searchParams.get('mode'),
      preset: searchParams.get('preset'),
      from: searchParams.get('from'),
      to: searchParams.get('to'),
      timeRange: searchParams.get('timeRange'),
      timezone: searchParams.get('timezone'),
    });

 // (middleware )
        const userId = user?.id;

    let queries;
    if (type === 'running') {
      queries = await executeClickHouseQuery(
        id,
        ClickHouseQueries.getRunningQueriesDetail(),
        undefined,
        userId
      );
    } else if (type === 'failed') {
      queries = await executeClickHouseQuery(
        id,
        ClickHouseQueries.getFailedQueriesList(resolvedRange, limit),
        undefined,
        userId
      );
    } else if (type === 'distribution') {
      queries = await executeClickHouseQuery(
        id,
        ClickHouseQueries.getQueryDistribution(resolvedRange),
        undefined,
        userId
      );
    } else if (type === 'errors') {
      queries = await executeClickHouseQuery(
        id,
        ClickHouseQueries.getSystemErrors(),
        undefined,
        userId
      );
    } else if (type === 'recent') {
      const totalRows = await executeClickHouseQuery<{ total: number | string }>(
        id,
        ClickHouseQueries.getRecentQueriesCount(resolvedRange, search),
        undefined,
        userId
      );

      const total = Number(totalRows?.[0]?.total ?? 0);
      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      const currentPage = total === 0 ? 1 : Math.min(page, totalPages);
      const offset = (currentPage - 1) * pageSize;
      const items = await executeClickHouseQuery(
        id,
        ClickHouseQueries.getRecentQueries(resolvedRange, {
          limit: pageSize,
          offset,
          searchTerm: search,
        }),
        undefined,
        userId
      );

      return NextResponse.json({
        items: items ?? [],
        total,
        page: currentPage,
        pageSize,
      });
    } else {
      queries = await executeClickHouseQuery(
        id,
        ClickHouseQueries.getRecentQueries(resolvedRange, { limit }),
        undefined,
        userId
      );
    }

    if (!queries) {
      return NextResponse.json(
        { error: 'Failed to fetch queries' },
        { status: 500 }
      );
    }

    return NextResponse.json(queries);
  } catch (error) {
    if (error instanceof TimeseriesRangeError) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to fetch queries' },
      { status: 500 }
    );
  }
});
