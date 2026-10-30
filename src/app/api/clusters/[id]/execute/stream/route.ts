import { NextResponse } from 'next/server';
import { createClient as createHttpClient } from '@clickhouse/client';
import { withClusterAccess, withFeatureFlag } from '@/lib/auth/middleware';
import { isQueryEditorEnabled } from '@/lib/feature-flags';
import { resolveCredentials } from '@/lib/clickhouse/index';
import {
  parseRequestJson,
  prepareQueryForExecution,
  QUERY_EXECUTION_DEFAULT_LIMIT,
  queryExecutionSchema,
} from '@/lib/validation';

export const runtime = 'nodejs';

const BATCH_SIZE = 100;
const PROGRESS_INTERVAL = 5000;

/**
 * POST /api/clusters/[id]/execute/stream
 * Streams query results as NDJSON events.
 * Body: { query: string }
 */
export const POST = withFeatureFlag(isQueryEditorEnabled, withClusterAccess(async (request, { params }, user) => {
  const { id } = await params;
  const parsed = await parseRequestJson(request, queryExecutionSchema);
  if (!parsed.success) {
    return parsed.response;
  }
  const { query } = prepareQueryForExecution(
    parsed.data.query,
    QUERY_EXECUTION_DEFAULT_LIMIT
  );

  if (/^EXPLAIN\b/i.test(query.trim())) {
    return NextResponse.json(
 { error: 'EXPLAIN . Explain .' },
      { status: 400 }
    );
  }

  // Resolve credentials with the same strict policy as the non-streaming path:
  // no fallback to cluster system credentials when the user has no assigned ClickHouse access.
  let credentials;
  try {
    credentials = await resolveCredentials(id, user.id);
  } catch {
    return NextResponse.json(
      { error: '저장된 접속 정보를 복호화하지 못했습니다. 관리자에게 문의하세요.' },
      { status: 500 }
    );
  }
  if (!credentials) {
    return NextResponse.json(
      { error: '클러스터를 찾을 수 없거나 ClickHouse 접속 권한이 없습니다.' },
      { status: 403 }
    );
  }

  // Create @clickhouse/client directly for streaming (stream() is not available on UnifiedClickHouseClient)
  const rawClient = createHttpClient({
    url: credentials.clusterUrl,
    username: credentials.username,
    password: credentials.password,
    database: 'system',
    request_timeout: 120_000,
  });

  let resultSet: Awaited<ReturnType<typeof rawClient.query>>;
  try {
    resultSet = await rawClient.query({
      query,
      format: 'JSONCompactEachRowWithNamesAndTypes',
      clickhouse_settings: {
        readonly: '1',
        log_processors_profiles: 1,
        log_queries: 1,
      },
    });
  } catch (err) {
    await rawClient.close();
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }

  const stream = (
    resultSet as unknown as { stream: () => AsyncIterable<unknown> }
  ).stream();

  const encoder = new TextEncoder();

  const readableStream = new ReadableStream({
    async start(controller) {
      let isClosed = false;
      let rowsRead = 0;
      let colNames: string[] = [];
      let meta: { name: string; type: string }[] = [];
      let lineCount = 0;
      let batch: unknown[] = [];

      const push = (data: unknown): boolean => {
        if (isClosed) return false;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(data) + '\n'));
          return true;
        } catch {
          return false;
        }
      };

      const waitForBackpressure = async (): Promise<boolean> => {
        if (isClosed) return false;
        const startTime = Date.now();
        while (controller.desiredSize !== null && controller.desiredSize <= 0) {
          if (isClosed || Date.now() - startTime > 30_000) return false;
          await new Promise<void>((resolve) => setTimeout(resolve, 10));
        }
        return true;
      };

      try {
        for await (const chunk of stream) {
          if (isClosed) break;

          const items = Array.isArray(chunk) ? chunk : [chunk];

          for (const item of items) {
            if (isClosed) break;

            let data: unknown = item;
            if (
              data !== null &&
              typeof data === 'object' &&
              'text' in data &&
              typeof (data as { text: unknown }).text === 'string'
            ) {
              try {
                data = JSON.parse((data as { text: string }).text);
              } catch {
                // Keep as-is if parsing fails
              }
            }

            if (lineCount === 0) {
              colNames = data as string[];
              lineCount++;
            } else if (lineCount === 1) {
              const colTypes = data as string[];
              if (Array.isArray(colNames) && Array.isArray(colTypes)) {
                meta = colNames.map((name, i) => ({
                  name: String(name),
                  type: String(colTypes[i]),
                }));
              } else {
                meta = [{ name: 'result', type: 'String' }];
              }

              if (!push({ type: 'meta', data: meta })) {
                isClosed = true;
                break;
              }
              lineCount++;
            } else {
              rowsRead++;
              batch.push(data);

              if (batch.length >= BATCH_SIZE) {
                if (!(await waitForBackpressure())) {
                  isClosed = true;
                  break;
                }

                if (!push({ type: 'data', data: batch, rows_count: rowsRead })) {
                  isClosed = true;
                  break;
                }
                batch = [];

                if (rowsRead % PROGRESS_INTERVAL === 0) {
                  if (!push({ type: 'progress', rows_read: rowsRead })) {
                    isClosed = true;
                    break;
                  }
                }
              }
            }
          }

          if (isClosed) break;
        }

        // Flush remaining batch
        if (batch.length > 0 && !isClosed) {
          await waitForBackpressure();
          push({ type: 'data', data: batch, rows_count: rowsRead });
        }

        if (!isClosed) {
          push({
            type: 'done',
            statistics: {
              elapsed: 0,
              rows_read: rowsRead,
              bytes_read: 0,
            },
            query_id: resultSet.query_id,
          });
        }
      } catch (err) {
        if (!isClosed) {
          push({
            type: 'error',
            error: err instanceof Error ? err.message : String(err),
          });
        }
      } finally {
        isClosed = true;
        controller.close();
        await rawClient.close().catch(() => {});
      }
    },

    cancel() {
      rawClient.close().catch(() => {});
    },
  });

  return new Response(readableStream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  }) as unknown as NextResponse;
}));
