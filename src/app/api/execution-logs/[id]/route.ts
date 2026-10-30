import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withRole, AuthedHandler } from '@/lib/auth/middleware';
import { logger } from '@/lib/utils/logger';
import { executionLogResolveSchema, parseRequestJson } from '@/lib/validation';

const patchHandler: AuthedHandler = async (request, context, user) => {
  try {
    const { id } = await context.params;
    const parsed = await parseRequestJson(request, executionLogResolveSchema);
    if (!parsed.success) {
      return parsed.response;
    }
    const body = parsed.data;

    const log = await prisma.executionLog.findFirst({
      where: {
        id,
        ...(user.role === 'admin' ? {} : { alertRule: { createdBy: user.id } }),
      },
    });
    if (!log) {
      return NextResponse.json({ error: 'Execution log not found' }, { status: 404 });
    }

    const resolvedAt = body.resolved ? new Date() : null;

    const updated = await prisma.executionLog.update({
      where: { id },
      data: { resolvedAt },
    });

    logger.debug(`[ExecutionLogs] Log ${id} resolved=${body.resolved}`);

    return NextResponse.json({ id: updated.id, resolvedAt: updated.resolvedAt });
  } catch (error) {
    logger.error('Failed to update execution log:', error);
    return NextResponse.json({ error: 'Failed to update execution log' }, { status: 500 });
  }
};

export const PATCH = withRole(patchHandler, ['admin', 'developer']);
