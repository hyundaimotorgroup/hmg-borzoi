import { logger } from "@/lib/utils/logger";
import { NextResponse } from 'next/server';
import { executeClickHouseQuery } from '@/lib/clickhouse/index';
import { buildTimeseriesQuery } from '@/lib/clickhouse/queries/timeseries';
import { withClusterAccess } from '@/lib/auth/middleware';
import { timeseriesCache } from '@/lib/cache/timeseries-cache';
import { getTimeseriesMetricGroup } from '@/lib/metrics/timeseries-groups';
import { resolveTimeseriesRange, TimeseriesRangeError } from '@/lib/metrics/timeseries-range';

type QueryResult = {
  table: string;
  metric: string;
  data: unknown[] | null;
  error: string | null;
};

const pendingTimeseriesResponses = new Map<string, Promise<{
  metrics: Record<string, unknown[]>;
  errors: Record<string, string>;
}>>();

const TABLE_TIMEOUT_MS: Record<string, number> = {
  metric_log:             60_000,
  async_metric_log:       20_000,
  query_log:              25_000,
  error_log:              10_000,

};

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Query timeout after ${ms}ms [${label}]`)), ms)
    ),
  ]);
}

const EMPTY_DATA_OK_METRICS = new Set(['backgroundPool', 'fileDescriptors']);

export const GET = withClusterAccess(
  async (request, { params }, user) => {
    try {
      const { id } = await params;
      const userId = user?.id;
      const searchParams = request.nextUrl.searchParams;
      const skipCache = searchParams.has('refresh') || searchParams.get('cache') === 'skip';
      const metricsParam = searchParams.get('metrics') ?? '';
      const requestedMetrics = Array.from(new Set(metricsParam.split(',').map(m => m.trim()).filter(Boolean)));

      if (requestedMetrics.length === 0) {
        return NextResponse.json({ error: 'At least one metric is required.' }, { status: 400 });
      }

      const unsupportedMetrics = requestedMetrics.filter((metric) => !getTimeseriesMetricGroup(metric));
      if (unsupportedMetrics.length > 0) {
        return NextResponse.json(
          { error: `Unsupported metrics: ${unsupportedMetrics.join(', ')}` },
          { status: 400 }
        );
      }

      const resolvedRange = resolveTimeseriesRange({
        mode: searchParams.get('mode'),
        preset: searchParams.get('preset'),
        from: searchParams.get('from'),
        to: searchParams.get('to'),
        timeRange: searchParams.get('timeRange'),
        timezone: searchParams.get('timezone'),
      });

 logger.debug('[Timeseries API] :', {
        clusterId: id,
        requestedMetrics,
        range: resolvedRange.selection,
        intervalSeconds: resolvedRange.intervalSeconds,
      });

      const cacheScopeClusterId = `${id}:user:${userId ?? 'anonymous'}`;
      const requestCacheKey = `${cacheScopeClusterId}:${resolvedRange.cacheKey}:${[...requestedMetrics].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)).join(',')}`;
      const pendingRequestKey = `${requestCacheKey}:refresh=${skipCache ? '1' : '0'}`;

      if (!skipCache) {
        const cachedData = timeseriesCache.get(cacheScopeClusterId, requestedMetrics, resolvedRange.cacheKey);
        if (cachedData) {
 logger.debug('[Timeseries API] HIT:', { clusterId: id, cacheKey: resolvedRange.cacheKey });
          return NextResponse.json(cachedData);
        }
      }

      const makeQuery = (
        table: string,
        metric: string,
        queryFn: () => Promise<unknown[] | null>
      ): Promise<QueryResult> => {
        const timeoutMs = TABLE_TIMEOUT_MS[table] ?? 20_000;
        return withTimeout(queryFn(), timeoutMs, `${table}[${metric}]`)
          .then(data => ({ table, metric, data: data ?? [], error: null }))
          .catch((err: unknown) => {
            const msg = err instanceof Error ? err.message : String(err);
            logger.error(`[Timeseries API] ${table} error:`, msg);
            return { table, metric, data: null, error: msg };
          });
      };

      let responsePayload: { metrics: Record<string, unknown[]>; errors: Record<string, string> };

      if (pendingTimeseriesResponses.has(pendingRequestKey)) {
        responsePayload = await pendingTimeseriesResponses.get(pendingRequestKey)!;
      } else {
        const responsePromise = (async () => {
          const result: Record<string, unknown[]> = {};
          const errors: Record<string, string> = {};
          const promises = requestedMetrics.map((metric) => {
            const query = buildTimeseriesQuery(metric, resolvedRange);

            return makeQuery(query.table, metric, () =>
              executeClickHouseQuery(id, query.query, undefined, userId, { label: query.label })
            );
          });

          const results = await Promise.all(promises);

          results.forEach(({ table, metric, data, error }) => {
            if (error) {
              errors[metric] = error;
              return;
            }

            if (!data || data.length === 0) {
              if (EMPTY_DATA_OK_METRICS.has(metric)) {
                result[metric] = [];
              } else {
                errors[metric] = `No data from ${table}`;
              }
              return;
            }

            result[metric] = data;

            if (metric === 'network' && data.length > 0) {
              logger.debug('[Timeseries API] Network sample:', Object.keys(data[0] as Record<string, unknown>));
            }
          });

          return { metrics: result, errors };
        })();

        pendingTimeseriesResponses.set(pendingRequestKey, responsePromise);

        try {
          responsePayload = await responsePromise;
        } finally {
          pendingTimeseriesResponses.delete(pendingRequestKey);
        }
      }

      const responseData = {
        timeRange: resolvedRange.legacyTimeRange ?? searchParams.get('timeRange') ?? null,
        range: resolvedRange.selection,
        timezone: resolvedRange.timezone,
        intervalSeconds: resolvedRange.intervalSeconds,
        intervalMinutes: resolvedRange.intervalMinutes,
        rangeHours: resolvedRange.rangeHours,
        from: resolvedRange.startUtc,
        to: resolvedRange.endUtc,
        metrics: responsePayload.metrics,
        ...(Object.keys(responsePayload.errors).length > 0 && { errors: responsePayload.errors }),
      };

      const successfulMetrics = requestedMetrics.filter(m => responsePayload.metrics[m] !== undefined);
      if (!skipCache && successfulMetrics.length > 0) {
        timeseriesCache.set(cacheScopeClusterId, requestedMetrics, resolvedRange.cacheKey, responseData);
 logger.debug('[Timeseries API] :', { clusterId: id, success: successfulMetrics.length, errors: Object.keys(responsePayload.errors).length, cacheKey: resolvedRange.cacheKey });
      }

      return NextResponse.json(responseData);
    } catch (error) {
      if (error instanceof TimeseriesRangeError) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      logger.error('[Timeseries API] Fatal error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch timeseries metrics' },
        { status: 500 }
      );
    }
  }
);
