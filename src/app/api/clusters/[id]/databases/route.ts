import { logger } from "@/lib/utils/logger";
import { NextResponse } from 'next/server';
import { executeClickHouseQuery } from '@/lib/clickhouse/index';
import { quoteString } from '@/lib/clickhouse/utils';
import { withClusterAccess } from '@/lib/auth/middleware';

/**
 * GET /api/clusters/[id]/databases?cluster=<clusterName>
 * Retrieve the list of databases for a cluster
 * Use the specified logical cluster if provided, otherwise auto-detect the local cluster
 * Always query all nodes via clusterAllReplicas
 */
export const GET = withClusterAccess(
  async (request, { params }, user) => {
    try {
      const { id } = await params;
      const userId = user?.id;
      const { searchParams } = new URL(request.url);
      const clusterName = searchParams.get('cluster');

      // Target cluster for clusterAllReplicas: use if parameter is provided, otherwise auto-detect
      const clusterExpr = clusterName
        ? quoteString(clusterName)
        : `(SELECT cluster FROM system.clusters WHERE is_local = 1 LIMIT 1)`;

      // Always query databases from all nodes via clusterAllReplicas
      // Includes tables created on only some nodes without omission
      const query = `
        SELECT
          database AS name,
          engine,
          tables,
          formatReadableSize(total_bytes) AS total_size,
          total_bytes
        FROM (
          SELECT
            database,
            any(engine)           AS engine,
            countDistinct(name)   AS tables,
            sum(total_bytes)      AS total_bytes
          FROM clusterAllReplicas(${clusterExpr}, system.tables)
          GROUP BY database
        )
        ORDER BY total_bytes DESC
      `;

      const databases = await executeClickHouseQuery(id, query, undefined, userId);

      // Cache for 5 minutes since the database list rarely changes
      const response = NextResponse.json({
        databases: databases || [],
      });
      response.headers.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=600');
      return response;
    } catch (error) {
      logger.error('Error fetching databases:', error);
      return NextResponse.json(
        { error: 'Failed to fetch databases' },
        { status: 500 }
      );
    }
  }
);
