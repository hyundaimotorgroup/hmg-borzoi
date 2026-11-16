import type { AlertRule } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { hasClusterPermission } from '@/lib/auth/permissions';

export class AlertAccessRevokedError extends Error {
  constructor() {
    super('Alert owner no longer has access to this cluster');
    this.name = 'AlertAccessRevokedError';
  }
}

export async function assertAlertClusterAccess(clusterId: string, userId?: string): Promise<void> {
  // This lookup is never cached. The grant's cascading User FK also ensures
  // that a deleted account cannot authorize a scheduled query.
  if (!userId || !(await hasClusterPermission(userId, clusterId))) {
    throw new AlertAccessRevokedError();
  }
}

export async function assertAlertRuleAccess(rule: AlertRule): Promise<void> {
  const currentRule = await prisma.alertRule.findFirst({
    where: { id: rule.id, enabled: true, clusterId: rule.clusterId, createdBy: rule.createdBy },
    select: { id: true },
  });
  if (!currentRule) {
    throw new Error('Alert rule is no longer enabled or its execution context has changed');
  }
  await assertAlertClusterAccess(rule.clusterId, rule.createdBy ?? undefined);
}
