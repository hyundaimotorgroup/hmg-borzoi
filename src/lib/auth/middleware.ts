/**
 * API Route middleware functions
 *
 * Design principles:
 * - The function returned by withAuth conforms to the Next.js RouteHandler signature (2-param)
 * - Authenticated handlers receive user as the 3rd argument, enabling type-safe usage without (request as any) casting
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from './session';
import { hasRole, hasClusterPermission } from './permissions';
import { createAuditLog } from './audit';
import { AppRole, SessionUser } from '@/types/auth';

/** Handler signature expected by Next.js in route files */
type RouteContext = { params: Promise<Record<string, string>> };
type RouteHandler = (request: NextRequest, context: RouteContext) => Promise<NextResponse>;

export type AuthedHandler = (
  request: NextRequest,
  context: RouteContext,
  user: SessionUser
) => Promise<NextResponse>;

export function withAuth(handler: AuthedHandler): RouteHandler {
  return async (request, context) => {
    let user: SessionUser;
    try {
      user = await requireSession();
    } catch {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return handler(request, context, user);
  };
}

export function withRole(handler: AuthedHandler, allowedRoles: AppRole[]): RouteHandler {
  return withAuth(async (request, context, user) => {
    const allowed = await hasRole(user.id, allowedRoles);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Forbidden: Insufficient permissions' },
        { status: 403 }
      );
    }
    return await handler(request, context, user);
  });
}

export function withClusterAccess(handler: AuthedHandler): RouteHandler {
  return withAuth(async (request, context, user) => {
    const params = await context.params;
    const clusterId = params.id;

    if (!clusterId) {
      return NextResponse.json({ error: 'Cluster ID required' }, { status: 400 });
    }

    const allowed = await hasClusterPermission(user.id, clusterId);

    if (!allowed) {
      return NextResponse.json(
        { error: 'Forbidden: No access to this cluster' },
        { status: 403 }
      );
    }

    return await handler(request, context, user);
  });
}

export function withFeatureFlag(
  isEnabled: () => boolean,
  handler: RouteHandler,
  message = 'This feature is disabled'
): RouteHandler {
  return async (request, context) => {
    if (!isEnabled()) {
      return NextResponse.json({ error: message }, { status: 403 });
    }
    return handler(request, context);
  };
}

export function withAudit(
  handler: AuthedHandler,
  action: string,
  resourceType: string
): AuthedHandler {
  return async (request, context, user) => {
    const params = await context.params;

    try {
      const response = await handler(request, context, user);

      // Reflect the actual HTTP outcome rather than assuming success whenever the
      // handler returns without throwing — most route handlers return a JSON error
      // response (e.g. 400/403/500) instead of throwing, so a blind `success: true`
      // here would mask real failures (including ones already logged in detail by
      // the handler itself, e.g. sqlQuery execution failures via logSqlCommandAudit).
      await createAuditLog({
        userId: user.id,
        userName: user.name,
        action,
        resourceType,
        resourceId: params?.id,
        resourceName: undefined,
        details: JSON.stringify({
          method: request.method,
          url: request.url,
        }),
        ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
        success: response.ok,
        errorMessage: response.ok ? undefined : `HTTP ${response.status}`,
      });

      return response;
    } catch (error) {
      await createAuditLog({
        userId: user.id,
        userName: user.name,
        action,
        resourceType,
        resourceId: params?.id,
        resourceName: undefined,
        details: JSON.stringify({
          method: request.method,
          url: request.url,
        }),
        ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
        success: false,
        errorMessage: error instanceof Error ? error.message : String(error),
      });

      throw error;
    }
  };
}
