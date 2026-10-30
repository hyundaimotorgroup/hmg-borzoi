import { NextRequest, NextResponse } from 'next/server';
import { getAllClusters, createCluster } from '@/lib/services/cluster.service';
import { withAuth, withRole, withAudit } from '@/lib/auth/middleware';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/utils/logger';
import { createClusterSchema, parseRequestJson } from '@/lib/validation';

const pendingClusterGetResponses = new Map<string, Promise<unknown[]>>();

/**
 * GET /api/clusters
 * Returns all clusters accessible to the authenticated user.
 */
export const GET = withAuth(async (_request: NextRequest, _context, user) => {
  try {
    const dedupeKey = `${user.id}|${user.role}`;

    const shortCache = {
      'Cache-Control': 'private, max-age=30, stale-while-revalidate=60',
      'Vary': 'Cookie',
    };

    const getPayload = async (): Promise<unknown[]> => {
      const accessible = await prisma.userClusterAccess.findMany({
        where: { userId: user.id },
        select: { clusterId: true },
      });
      const accessibleIds = new Set(accessible.map((access) => access.clusterId));

      const clusters = await getAllClusters();
      return clusters.filter((cluster) => accessibleIds.has(cluster.id));
    };

    if (pendingClusterGetResponses.has(dedupeKey)) {
      const sharedPayload = await pendingClusterGetResponses.get(dedupeKey)!;
      return NextResponse.json(sharedPayload, { headers: shortCache });
    }

    const requestPromise = getPayload();
    pendingClusterGetResponses.set(dedupeKey, requestPromise);

    try {
      const payload = await requestPromise;
      return NextResponse.json(payload, { headers: shortCache });
    } finally {
      pendingClusterGetResponses.delete(dedupeKey);
    }
  } catch (_error) {
    return NextResponse.json(
      { error: 'Failed to fetch clusters' },
      { status: 500 }
    );
  }
});

/**
 * POST /api/clusters
 * Creates a new cluster (admin only).
 */
export const POST = withRole(
  withAudit(
    async (request: NextRequest, _context, user) => {
      try {
        const parsed = await parseRequestJson(request, createClusterSchema);
        if (!parsed.success) {
          return parsed.response;
        }
        const body = parsed.data;
        logger.debug('[Create Cluster] Request body:', { ...body, password: '***' });

        const cluster = await createCluster(body, user.id);
        logger.debug('[Create Cluster] Created cluster id:', cluster.id);

        return NextResponse.json(cluster, { status: 201 });
      } catch (error) {
        logger.error('[Create Cluster] Error:', error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        return NextResponse.json(
          {
            error: 'Failed to create cluster',
            details: process.env.NODE_ENV === 'development' ? errorMessage : 'Internal server error',
          },
          { status: 500 }
        );
      }
    },
    'CREATE_CLUSTER',
    'cluster'
  ),
  ['admin']
);
