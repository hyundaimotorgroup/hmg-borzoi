import { describe, expect, it } from 'vitest';
import { buildTimeseriesQuery } from './timeseries';

const window = {
  startUtc: '2026-06-01T00:00:00',
  endUtc: '2026-06-01T01:00:00',
  intervalSeconds: 60,
};

describe('buildTimeseriesQuery system log filters', () => {
  it('uses PREWHERE for metric_log metrics', () => {
    const query = buildTimeseriesQuery('cpu', window).query;

    expect(query).toContain('host_cpu AS (');
    expect(query).toContain("countIf(metric LIKE 'CPUFrequencyMHz_%') AS logical_cpu_cores_est");
    expect(query).toContain('as cpu_usage_percent');
    expect(query).toContain("PREWHERE event_date >= toDate('2026-06-01')");
    expect(query).toContain("event_time < toDateTime('2026-06-01T01:00:00', 'UTC')");
    expect(query).not.toMatch(/\n\s*WHERE event_date\b/);
  });

  it('uses PREWHERE for async_metric_log metrics', () => {
    const query = buildTimeseriesQuery('memory', window).query;

    expect(query).toContain("PREWHERE event_date >= toDate('2026-06-01')");
    expect(query).toContain("WHERE metric IN ('MemoryResident', 'OSMemoryTotal')");
    expect(query).not.toMatch(/\n\s*WHERE event_date\b/);
  });

  it('uses PREWHERE for query_log metrics', () => {
    const query = buildTimeseriesQuery('queryDuration', window).query;

    expect(query).toContain("PREWHERE event_date >= toDate('2026-06-01')");
    expect(query).toContain("WHERE type IN ('QueryFinish')");
    expect(query).not.toMatch(/\n\s*WHERE event_date\b/);
  });

  it('uses PREWHERE for error_log metrics', () => {
    const query = buildTimeseriesQuery('connectionErrors', window).query;

    expect(query).toContain("PREWHERE event_date >= toDate('2026-06-01')");
    expect(query).toContain('WHERE code = 210');
    expect(query).not.toMatch(/\n\s*WHERE event_date\b/);
  });
});
