// @vitest-environment node
import type { AlertRule } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prisma: {
    cluster: { findUnique: vi.fn() },
    userClusterAccess: { findUnique: vi.fn() },
    alertRule: { findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    executionLog: { create: vi.fn() },
  },
  createClient: vi.fn(),
  query: vi.fn(),
  close: vi.fn(),
  decrypt: vi.fn(),
  notify: vi.fn(),
  resolve: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('@clickhouse/client', () => ({ createClient: mocks.createClient }));
vi.mock('@/lib/crypto', () => ({ encryptSecret: vi.fn(), decryptSecret: mocks.decrypt }));
vi.mock('../notifier', () => ({ sendNotification: mocks.notify, sendResolvedNotification: mocks.resolve }));
vi.mock('@/lib/utils/logger', () => ({ logger: { debug: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { evaluateAlerts } from '../evaluator';
import { executeQuery } from '../clickhouse-client';
import { AlertAccessRevokedError } from '../access';
import { createClickHouseClient } from '@/lib/clickhouse';
import { credentialCache } from '@/lib/cache/credential-cache';
import { clickHouseClientPool } from '@/lib/cache/client-pool';

function makeRule(overrides: Partial<AlertRule> = {}): AlertRule {
  return {
    id: 'rule1', clusterId: 'c1', createdBy: 'u1', name: 'Metric alert',
    description: null, query: 'SELECT value FROM metrics', checkIntervalMinutes: 1,
    thresholds: [{ severity: 'warning', operator: '>', value: 10, order: 0 }],
    thresholdColumnName: 'value', notificationChannels: [], enabled: true,
    lastExecutedAt: null, lastAlertStatus: null, createdAt: new Date(), updatedAt: new Date(),
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => {
  credentialCache.invalidateUser('u1');
  clickHouseClientPool.invalidateUser('u1');
  vi.resetAllMocks();
  mocks.prisma.cluster.findUnique.mockResolvedValue({
    id: 'c1', host: 'localhost', port: 8123, useTLS: false,
  });
  mocks.prisma.userClusterAccess.findUnique.mockResolvedValue({ id: 'grant1', chUsername: 'reader', chPassword: 'encrypted' });
  mocks.prisma.alertRule.findMany.mockResolvedValue([makeRule()]);
  mocks.prisma.alertRule.findFirst.mockResolvedValue({ id: 'rule1' });
  mocks.decrypt.mockResolvedValue('password');
  mocks.query.mockResolvedValue({ json: async () => [{ value: 20 }] });
  mocks.close.mockResolvedValue(undefined);
  mocks.createClient.mockReturnValue({ query: mocks.query, close: mocks.close });
});

describe('scheduled alert authorization', () => {
  it('continues querying and notifying for an authorized owner', async () => {
    const summary = await evaluateAlerts();
    expect(summary.evaluatedRuleCount).toBe(1);
    expect(mocks.query).toHaveBeenCalledOnce();
    expect(mocks.notify).toHaveBeenCalledOnce();
    expect(mocks.prisma.executionLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ queryResult: '20', notificationSent: true }),
    });
    expect(mocks.prisma.alertRule.updateMany).not.toHaveBeenCalled();
  });

  it('blocks a revoked owner even when another instance has left a warm pooled client', async () => {
    await executeQuery('c1', 'SELECT 20', 'u1');
    expect(clickHouseClientPool.get('u1', 'c1')).not.toBeNull();
    mocks.query.mockClear();
    mocks.prisma.userClusterAccess.findUnique.mockResolvedValue(null);

    await evaluateAlerts();

    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.notify).not.toHaveBeenCalled();
    expect(mocks.prisma.alertRule.updateMany).toHaveBeenCalledWith({
      where: { id: 'rule1', clusterId: 'c1', createdBy: 'u1' },
      data: { enabled: false, lastAlertStatus: null },
    });
  });

  it('does not let a warm credential cache authorize a query', async () => {
    credentialCache.set('u1', 'c1', { username: 'reader', password: 'password', clusterUrl: 'http://localhost:8123' });
    mocks.prisma.userClusterAccess.findUnique.mockResolvedValue(null);
    await expect(executeQuery('c1', 'SELECT 20', 'u1')).rejects.toBeInstanceOf(AlertAccessRevokedError);
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it.each(['deleted-user', null])('disables an orphaned rule owned by %s', async (createdBy) => {
    mocks.prisma.alertRule.findMany.mockResolvedValue([makeRule({ createdBy })]);
    // User deletion cascades the membership row, even though AlertRule remains.
    mocks.prisma.userClusterAccess.findUnique.mockResolvedValue(null);
    await evaluateAlerts();
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.prisma.alertRule.updateMany).toHaveBeenCalledWith({
      where: { id: 'rule1', clusterId: 'c1', createdBy },
      data: { enabled: false, lastAlertStatus: null },
    });
  });

  it('never falls back to system credentials for an ownerless alert query', async () => {
    await expect(executeQuery('c1', 'SELECT 20')).rejects.toBeInstanceOf(AlertAccessRevokedError);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it('rechecks access after awaiting client acquisition', async () => {
    mocks.decrypt.mockImplementation(async () => {
      mocks.prisma.userClusterAccess.findUnique.mockResolvedValue(null);
      return 'password';
    });
    await expect(executeQuery('c1', 'SELECT 20', 'u1')).rejects.toBeInstanceOf(AlertAccessRevokedError);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it.each([
    ['fire', [{ value: 20 }], null],
    ['resolve', [], 'warning'],
  ] as const)('discards an in-flight result before a %s notification after revocation', async (_action, rows, lastAlertStatus) => {
    mocks.prisma.alertRule.findMany.mockResolvedValue([makeRule({ lastAlertStatus })]);
    mocks.query.mockImplementation(async () => {
      mocks.prisma.userClusterAccess.findUnique.mockResolvedValue(null);
      return { json: async () => rows };
    });

    await evaluateAlerts();

    expect(mocks.query).toHaveBeenCalledOnce();
    expect(mocks.notify).not.toHaveBeenCalled();
    expect(mocks.resolve).not.toHaveBeenCalled();
    expect(mocks.prisma.executionLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ notificationSent: false, error: expect.stringContaining('no longer has access') }),
    });
    expect(mocks.prisma.executionLog.create.mock.calls[0][0].data).not.toHaveProperty('queryResult');
  });

  it('does not query a rule disabled after the evaluation cycle loaded it', async () => {
    mocks.prisma.alertRule.findFirst.mockResolvedValue(null);
    await evaluateAlerts();
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.prisma.alertRule.updateMany).not.toHaveBeenCalled();
  });

  it('suppresses results when the rule is disabled while its query is running', async () => {
    mocks.query.mockImplementation(async () => {
      mocks.prisma.alertRule.findFirst.mockResolvedValue(null);
      return { json: async () => [{ value: 20 }] };
    });
    await evaluateAlerts();
    expect(mocks.notify).not.toHaveBeenCalled();
    expect(mocks.prisma.executionLog.create.mock.calls[0][0].data).not.toHaveProperty('queryResult');
  });

  it('fails closed on an authorization DB error without permanently disabling the rule', async () => {
    mocks.prisma.userClusterAccess.findUnique.mockRejectedValue(new Error('Database unavailable'));
    await evaluateAlerts();
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.notify).not.toHaveBeenCalled();
    expect(mocks.prisma.alertRule.updateMany).not.toHaveBeenCalled();
  });
});

describe('pending client invalidation', () => {
  it('does not repopulate caches from a credential resolution started before revocation', async () => {
    const decryption = deferred<string>();
    const started = deferred<void>();
    mocks.decrypt.mockImplementation(() => { started.resolve(); return decryption.promise; });
    const clientPromise = createClickHouseClient('c1', 'u1');
    await started.promise;

    credentialCache.invalidate('u1', 'c1');
    clickHouseClientPool.invalidate('u1', 'c1');
    decryption.resolve('stale-password');

    expect(await clientPromise).toBeNull();
    expect(credentialCache.get('u1', 'c1')).toBeNull();
    expect(clickHouseClientPool.get('u1', 'c1')).toBeNull();
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it('keeps a newer pending resolution when the invalidated one finishes', async () => {
    const oldDecryption = deferred<string>();
    const newDecryption = deferred<string>();
    const oldStarted = deferred<void>();
    const newStarted = deferred<void>();
    mocks.decrypt
      .mockImplementationOnce(() => { oldStarted.resolve(); return oldDecryption.promise; })
      .mockImplementationOnce(() => { newStarted.resolve(); return newDecryption.promise; });
    const oldClient = createClickHouseClient('c1', 'u1');
    await oldStarted.promise;
    credentialCache.invalidateUser('u1');
    clickHouseClientPool.invalidateUser('u1');
    const newClient = createClickHouseClient('c1', 'u1');
    await newStarted.promise;
    oldDecryption.resolve('stale-password');
    expect(await oldClient).toBeNull();

    const sharedNewClient = createClickHouseClient('c1', 'u1');
    newDecryption.resolve('new-password');
    expect(await newClient).not.toBeNull();
    expect(await sharedNewClient).not.toBeNull();
    expect(mocks.decrypt).toHaveBeenCalledTimes(2);
    expect(mocks.createClient).toHaveBeenCalledOnce();
    expect(credentialCache.get('u1', 'c1')?.password).toBe('new-password');
  });
});
