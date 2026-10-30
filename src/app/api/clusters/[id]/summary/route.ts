import { NextRequest, NextResponse } from 'next/server';
import { getClusterSummary } from '@/lib/services/cluster.service';
import { withClusterAccess } from '@/lib/auth/middleware';

/**
 * GET /api/clusters/[id]/summary
 * Cluster summary(nodes, version, uptime, status) 
 * ClickHouse unreachable 
 */
export const GET = withClusterAccess(async (_request: NextRequest, { params }, user) => {
  try {
    const { id } = await params;
    const summary = await getClusterSummary(id, user.id).catch(() => null);

    if (!summary) {
      return NextResponse.json({
        status: 'unreachable' as const,
        nodes: null,
        version: null,
        uptime: null,
      });
    }

    return NextResponse.json({
      status: 'healthy' as const,
      nodes: summary.nodes,
      version: summary.version,
      uptime: summary.uptime,
    });
  } catch {
    return NextResponse.json(
      { error: 'Failed to fetch cluster summary' },
      { status: 500 }
    );
  }
});
