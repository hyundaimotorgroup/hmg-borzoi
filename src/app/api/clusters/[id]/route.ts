import { logger } from "@/lib/utils/logger";
import { NextResponse } from 'next/server';
import {
  getClusterById,
  getClusterWithMetrics,
  getClusterSummary,
  updateCluster,
  deleteCluster
} from '@/lib/services/cluster.service';
import { withClusterAccess, withRole, withAudit } from '@/lib/auth/middleware';
import { parseRequestJson, updateClusterSchema } from '@/lib/validation';

/**
 * GET /api/clusters/[id]?metrics=true&fields=qps,memoryUsage
 * Cluster (Cluster read )
 *
 * Query Parameters:
 * - metrics: if true, include metrics
 * - fields: comma-separated field list (e.g. qps,memoryUsage,diskUsage)
 *   Returns all metrics if not specified
 * - profile: if dashboard-overview, use minimal metric profile
 */
export const GET = withClusterAccess(async (request, { params }, user) => {
  try {
    const { id } = await params;
    const searchParams = request.nextUrl.searchParams;
    const includeMetrics = searchParams.get('metrics') === 'true';
    const fieldsParam = searchParams.get('fields');
    const skipCache = searchParams.get('refresh') === '1' || searchParams.get('cache') === 'skip';
    const profile = searchParams.get('profile');

    if (includeMetrics) {
      const cluster = await getClusterWithMetrics(id, fieldsParam, user?.id, {
        skipCache,
        profile: profile === 'dashboard-overview' ? 'dashboard-overview' : undefined,
      });
      if (!cluster) {
        return NextResponse.json(
          { error: 'Cluster not found' },
          { status: 404 }
        );
      }
      return NextResponse.json(cluster);
    }

    const [cluster, summary] = await Promise.all([
      getClusterById(id),
      getClusterSummary(id, user?.id ?? '').catch(() => null),
    ]);

    if (!cluster) {
      return NextResponse.json(
        { error: 'Cluster not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ...cluster,
      version: summary?.version ?? null,
    });
  } catch (error) {
    logger.error('Error fetching cluster:', error);
    return NextResponse.json(
      { error: 'Failed to fetch cluster' },
      { status: 500 }
    );
  }
});

/**
 * PUT /api/clusters/[id]
 * Cluster (admin + )
 */
export const PUT = withRole(
  withAudit(
    async (request, { params }, _user) => {
      try {
        const { id } = await params;
        const parsed = await parseRequestJson(request, updateClusterSchema);
        if (!parsed.success) {
          return parsed.response;
        }
        const body = parsed.data;

        const cluster = await updateCluster(id, body);
        if (!cluster) {
          return NextResponse.json(
            { error: 'Cluster not found' },
            { status: 404 }
          );
        }

        return NextResponse.json(cluster);
      } catch (error) {
        logger.error('Error updating cluster:', error);
        return NextResponse.json(
          { error: 'Failed to update cluster' },
          { status: 500 }
        );
      }
    },
    'UPDATE_CLUSTER',
    'cluster'
  ),
  ['admin']
);

/**
 * DELETE /api/clusters/[id]
 * Cluster (admin + )
 */
export const DELETE = withRole(
  withAudit(
    async (_request, { params }, _user) => {
      try {
        const { id } = await params;

        const success = await deleteCluster(id);
        if (!success) {
          return NextResponse.json(
            { error: 'Cluster not found' },
            { status: 404 }
          );
        }

        return NextResponse.json({ success: true });
      } catch (error) {
        logger.error('Error deleting cluster:', error);
        return NextResponse.json(
          { error: 'Failed to delete cluster' },
          { status: 500 }
        );
      }
    },
    'DELETE_CLUSTER',
    'cluster'
  ),
  ['admin']
);
