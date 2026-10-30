import { logger } from '@/lib/utils/logger';

import { evaluateAlerts, type AlertEvaluationSummary } from './evaluator';

type SchedulerTrigger = 'manual' | 'interval';

interface AlertSchedulerState {
  started: boolean;
  startedAt: string | null;
  startedBy: string | null;
  intervalMinutes: number;
  intervalMs: number;
  runCount: number;
  isRunning: boolean;
  lastRunTrigger: SchedulerTrigger | null;
  lastRunSource: string | null;
  lastRunStartedAt: string | null;
  lastRunCompletedAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  lastSummary: AlertEvaluationSummary | null;
}

type SchedulerRuntime = {
  state: AlertSchedulerState;
  timer: ReturnType<typeof setInterval> | null;
};

declare global {
  var __alertSchedulerRuntime__: SchedulerRuntime | undefined;
}

function getIntervalMinutes(): number {
  const raw = Number.parseInt(process.env.ALERT_EVALUATION_INTERVAL_MINUTES ?? '1', 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 1;
}

function createInitialState(): AlertSchedulerState {
  const intervalMinutes = getIntervalMinutes();

  return {
    started: false,
    startedAt: null,
    startedBy: null,
    intervalMinutes,
    intervalMs: intervalMinutes * 60 * 1000,
    runCount: 0,
    isRunning: false,
    lastRunTrigger: null,
    lastRunSource: null,
    lastRunStartedAt: null,
    lastRunCompletedAt: null,
    lastSuccessAt: null,
    lastError: null,
    lastSummary: null,
  };
}

function getRuntime(): SchedulerRuntime {
  if (!globalThis.__alertSchedulerRuntime__) {
    globalThis.__alertSchedulerRuntime__ = {
      state: createInitialState(),
      timer: null,
    };
  }

  return globalThis.__alertSchedulerRuntime__;
}

function shouldSkipSchedulerStart(): boolean {
  return process.env.NEXT_RUNTIME === 'edge' || process.env.NEXT_PHASE === 'phase-production-build';
}

export function getAlertSchedulerStatus(): AlertSchedulerState {
  const { state } = getRuntime();

  return {
    ...state,
    lastSummary: state.lastSummary ? { ...state.lastSummary } : null,
  };
}

export function ensureAlertSchedulerStarted(source = 'unknown'): AlertSchedulerState {
  const runtime = getRuntime();
  const intervalMinutes = getIntervalMinutes();
  runtime.state.intervalMinutes = intervalMinutes;
  runtime.state.intervalMs = intervalMinutes * 60 * 1000;

  if (shouldSkipSchedulerStart()) {
    return getAlertSchedulerStatus();
  }

  if (runtime.timer) {
    return getAlertSchedulerStatus();
  }

  runtime.state.started = true;
  runtime.state.startedAt = new Date().toISOString();
  runtime.state.startedBy = source;

  runtime.timer = setInterval(() => {
    void runAlertScheduler('interval', 'interval');
  }, runtime.state.intervalMs);

  if (typeof runtime.timer.unref === 'function') {
    runtime.timer.unref();
  }

  logger.info(
    `[Scheduler] Started alert scheduler (source=${source}, intervalMinutes=${runtime.state.intervalMinutes})`
  );

  return getAlertSchedulerStatus();
}

export async function runAlertScheduler(
  trigger: SchedulerTrigger = 'manual',
  source = 'manual'
): Promise<AlertEvaluationSummary | null> {
  if (shouldSkipSchedulerStart()) {
    return null;
  }

  const runtime = getRuntime();

  if (runtime.state.isRunning) {
    logger.warn(`[Scheduler] Skipping ${trigger} run because another evaluation is already running`);
    return runtime.state.lastSummary;
  }

  runtime.state.isRunning = true;
  runtime.state.lastRunTrigger = trigger;
  runtime.state.lastRunSource = source;
  runtime.state.lastRunStartedAt = new Date().toISOString();

  try {
    const summary = await evaluateAlerts();
    runtime.state.runCount += 1;
    runtime.state.lastRunCompletedAt = new Date().toISOString();
    runtime.state.lastSuccessAt = runtime.state.lastRunCompletedAt;
    runtime.state.lastError = null;
    runtime.state.lastSummary = summary;
    return summary;
  } catch (error) {
    runtime.state.runCount += 1;
    runtime.state.lastRunCompletedAt = new Date().toISOString();
    runtime.state.lastError = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    runtime.state.isRunning = false;
  }
}

export function resetAlertSchedulerForTests(): void {
  const runtime = getRuntime();
  if (runtime.timer) {
    clearInterval(runtime.timer);
  }
  runtime.timer = null;
  runtime.state = createInitialState();
}
