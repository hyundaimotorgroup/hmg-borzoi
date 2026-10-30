import { NextResponse } from 'next/server';
import { createClickHouseClient } from '@/lib/clickhouse/index';
import { quoteString } from '@/lib/clickhouse/utils';
import { withClusterAccess, withFeatureFlag } from '@/lib/auth/middleware';
import { isQueryEditorEnabled } from '@/lib/feature-flags';
import { z } from 'zod';

const querySchema = z.object({
  query_id: z.string().uuid(),
});

export interface ProcessorProfile {
  name: string;
  elapsed_us: number;
  input_wait_us: number;
  output_wait_us: number;
  input_rows: number;
  output_rows: number;
  input_bytes: number;
  calls: number;
}

/**
 * GET /api/clusters/[id]/query-profile?query_id=xxx
 * system.processors_profile_log
 */
export const GET = withFeatureFlag(isQueryEditorEnabled, withClusterAccess(async (request, { params }, user) => {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({ query_id: searchParams.get('query_id') });

  if (!parsed.success) {
 return NextResponse.json({ error: 'query_id(UUID) .' }, { status: 400 });
  }

  const { query_id } = parsed.data;

  const client = await createClickHouseClient(id, user.id);
  if (!client) {
    return NextResponse.json(
 { error: 'Cluster . CH .' },
      { status: 403 }
    );
  }

  try {
 // LB
 // clusterAllReplicas
    const clusterRows = await client.query<{ cluster: string }>({
      query: `
        SELECT DISTINCT cluster
        FROM system.clusters
        WHERE cluster NOT LIKE '%local%'
        LIMIT 1
      `,
    });
    const clusterName = clusterRows[0]?.cluster ?? null;

    const profileTable = clusterName
      ? `clusterAllReplicas(${quoteString(clusterName)}, system, processors_profile_log)`
      : `system.processors_profile_log`;

    const rows = await client.query<ProcessorProfile>({
      query: `
        SELECT
          name,
          sum(elapsed_us)              AS elapsed_us,
          sum(input_wait_elapsed_us)   AS input_wait_us,
          sum(output_wait_elapsed_us)  AS output_wait_us,
          sum(input_rows)              AS input_rows,
          sum(output_rows)             AS output_rows,
          sum(input_bytes)             AS input_bytes,
          count()                      AS calls
        FROM ${profileTable}
        WHERE query_id = {query_id: String}
          AND event_time >= now() - INTERVAL 1 HOUR
        GROUP BY name
        ORDER BY elapsed_us DESC
      `,
      query_params: { query_id },
    });

    if (rows.length > 0) {
      await client.close();
      return NextResponse.json({ profiles: rows, query_id, cluster: clusterName });
    }

 // None —
    const [settingRows, recentRows] = await Promise.all([
      client.query<{ value: string }>({
        query: `SELECT value FROM system.settings WHERE name = 'log_processors_profiles'`,
      }),
      client.query<{ query_id: string; last_seen: string }>({
        query: `
          SELECT query_id, max(event_time) AS last_seen
          FROM ${profileTable}
          WHERE event_time >= now() - INTERVAL 1 HOUR
          GROUP BY query_id
          ORDER BY last_seen DESC
          LIMIT 5
        `,
      }),
    ]);
    await client.close();

    const settingValue = settingRows[0]?.value ?? 'unknown';
    const recentIds = recentRows.map((r) => ({ query_id: r.query_id, last_seen: r.last_seen }));

    return NextResponse.json({
      profiles: [],
      query_id,
      diagnostic: {
        log_processors_profiles: settingValue,
        cluster: clusterName,
        recent_query_ids: recentIds,
        hint: settingValue === '0'
          ? 'log_processors_profiles is disabled. Re-run the query and try again.'
          : recentIds.length === 0
            ? `No data in processors_profile_log within the last hour (cluster=${clusterName ?? 'local'}).`
            : `processors_profile_log has recent data but no match for query_id (${query_id}).`,
      },
    });
  } catch (error) {
    await client.close();
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}));
