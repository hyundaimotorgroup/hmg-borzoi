import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { validateQuery } from '@/lib/alert/clickhouse-client';
import { withAuth } from '@/lib/auth/middleware';
import { hasClusterPermission } from '@/lib/auth/permissions';
import { logger } from '@/lib/utils/logger';
import { parseRequestJson } from '@/lib/validation';
import {
  alertRuleApiCreateSchema,
  serializeAlertThresholds,
  serializeAlertRuleResponse,
} from '@/lib/alert/validation';
import { assertNotificationChannelsHostsAllowed } from '@/lib/alert/host-check';

export const GET = withAuth(async (request, _context, user) => {
  try {
    const searchParams = request.nextUrl.searchParams;
    const clusterId = searchParams.get('clusterId');

    const where: Prisma.AlertRuleWhereInput = user.role === 'admin' ? {} : { createdBy: user.id };
    if (clusterId) {
      where.clusterId = clusterId;
    }

    const rules = await prisma.alertRule.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { executionLogs: true }
        }
      }
    });

    const parsedRules = rules.map((rule) => serializeAlertRuleResponse(rule));

    return NextResponse.json(parsedRules);
  } catch (_error) {
    return NextResponse.json(
      { error: 'Failed to fetch alert rules' },
      { status: 500 });
  }
});

export const POST = withAuth(async (request, _context, user) => {
  try {
    const parsed = await parseRequestJson(request, alertRuleApiCreateSchema);
    if (!parsed.success) {
      return parsed.response;
    }
    const parsedBody = parsed.data;

    if (!(await hasClusterPermission(user.id, parsedBody.clusterId))) {
      return NextResponse.json(
        { error: 'Forbidden: No access to this cluster' },
        { status: 403 }
      );
    }

    const thresholdsJson = serializeAlertThresholds(parsedBody.thresholds) as Prisma.InputJsonArray;

    validateQuery(parsedBody.query);
    await assertNotificationChannelsHostsAllowed(parsedBody.notificationChannels);

    const rule = await prisma.alertRule.create({
      data: {
        clusterId: parsedBody.clusterId,
        name: parsedBody.name,
        description: parsedBody.description,
        query: parsedBody.query,
        checkIntervalMinutes: parsedBody.checkIntervalMinutes,
        thresholds: thresholdsJson,
        thresholdColumnName: parsedBody.thresholdColumnName,
        notificationChannels: parsedBody.notificationChannels,
        enabled: parsedBody.enabled ?? true,
        createdBy: user.id,
      }
    });
    
    return NextResponse.json(serializeAlertRuleResponse(rule), { status: 201 });
  } catch (error) {
    logger.error('Failed to create alert rule:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create alert rule' },
      { status: 400 });
  }
});
