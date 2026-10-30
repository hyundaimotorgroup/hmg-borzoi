import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import type { SessionUser } from '@/types/auth';

vi.mock('../session', () => ({
  requireSession: vi.fn(),
}));

vi.mock('../permissions', () => ({
  hasRole: vi.fn(),
  hasClusterPermission: vi.fn(),
}));

vi.mock('../audit', () => ({
  createAuditLog: vi.fn().mockResolvedValue(undefined),
}));

import { requireSession } from '../session';
import { hasRole, hasClusterPermission } from '../permissions';
import { withAuth, withRole, withClusterAccess } from '../middleware';

const mockUser: SessionUser = {
  id: 'user-1',
  name: 'Test User',
  email: 'test@example.com',
  role: 'admin',
};

function makeRequest(url = 'http://localhost/api/test') {
  return new NextRequest(url);
}

function makeContext(params: Record<string, string> = {}) {
  return { params: Promise.resolve(params) };
}

const mockHandler = vi.fn().mockResolvedValue(
  NextResponse.json({ ok: true })
);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('withAuth', () => {
  it('returns 401 when session is missing', async () => {
    vi.mocked(requireSession).mockRejectedValue(new Error('No session'));

    const handler = withAuth(mockHandler);
    const res = await handler(makeRequest(), makeContext());

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
    expect(mockHandler).not.toHaveBeenCalled();
  });

  it('calls handler with user when session exists', async () => {
    vi.mocked(requireSession).mockResolvedValue(mockUser);

    const handler = withAuth(mockHandler);
    const req = makeRequest();
    const ctx = makeContext();
    await handler(req, ctx);

    expect(mockHandler).toHaveBeenCalledWith(req, ctx, mockUser);
  });
});

describe('withRole', () => {
  it('returns 403 when user lacks required role', async () => {
    vi.mocked(requireSession).mockResolvedValue(mockUser);
    vi.mocked(hasRole).mockResolvedValue(false);

    const handler = withRole(mockHandler, ['admin']);
    const res = await handler(makeRequest(), makeContext());

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/Forbidden/);
    expect(mockHandler).not.toHaveBeenCalled();
  });

  it('calls handler when user has required role', async () => {
    vi.mocked(requireSession).mockResolvedValue(mockUser);
    vi.mocked(hasRole).mockResolvedValue(true);

    const handler = withRole(mockHandler, ['admin']);
    const req = makeRequest();
    const ctx = makeContext();
    await handler(req, ctx);

    expect(mockHandler).toHaveBeenCalledWith(req, ctx, mockUser);
  });
});

describe('withClusterAccess', () => {
  it('returns 400 when cluster ID is missing', async () => {
    vi.mocked(requireSession).mockResolvedValue(mockUser);

    const handler = withClusterAccess(mockHandler);
    const res = await handler(makeRequest(), makeContext({}));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Cluster ID/);
  });

  it('returns 403 when user has no cluster access', async () => {
    vi.mocked(requireSession).mockResolvedValue(mockUser);
    vi.mocked(hasClusterPermission).mockResolvedValue(false);

    const handler = withClusterAccess(mockHandler);
    const res = await handler(makeRequest(), makeContext({ id: 'cluster-1' }));

    expect(res.status).toBe(403);
    expect(mockHandler).not.toHaveBeenCalled();
  });

  it('calls handler when user has cluster access', async () => {
    vi.mocked(requireSession).mockResolvedValue(mockUser);
    vi.mocked(hasClusterPermission).mockResolvedValue(true);

    const handler = withClusterAccess(mockHandler);
    const req = makeRequest();
    const ctx = makeContext({ id: 'cluster-1' });
    await handler(req, ctx);

    expect(mockHandler).toHaveBeenCalledWith(req, ctx, mockUser);
  });
});
