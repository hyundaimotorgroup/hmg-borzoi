import { logger } from "@/lib/utils/logger";
/**
 * Audit log utility
 */

import { prisma } from '@/lib/prisma';

export interface AuditLogData {
  userId: string;
  userName: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  resourceName?: string;
  details: string;
  ipAddress: string;
  userAgent: string;
  success: boolean;
  errorMessage?: string;
}

/**
 * Create an audit log entry
 * @param data Audit log data
 */
export async function createAuditLog(data: AuditLogData): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: data.userId,
        userName: data.userName,
        action: data.action,
        resourceType: data.resourceType,
        resourceId: data.resourceId,
        resourceName: data.resourceName,
        details: data.details,
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
        success: data.success,
        errorMessage: data.errorMessage,
      },
    });
  } catch (error) {
    logger.error('Failed to create audit log:', error);
    // Do not throw the error so that an audit log failure does not interrupt the service
  }
}

interface RequestHeadersLike {
  headers: {
    get(name: string): string | null;
  };
}

/**
 * Audit an executed raw sqlQuery (ch-users/ch-roles/ch-profiles). Only the
 * command type of each statement is recorded (e.g. "CREATE USER"), never the
 * raw SQL text, since it may embed passwords or other sensitive values.
 *
 * There is deliberately no caller-supplied error message: ClickHouse syntax
 * error messages echo back the query text around the failure point, which
 * can include a password literal (e.g. `CREATE USER ... IDENTIFIED BY
 * '<pw>'`). Only a fixed, content-free message is stored on failure.
 */
export async function logSqlCommandAudit(params: {
  request: RequestHeadersLike;
  user: { id: string; name: string };
  action: string;
  resourceType: string;
  resourceId: string;
  commandTypes: string[];
  success: boolean;
}): Promise<void> {
  await createAuditLog({
    userId: params.user.id,
    userName: params.user.name,
    action: params.action,
    resourceType: params.resourceType,
    resourceId: params.resourceId,
    details: JSON.stringify({ commandTypes: params.commandTypes }),
    ipAddress: params.request.headers.get('x-forwarded-for') || params.request.headers.get('x-real-ip') || 'unknown',
    userAgent: params.request.headers.get('user-agent') || 'unknown',
    success: params.success,
    errorMessage: params.success ? undefined : 'ClickHouse SQL execution failed',
  });
}
