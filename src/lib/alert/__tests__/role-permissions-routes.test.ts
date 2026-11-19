// @vitest-environment node
import type { AlertRule } from '@prisma/client';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppRole } from '@/types/auth';

const mocks = vi.hoisted(() => ({
  requireSession: vi.fn(),
  prisma: {
    user: { findUnique: vi.fn() },
    userClusterAccess: { findUnique: vi.fn() },
    alertRule: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn(), delete: vi.fn() },
  },
  validateQuery: vi.fn(),
  checkHosts: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('@/lib/auth/session', () => ({ requireSession: mocks.requireSession }));
vi.mock('@/lib/auth/audit', () => ({ createAuditLog: vi.fn() }));
vi.mock('@/lib/alert/clickhouse-client', () => ({ validateQuery: mocks.validateQuery }));
vi.mock('@/lib/alert/host-check', () => ({ assertNotificationChannelsHostsAllowed: mocks.checkHosts }));
vi.mock('@/lib/utils/logger', () => ({ logger: { error: vi.fn() } }));

// Exercise the real role middleware and permission lookups to verify the
// authorization boundary at the exported API handlers.
import { POST as createAlert } from '@/app/api/alerts/route';
import { PATCH as updateAlert, DELETE as deleteAlert } from '@/app/api/alerts/[id]/route';

const createPayload = {
  clusterId: 'cluster1',
  name: 'Metric alert',
  query: 'SELECT value FROM metrics',
  checkIntervalMinutes: 1,
  thresholds: [{ severity: 'warning', operator: '>=', value: 80 }],
  notificationChannels: [{ type: 'webhook', url: 'https://example.com/alerts' }],
};

const operations = [
  { name: 'create', method: 'POST', handler: createAlert, payload: createPayload },
  { name: 'edit', method: 'PATCH', handler: updateAlert, payload: { query: 'SELECT max(value) AS value FROM metrics' } },
  { name: 'delete', method: 'DELETE', handler: deleteAlert, payload: undefined },
] as const;

function makeRule(overrides: Partial<AlertRule> = {}): AlertRule {
  return {
    id: 'rule1', clusterId: 'cluster1', createdBy: 'user1', name: 'Metric alert',
    description: null, query: 'SELECT value FROM metrics', checkIntervalMinutes: 1,
    thresholds: [{ severity: 'warning', operator: '>=', value: 80 }],
    thresholdColumnName: null, notificationChannels: [], enabled: false,
    lastExecutedAt: null, lastAlertStatus: null, createdAt: new Date(), updatedAt: new Date(),
    ...overrides,
  };
}

function signIn(sessionRole: AppRole, currentRole: AppRole = sessionRole) {
  mocks.requireSession.mockResolvedValue({
    id: 'user1', email: 'user@example.com', name: 'Test User', role: sessionRole,
  });
  mocks.prisma.user.findUnique.mockResolvedValue({ role: currentRole });
}

async function invoke(operation: typeof operations[number], payload: unknown = operation.payload) {
  const url = operation.method === 'POST' ? '/api/alerts' : '/api/alerts/rule1';
  return operation.handler(new NextRequest(`http://localhost${url}`, {
    method: operation.method,
    headers: { 'Content-Type': 'application/json' },
    ...(payload !== undefined && { body: JSON.stringify(payload) }),
  }), { params: Promise.resolve({ id: 'rule1' }) });
}

function expectNoMutations() {
  expect(mocks.prisma.alertRule.create).not.toHaveBeenCalled();
  expect(mocks.prisma.alertRule.update).not.toHaveBeenCalled();
  expect(mocks.prisma.alertRule.delete).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.resetAllMocks();
  signIn('viewer');
  mocks.prisma.userClusterAccess.findUnique.mockResolvedValue({ id: 'grant1' });
  mocks.prisma.alertRule.findFirst.mockResolvedValue(makeRule());
  mocks.prisma.alertRule.create.mockImplementation(async ({ data }) => ({ id: 'rule1', ...data }));
  mocks.prisma.alertRule.update.mockResolvedValue(makeRule());
});

describe('alert mutation roles', () => {
  it.each(operations)('blocks a viewer with cluster access from $name', async (operation) => {
    const response = await invoke(operation);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Forbidden: Insufficient permissions' });
    expect(mocks.prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user1' }, select: { role: true },
    });
    expectNoMutations();
    expect(mocks.validateQuery).not.toHaveBeenCalled();
    expect(mocks.checkHosts).not.toHaveBeenCalled();
  });

  it.each([
    { enabled: true },
    { enabled: false },
    { name: 'Renamed alert' },
    { notificationChannels: [{ type: 'webhook', url: 'https://example.com/new-alerts' }] },
  ])('blocks viewer PATCH payload %j even for an owned rule', async (payload) => {
    expect((await invoke(operations[1], payload)).status).toBe(403);
    expectNoMutations();
  });

  it('ignores a claimed admin role in a viewer creation payload', async () => {
    expect((await invoke(operations[0], { ...createPayload, role: 'admin' })).status).toBe(403);
    expectNoMutations();
  });

  it.each(operations)('uses the current DB role after a developer session is demoted for $name', async (operation) => {
    signIn('developer', 'viewer');
    expect((await invoke(operation)).status).toBe(403);
    expectNoMutations();
  });

  it.each(operations)('returns 401 for unauthenticated $name requests', async (operation) => {
    mocks.requireSession.mockRejectedValue(new Error('No session'));
    expect((await invoke(operation)).status).toBe(401);
    expect(mocks.prisma.user.findUnique).not.toHaveBeenCalled();
    expectNoMutations();
  });

  it.each(['admin', 'developer'] as const)('allows %s creation with a cluster grant', async (role) => {
    signIn(role);
    expect((await invoke(operations[0])).status).toBe(201);
    expect(mocks.prisma.alertRule.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ createdBy: 'user1', clusterId: 'cluster1' }),
    });
  });

  it.each(['admin', 'developer'] as const)('allows %s edits with valid ownership and cluster grants', async (role) => {
    signIn(role);
    expect((await invoke(operations[1])).status).toBe(200);
    expect(mocks.prisma.alertRule.update).toHaveBeenCalledOnce();
  });

  it.each(['admin', 'developer'] as const)('allows %s deletion of an accessible rule', async (role) => {
    signIn(role);
    expect((await invoke(operations[2])).status).toBe(200);
    expect(mocks.prisma.alertRule.delete).toHaveBeenCalledWith({ where: { id: 'rule1' } });
  });

  it.each(operations.slice(0, 2))('still requires a developer cluster grant for $name', async (operation) => {
    signIn('developer');
    mocks.prisma.userClusterAccess.findUnique.mockResolvedValue(null);
    expect((await invoke(operation)).status).toBe(403);
    expectNoMutations();
  });

  it.each(operations.slice(1))('preserves developer ownership restrictions for $name', async (operation) => {
    signIn('developer');
    mocks.prisma.alertRule.findFirst.mockResolvedValue(null);
    expect((await invoke(operation)).status).toBe(404);
    expect(mocks.prisma.alertRule.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'rule1', createdBy: 'user1' },
    }));
    expectNoMutations();
  });

  it('keeps the admin disable-only exception without a cluster grant', async () => {
    signIn('admin');
    mocks.prisma.userClusterAccess.findUnique.mockResolvedValue(null);
    mocks.prisma.alertRule.findFirst.mockResolvedValue(makeRule({ createdBy: 'deleted-user', enabled: true }));
    expect((await invoke(operations[1], { enabled: false })).status).toBe(200);
    expect(mocks.prisma.alertRule.update).toHaveBeenCalledWith({
      where: { id: 'rule1' }, data: expect.objectContaining({ enabled: false }),
    });
  });
});
