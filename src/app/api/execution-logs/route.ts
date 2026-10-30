import { logger } from "@/lib/utils/logger";
import { subDays } from 'date-fns';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { withRole } from '@/lib/auth/middleware';
import { getHighestSeverity, parseThresholdLevels } from '@/lib/alert/thresholds';

export const GET = withRole(async (request: NextRequest, _context, user) => {
  const searchParams = request.nextUrl.searchParams;
  const pageNum = parseInt(searchParams.get('page') || '1');
  const limitNum = parseInt(searchParams.get('limit') || '50');

  try {
    const clusterId = searchParams.get('clusterId');
    const alertRuleId = searchParams.get('alertRuleId');
    const status = searchParams.get('status');
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const page = pageNum;
    const limit = limitNum;

    const where: Prisma.ExecutionLogWhereInput = user.role === 'admin' ? {} : { alertRule: { createdBy: user.id } };

    if (clusterId) {
      where.alertRule = {
        ...(user.role === 'admin' ? {} : { createdBy: user.id }),
        clusterId,
      };
    }

    if (alertRuleId) {
      where.alertRuleId = alertRuleId;
    }

    if (status === 'failed') {
      where.error = { not: null };
    } else if (status === 'success') {
      where.error = null;
    } else if (status === 'alert') {
      where.thresholdMet = true;
      // Limit alert history to the last seven days.
      const sevenDaysAgo = subDays(new Date(), 7);
      where.executedAt = { gte: sevenDaysAgo };
    }

    if (from || to) {
      where.executedAt = {};
      if (from) {
        where.executedAt.gte = new Date(from);
      }
      if (to) {
        where.executedAt.lte = new Date(to);
      }
    }

    type AlertRuleLookupRow = {
      id: string;
      name: string;
      clusterId: string;
      thresholds: Prisma.JsonValue;
    };

    const [logs, totalCount] = await Promise.all([
      prisma.executionLog.findMany({
        where,
        orderBy: { executedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit
      }),
      prisma.executionLog.count({ where })
    ]);

    const alertRuleIds = [...new Set(logs.map((log) => log.alertRuleId))];
    const alertRules = alertRuleIds.length > 0
      ? await prisma.$queryRaw<AlertRuleLookupRow[]>(Prisma.sql`
          SELECT "id", "name", "clusterId", "thresholds"
          FROM "AlertRule"
          WHERE "id" IN (${Prisma.join(alertRuleIds)})
        `)
      : [];

    const alertRuleById = new Map(alertRules.map((rule) => [rule.id, rule]));

    const data = logs.map((log) => {
      const alertRule = alertRuleById.get(log.alertRuleId);
      const derivedSeverity = alertRule?.thresholds != null
        ? getHighestSeverity(parseThresholdLevels(alertRule.thresholds))
        : null;

      return {
        ...log,
        alertRule: alertRule
          ? {
              name: alertRule.name,
              clusterId: alertRule.clusterId,
            }
          : null,
        ruleName: alertRule?.name ?? null,
        clusterIdFromRule: alertRule?.clusterId ?? null,
        matchedSeverity: log.matchedSeverity ?? derivedSeverity,
        severity: log.matchedSeverity ?? derivedSeverity,
        triggered: log.thresholdMet,
        resolvedAt: log.resolvedAt ?? null,
      };
    });

    logger.debug('\n========================================');
    logger.debug('[ExecutionLogs API] Query Results:');
    logger.debug(`  - Total Count: ${totalCount}`);
    logger.debug(`  - Returned Records: ${data.length}`);
    logger.debug(`  - Page: ${page}`);
    logger.debug(`  - Limit: ${limit}`);
    logger.debug(`  - From: ${from || 'N/A'}`);
    logger.debug(`  - To: ${to || 'N/A'}`);
    logger.debug(`  - Active Alerts: ${data.filter(d => d.thresholdMet).length}`);
    logger.debug(`  - Resolved Alerts: ${data.filter(d => !d.thresholdMet).length}`);
    logger.debug('========================================\n');

    return NextResponse.json({
      data,
      totalCount,
      page,
      limit
    });
  } catch (error) {
    logger.error('Failed to fetch execution logs:', error);
    return NextResponse.json(
      { data: [], totalCount: 0, page: pageNum, limit: limitNum, error: 'Failed to fetch execution logs' },
      { status: 500 }
    );
  }
}, ['admin', 'developer']);
