import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const evaluateAlertsMock = vi.fn();
const loggerInfoMock = vi.fn();
const loggerWarnMock = vi.fn();

vi.mock('../evaluator', () => ({
  evaluateAlerts: evaluateAlertsMock,
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    info: loggerInfoMock,
    warn: loggerWarnMock,
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

describe('alert scheduler', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    evaluateAlertsMock.mockReset();
    loggerInfoMock.mockReset();
    loggerWarnMock.mockReset();
    process.env.ALERT_EVALUATION_INTERVAL_MINUTES = '2';
    delete process.env.NEXT_PHASE;
    delete process.env.NEXT_RUNTIME;
  });

  afterEach(async () => {
    const scheduler = await import('../scheduler');
    scheduler.resetAlertSchedulerForTests();
    vi.useRealTimers();
    delete process.env.ALERT_EVALUATION_INTERVAL_MINUTES;
  });

  it('starts once and exposes configured interval', async () => {
    const scheduler = await import('../scheduler');

    const first = scheduler.ensureAlertSchedulerStarted('test-source');
    const second = scheduler.ensureAlertSchedulerStarted('second-call');

    expect(first.started).toBe(true);
    expect(first.startedBy).toBe('test-source');
    expect(first.intervalMinutes).toBe(2);
    expect(first.intervalMs).toBe(120000);
    expect(second.startedBy).toBe('test-source');
    expect(loggerInfoMock).toHaveBeenCalledTimes(1);
  });

  it('runs evaluations on interval and updates status', async () => {
    evaluateAlertsMock.mockResolvedValue({
      startedAt: '2026-04-24T00:00:00.000Z',
      completedAt: '2026-04-24T00:00:01.000Z',
      enabledRuleCount: 3,
      evaluatedRuleCount: 1,
      skippedRuleCount: 2,
      failedRuleCount: 0,
    });

    const scheduler = await import('../scheduler');
    scheduler.ensureAlertSchedulerStarted('test-source');

    await vi.advanceTimersByTimeAsync(120000);

    const status = scheduler.getAlertSchedulerStatus();
    expect(evaluateAlertsMock).toHaveBeenCalledTimes(1);
    expect(status.runCount).toBe(1);
    expect(status.lastRunTrigger).toBe('interval');
    expect(status.lastRunSource).toBe('interval');
    expect(status.lastSummary?.evaluatedRuleCount).toBe(1);
    expect(status.lastError).toBeNull();
  });

  it('does not start during production build phase', async () => {
    process.env.NEXT_PHASE = 'phase-production-build';
    const scheduler = await import('../scheduler');

    const status = scheduler.ensureAlertSchedulerStarted('build');

    expect(status.started).toBe(false);
    await vi.advanceTimersByTimeAsync(120000);
    expect(evaluateAlertsMock).not.toHaveBeenCalled();
  });
});
