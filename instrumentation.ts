export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { ensureAlertSchedulerStarted } = await import('@/lib/alert/scheduler');

    ensureAlertSchedulerStarted('instrumentation');
  }
}
