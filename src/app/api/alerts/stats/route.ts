import { NextResponse } from 'next/server';
import { subDays } from 'date-fns';
import { prisma } from '@/lib/prisma';
import { withAuth } from '@/lib/auth/middleware';
import { logger } from '@/lib/utils/logger';
import { Prisma } from '@prisma/client';

/**
 * GET /api/alerts/stats
 * Alert statistics query - active alerts, resolved (7 days), total rules, enabled rules
 */
export const GET = withAuth(async (request, _context, user) => {
  try {
    const searchParams = request.nextUrl.searchParams;
    const clusterId = searchParams.get('clusterId');

    // 1. Alert rule statistics
    const rulesWhere: Prisma.AlertRuleWhereInput = user.role === 'admin' ? {} : { createdBy: user.id };
    if (clusterId && clusterId !== 'all') {
      rulesWhere.clusterId = clusterId;
    }

    const [totalRules, enabledRules] = await Promise.all([
      prisma.alertRule.count({ where: rulesWhere }),
      prisma.alertRule.count({ where: { ...rulesWhere, enabled: true } })
    ]);

    // 2. Calculate active alerts and resolved (last 7 days)
    const sevenDaysAgo = subDays(new Date(), 7);

    const logsWhere: Prisma.ExecutionLogWhereInput = {
      thresholdMet: true,
      executedAt: { gte: sevenDaysAgo },
      ...(user.role === 'admin' ? {} : { alertRule: { createdBy: user.id } }),
    };

    // Cluster filtering
    if (clusterId && clusterId !== 'all') {
      logsWhere.alertRule = {
        ...(user.role === 'admin' ? {} : { createdBy: user.id }),
        clusterId: clusterId,
      };
    }

    const [activeAlerts, resolvedLast7d] = await Promise.all([
      // Within 7 days: thresholdMet=true and resolvedAt is null (unresolved)
      prisma.executionLog.count({
        where: {
          ...logsWhere,
          resolvedAt: null,
        }
      }),
      // Within 7 days: thresholdMet=true and resolved by the user
      prisma.executionLog.count({
        where: {
          ...logsWhere,
          resolvedAt: { not: null },
        }
      })
    ]);

    logger.debug('[Alert Stats] Calculated Statistics:', {
      totalRules,
      enabledRules,
      activeAlerts,
      resolvedLast7d,
      clusterFilter: clusterId || 'all',
    });

    return NextResponse.json(
      { totalRules, enabledRules, activeAlerts, resolvedLast7d },
      { headers: { 'Cache-Control': 'private, max-age=30, stale-while-revalidate=60' } }
    );
  } catch (error) {
    logger.error('Failed to fetch alert stats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch alert stats' },
      { status: 500 }
    );
  }
});
