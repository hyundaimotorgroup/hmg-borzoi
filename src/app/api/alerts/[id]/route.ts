import { logger } from "@/lib/utils/logger";
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { validateQuery } from '@/lib/alert/clickhouse-client';
import { withAuth, AuthedHandler } from '@/lib/auth/middleware';
import { hasClusterPermission } from '@/lib/auth/permissions';
import { parseRequestJson } from '@/lib/validation';
import {
  alertRuleApiPatchSchema,
  serializeAlertThresholds,
  serializeAlertRuleResponse,
} from '@/lib/alert/validation';
import { assertNotificationChannelsHostsAllowed } from '@/lib/alert/host-check';

const getHandler: AuthedHandler = async (_request, { params }, user) => {
  try {
    const { id } = await params;
    const rule = await prisma.alertRule.findFirst({
      where: {
        id,
        ...(user.role === 'admin' ? {} : { createdBy: user.id }),
      },
    });

    if (!rule) {
      return NextResponse.json({ error: 'Alert rule not found' }, { status: 404 });
    }

    return NextResponse.json(serializeAlertRuleResponse(rule));
  } catch (error) {
    logger.error('Failed to fetch alert rule:', error);
    return NextResponse.json({ error: 'Failed to fetch alert rule' }, { status: 500 });
  }
};

const patchHandler: AuthedHandler = async (request, { params }, user) => {
  try {
    const { id } = await params;
    const existingRule = await prisma.alertRule.findFirst({
      where: {
        id,
        ...(user.role === 'admin' ? {} : { createdBy: user.id }),
      },
    });
    if (!existingRule) {
      return NextResponse.json({ error: 'Alert rule not found' }, { status: 404 });
    }

    const parsed = await parseRequestJson(request, alertRuleApiPatchSchema);
    if (!parsed.success) {
      return parsed.response;
    }
    const parsedBody = parsed.data;

    if (parsedBody.clusterId && !(await hasClusterPermission(user.id, parsedBody.clusterId))) {
      return NextResponse.json(
        { error: 'Forbidden: No access to this cluster' },
        { status: 403 }
      );
    }

    if (parsedBody.query) validateQuery(parsedBody.query);
    if (parsedBody.notificationChannels !== undefined) {
      await assertNotificationChannelsHostsAllowed(parsedBody.notificationChannels);
    }

    const thresholdsJson = serializeAlertThresholds(parsedBody.thresholds ?? []) as Prisma.InputJsonArray;

    const rule = await prisma.alertRule.update({
      where: { id },
      data: {
        clusterId: parsedBody.clusterId,
        name: parsedBody.name,
        description: parsedBody.description,
        query: parsedBody.query,
        checkIntervalMinutes: parsedBody.checkIntervalMinutes,
        ...(parsedBody.thresholds ? { thresholds: thresholdsJson } : {}),
        ...(parsedBody.thresholdColumnName !== undefined ? { thresholdColumnName: parsedBody.thresholdColumnName } : {}),
        ...(parsedBody.notificationChannels !== undefined ? { notificationChannels: parsedBody.notificationChannels } : {}),
        ...(parsedBody.enabled !== undefined ? { enabled: parsedBody.enabled } : {}),
      },
    });

    return NextResponse.json(serializeAlertRuleResponse(rule));
  } catch (error) {
    logger.error('Failed to update alert rule:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update alert rule' },
      { status: 400 }
    );
  }
};

const deleteHandler: AuthedHandler = async (_request, { params }, user) => {
  try {
    const { id } = await params;
    const existingRule = await prisma.alertRule.findFirst({
      where: {
        id,
        ...(user.role === 'admin' ? {} : { createdBy: user.id }),
      },
      select: { id: true },
    });

    if (!existingRule) {
      return NextResponse.json({ error: 'Alert rule not found' }, { status: 404 });
    }

    await prisma.alertRule.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Failed to delete alert rule:', error);
    return NextResponse.json({ error: 'Failed to delete alert rule' }, { status: 500 });
  }
};

export const GET = withAuth(getHandler);
export const PATCH = withAuth(patchHandler);
export const DELETE = withAuth(deleteHandler);
