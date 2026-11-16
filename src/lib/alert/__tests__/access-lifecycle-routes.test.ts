// @vitest-environment node
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthedHandler } from '@/lib/auth/middleware';
import type { UnifiedClickHouseClient } from '@/lib/clickhouse';
import type { SessionUser } from '@/types/auth';

const mocks = vi.hoisted(() => ({
  actor: { id: 'admin1', name: 'Admin', email: 'admin@example.com', role: 'admin' as SessionUser['role'] },
  prisma: {
    user: { findUnique: vi.fn(), delete: vi.fn() },
    cluster: { findMany: vi.fn() },
    userClusterAccess: { findMany: vi.fn(), findUnique: vi.fn(), deleteMany: vi.fn(), createMany: vi.fn() },
    alertRule: { updateMany: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
  },
  encrypt: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('@/lib/clickhouse/index', () => ({ encryptPassword: mocks.encrypt }));
vi.mock('@/lib/alert/clickhouse-client', () => ({ validateQuery: vi.fn() }));
vi.mock('@/lib/alert/host-check', () => ({ assertNotificationChannelsHostsAllowed: vi.fn() }));
vi.mock('@/lib/utils/logger', () => ({ logger: { debug: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/auth/middleware', () => {
  const wrap = (handler: AuthedHandler) =>
    (request: NextRequest, context: { params: Promise<Record<string, string>> }) => handler(request, context, mocks.actor);
  return { withRole: wrap, withAuth: wrap, withAudit: (handler: AuthedHandler) => handler };
});

import { PUT as replaceAccess } from '@/app/api/users/[id]/cluster-access/route';
import { DELETE as deleteUser } from '@/app/api/app-users/[id]/route';
import { PATCH as patchAlert } from '@/app/api/alerts/[id]/route';
import { credentialCache } from '@/lib/cache/credential-cache';
import { clickHouseClientPool } from '@/lib/cache/client-pool';

function cacheClient(userId: string, clusterId: string) {
  const close = vi.fn().mockResolvedValue(undefined);
  const client = { close } as unknown as UnifiedClickHouseClient;
  credentialCache.set(userId, clusterId, { username: 'reader', password: 'password', clusterUrl: 'http://localhost:8123' });
  clickHouseClientPool.set(userId, clusterId, client);
  return { client, close };
}

const userContext = { params: Promise.resolve({ id: 'u1' }) };

function accessRequest(clusterIds: string[]) {
  return new NextRequest('http://localhost/api/users/u1/cluster-access', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clusterAccess: clusterIds.map((clusterId) => ({ clusterId, chUsername: 'reader', chPassword: 'secret' })) }),
  });
}

beforeEach(() => {
  for (const userId of ['u1', 'u2']) {
    credentialCache.invalidateUser(userId);
    clickHouseClientPool.invalidateUser(userId);
  }
  vi.resetAllMocks();
  mocks.actor.role = 'admin';
  mocks.prisma.user.findUnique.mockResolvedValue({ id: 'u1', role: 'developer' });
  mocks.prisma.userClusterAccess.findMany.mockResolvedValue([
    { clusterId: 'c1', chPassword: 'old-secret' }, { clusterId: 'c2', chPassword: 'old-secret' },
  ]);
  mocks.prisma.userClusterAccess.findUnique.mockResolvedValue({ id: 'grant1' });
  mocks.prisma.cluster.findMany.mockResolvedValue([]);
  mocks.prisma.$transaction.mockImplementation(async (callback) => callback(mocks.prisma));
  mocks.encrypt.mockResolvedValue('encrypted');
  mocks.prisma.alertRule.findFirst.mockResolvedValue({
    id: 'rule1', clusterId: 'c1', createdBy: 'u1', enabled: false,
  });
  mocks.prisma.alertRule.update.mockResolvedValue({ id: 'rule1', notificationChannels: [], thresholds: [] });
});

describe('cluster grant replacement', () => {
  it('invalidates removed, retained and new clusters while preserving other users', async () => {
    const removed = cacheClient('u1', 'c1');
    const kept = cacheClient('u1', 'c2');
    const added = cacheClient('u1', 'c3');
    const otherUser = cacheClient('u2', 'c1');

    const response = await replaceAccess(accessRequest(['c2', 'c3']), userContext);

    expect(response.status).toBe(200);
    expect(mocks.prisma.$transaction).toHaveBeenCalledOnce();
    expect(mocks.prisma.alertRule.updateMany).toHaveBeenCalledWith({
      where: { createdBy: 'u1', clusterId: { notIn: ['c2', 'c3'] } },
      data: { enabled: false, lastAlertStatus: null },
    });
    for (const clusterId of ['c1', 'c2', 'c3']) {
      expect(credentialCache.get('u1', clusterId)).toBeNull();
      expect(clickHouseClientPool.get('u1', clusterId)).toBeNull();
    }
    for (const entry of [removed, kept, added]) expect(entry.close).toHaveBeenCalledOnce();
    expect(credentialCache.get('u2', 'c1')).not.toBeNull();
    expect(clickHouseClientPool.get('u2', 'c1')).toBe(otherUser.client);
    expect(otherUser.close).not.toHaveBeenCalled();
  });

  it('disables all owned rules and evicts old caches when the grant list becomes empty', async () => {
    const first = cacheClient('u1', 'c1');
    const second = cacheClient('u1', 'c2');
    const response = await replaceAccess(accessRequest([]), userContext);

    expect(response.status).toBe(200);
    expect(mocks.prisma.userClusterAccess.createMany).not.toHaveBeenCalled();
    expect(mocks.prisma.alertRule.updateMany).toHaveBeenCalledWith({
      where: { createdBy: 'u1' }, data: { enabled: false, lastAlertStatus: null },
    });
    expect(first.close).toHaveBeenCalledOnce();
    expect(second.close).toHaveBeenCalledOnce();
    expect(credentialCache.get('u1', 'c1')).toBeNull();
    expect(credentialCache.get('u1', 'c2')).toBeNull();
  });

  it('prepares encrypted credentials before starting the replacement transaction', async () => {
    mocks.encrypt.mockImplementation(async () => {
      expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
      return 'encrypted';
    });
    await replaceAccess(accessRequest(['c2']), userContext);
    expect(mocks.prisma.userClusterAccess.createMany).toHaveBeenCalledWith({
      data: [{ userId: 'u1', clusterId: 'c2', chUsername: 'reader', chPassword: 'encrypted' }],
    });
  });

  it('leaves grants and caches intact when credential preparation fails', async () => {
    const existing = cacheClient('u1', 'c1');
    mocks.encrypt.mockRejectedValue(new Error('Encryption failed'));
    const response = await replaceAccess(accessRequest(['c2']), userContext);
    expect(response.status).toBe(500);
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
    expect(mocks.prisma.userClusterAccess.deleteMany).not.toHaveBeenCalled();
    expect(existing.close).not.toHaveBeenCalled();
    expect(credentialCache.get('u1', 'c1')).not.toBeNull();
  });

  it('evicts caches only after the replacement transaction commits', async () => {
    const existing = cacheClient('u1', 'c1');
    mocks.prisma.$transaction.mockImplementation(async (callback) => {
      await callback(mocks.prisma);
      expect(existing.close).not.toHaveBeenCalled();
      throw new Error('Transaction rolled back');
    });
    const response = await replaceAccess(accessRequest([]), userContext);
    expect(response.status).toBe(500);
    expect(existing.close).not.toHaveBeenCalled();
    expect(credentialCache.get('u1', 'c1')).not.toBeNull();
  });
});

describe('account deletion', () => {
  it('disables owned alerts atomically with deletion and clears all of that user’s caches', async () => {
    const first = cacheClient('u1', 'c1');
    const second = cacheClient('u1', 'c2');
    const otherUser = cacheClient('u2', 'c1');
    mocks.prisma.$transaction.mockImplementation(async (callback) => {
      await callback(mocks.prisma);
      expect(first.close).not.toHaveBeenCalled();
    });
    const response = await deleteUser(new NextRequest('http://localhost/api/app-users/u1', { method: 'DELETE' }), userContext);
    expect(response.status).toBe(200);
    expect(mocks.prisma.alertRule.updateMany).toHaveBeenCalledWith({
      where: { createdBy: 'u1' }, data: { enabled: false, lastAlertStatus: null },
    });
    expect(mocks.prisma.user.delete).toHaveBeenCalledWith({ where: { id: 'u1' } });
    expect(first.close).toHaveBeenCalledOnce();
    expect(second.close).toHaveBeenCalledOnce();
    for (const clusterId of ['c1', 'c2']) {
      expect(credentialCache.get('u1', clusterId)).toBeNull();
      expect(clickHouseClientPool.get('u1', clusterId)).toBeNull();
    }
    expect(clickHouseClientPool.get('u2', 'c1')).toBe(otherUser.client);
    expect(credentialCache.get('u2', 'c1')).not.toBeNull();
  });

  it('does not evict caches if the deletion transaction fails', async () => {
    const existing = cacheClient('u1', 'c1');
    mocks.prisma.$transaction.mockRejectedValue(new Error('Transaction rolled back'));
    const response = await deleteUser(new NextRequest('http://localhost/api/app-users/u1', { method: 'DELETE' }), userContext);
    expect(response.status).toBe(500);
    expect(existing.close).not.toHaveBeenCalled();
    expect(credentialCache.get('u1', 'c1')).not.toBeNull();
  });
});

describe('alert edits after revocation', () => {
  async function patch(body: Record<string, unknown>) {
    return patchAlert(new NextRequest('http://localhost/api/alerts/rule1', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }), { params: Promise.resolve({ id: 'rule1' }) });
  }

  it('checks the existing cluster even when the patch omits clusterId', async () => {
    mocks.prisma.userClusterAccess.findUnique.mockResolvedValue(null);
    expect((await patch({ enabled: true })).status).toBe(403);
    expect(mocks.prisma.userClusterAccess.findUnique).toHaveBeenCalledWith({
      where: { userId_clusterId: { userId: 'admin1', clusterId: 'c1' } }, select: { id: true },
    });
    expect(mocks.prisma.alertRule.update).not.toHaveBeenCalled();
  });

  it('prevents an admin from re-enabling a rule whose owner has lost access', async () => {
    mocks.prisma.userClusterAccess.findUnique.mockImplementation(async ({ where }) =>
      where.userId_clusterId.userId === 'admin1' ? { id: 'admin-grant' } : null);
    expect((await patch({ enabled: true })).status).toBe(403);
    expect(mocks.prisma.alertRule.update).not.toHaveBeenCalled();
  });

  it('allows an authorized owner’s rule to be re-enabled after a new grant', async () => {
    expect((await patch({ enabled: true })).status).toBe(200);
    expect(mocks.prisma.alertRule.update).toHaveBeenCalledWith({
      where: { id: 'rule1' }, data: expect.objectContaining({ enabled: true }),
    });
  });

  it('allows an authorized admin to keep an orphaned rule disabled', async () => {
    mocks.prisma.alertRule.findFirst.mockResolvedValue({ id: 'rule1', clusterId: 'c1', createdBy: 'deleted-user', enabled: false });
    expect((await patch({ enabled: false })).status).toBe(200);
  });

  it('allows an admin without a cluster grant to disable an active orphaned rule', async () => {
    mocks.prisma.userClusterAccess.findUnique.mockResolvedValue(null);
    mocks.prisma.alertRule.findFirst.mockResolvedValue({ id: 'rule1', clusterId: 'c1', createdBy: 'deleted-user', enabled: true });
    expect((await patch({ enabled: false })).status).toBe(200);
    expect(mocks.prisma.userClusterAccess.findUnique).not.toHaveBeenCalled();
    expect(mocks.prisma.alertRule.update).toHaveBeenCalledWith({
      where: { id: 'rule1' }, data: expect.objectContaining({ enabled: false }),
    });
  });

  it.each([
    ['name', { name: 'Renamed alert' }],
    ['description', { description: 'Updated description' }],
    ['clusterId', { clusterId: 'c2' }],
    ['query', { query: 'SELECT value FROM metrics' }],
    ['checkIntervalMinutes', { checkIntervalMinutes: 5 }],
    ['thresholds', { thresholds: [{ severity: 'warning', operator: '>', value: 10 }] }],
    ['thresholdColumnName', { thresholdColumnName: 'value' }],
    ['notificationChannels', { notificationChannels: [{ type: 'webhook', url: 'https://example.com/alerts' }] }],
    ['resultDisplayMode', { resultDisplayMode: 'showOnlyTriggering' }],
  ] as const)('requires cluster access when an admin disables a rule and also changes %s', async (_field, changes) => {
    mocks.prisma.userClusterAccess.findUnique.mockResolvedValue(null);
    expect((await patch({ enabled: false, ...changes })).status).toBe(403);
    expect(mocks.prisma.alertRule.update).not.toHaveBeenCalled();
  });

  it.each(['developer', 'viewer'] as const)('does not exempt a %s without a cluster grant from disable checks', async (role) => {
    mocks.actor.role = role;
    mocks.prisma.alertRule.findFirst.mockResolvedValue({ id: 'rule1', clusterId: 'c1', createdBy: 'admin1', enabled: true });
    mocks.prisma.userClusterAccess.findUnique.mockResolvedValue(null);
    expect((await patch({ enabled: false })).status).toBe(403);
    expect(mocks.prisma.alertRule.findFirst).toHaveBeenCalledWith({ where: { id: 'rule1', createdBy: 'admin1' } });
    expect(mocks.prisma.alertRule.update).not.toHaveBeenCalled();
  });

  it('preserves ownership checks when a non-admin tries to disable another user’s rule', async () => {
    mocks.actor.role = 'developer';
    mocks.prisma.alertRule.findFirst.mockResolvedValue(null);
    expect((await patch({ enabled: false })).status).toBe(404);
    expect(mocks.prisma.alertRule.findFirst).toHaveBeenCalledWith({ where: { id: 'rule1', createdBy: 'admin1' } });
    expect(mocks.prisma.alertRule.update).not.toHaveBeenCalled();
  });

  it('allows renaming a disabled orphaned rule without changing its enabled state', async () => {
    mocks.prisma.alertRule.findFirst.mockResolvedValue({ id: 'rule1', clusterId: 'c1', createdBy: 'deleted-user', enabled: false });
    mocks.prisma.userClusterAccess.findUnique.mockImplementation(async ({ where }) =>
      where.userId_clusterId.userId === 'admin1' ? { id: 'admin-grant' } : null);
    expect((await patch({ name: 'Renamed alert' })).status).toBe(200);
    expect(mocks.prisma.alertRule.update.mock.calls[0][0].data).not.toHaveProperty('enabled');
    expect(mocks.prisma.userClusterAccess.findUnique).toHaveBeenCalledOnce();
  });

  it('uses the existing enabled state to reject editing an active rule whose owner has no grant', async () => {
    mocks.prisma.alertRule.findFirst.mockResolvedValue({ id: 'rule1', clusterId: 'c1', createdBy: 'deleted-user', enabled: true });
    mocks.prisma.userClusterAccess.findUnique.mockImplementation(async ({ where }) =>
      where.userId_clusterId.userId === 'admin1' ? { id: 'admin-grant' } : null);
    expect((await patch({ name: 'Renamed alert' })).status).toBe(403);
    expect(mocks.prisma.alertRule.update).not.toHaveBeenCalled();
  });

  it('does not reactivate an authorized disabled rule on a name-only PATCH', async () => {
    expect((await patch({ name: 'Renamed alert' })).status).toBe(200);
    expect(mocks.prisma.alertRule.update.mock.calls[0][0].data).not.toHaveProperty('enabled');
  });
});
