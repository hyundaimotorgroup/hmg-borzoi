import { describe, expect, it } from 'vitest';
import { SnapshotQueries } from './snapshot';

describe('SnapshotQueries system log filters', () => {
  it('uses PREWHERE for recent query snapshots', () => {
    const query = SnapshotQueries.getQueryOverviewSummary();

    expect(query).toContain('PREWHERE event_date >= toDate(now() - INTERVAL 1 DAY)');
    expect(query).toContain("event_time >= now() - INTERVAL 1 MINUTE");
    expect(query).toContain("WHERE type IN ('QueryStart', 'QueryFinish', 'ExceptionBeforeStart', 'ExceptionWhileProcessing')");
    expect(query).not.toMatch(/\n\s*WHERE event_date\b/);
  });

  it('uses bounded PREWHERE for recent metric_log summaries', () => {
    const query = SnapshotQueries.getMetricLogOverviewSummary();

    expect(query).toContain('PREWHERE event_date >= today()');
    expect(query).toContain("event_time >= now() - INTERVAL 1 MINUTE");
    expect(query).toContain('event_time < now()');
    expect(query).not.toMatch(/\n\s*WHERE event_date\b/);
  });

  it('uses PREWHERE for seven-day query error snapshots', () => {
    const query = SnapshotQueries.getSystemErrors();

    expect(query).toContain('PREWHERE event_date >= toDate(now() - INTERVAL 7 DAY)');
    expect(query).toContain("event_time >= now() - INTERVAL 7 DAY");
    expect(query).toContain("WHERE type IN ('ExceptionBeforeStart', 'ExceptionWhileProcessing')");
    expect(query).not.toMatch(/\n\s*WHERE event_date\b/);
  });

  it('uses PREWHERE for windowed recent query lists', () => {
    const query = SnapshotQueries.getRecentQueries(
      {
        startUtc: '2026-06-01T00:00:00',
        endUtc: '2026-06-01T01:00:00',
      },
      { limit: 10, offset: 20, searchTerm: "select 1" }
    );

    expect(query).toContain("PREWHERE event_date >= toDate('2026-06-01')");
    expect(query).toContain("event_date <= toDate('2026-06-01')");
    expect(query).toContain("event_time >= toDateTime('2026-06-01T00:00:00', 'UTC')");
    expect(query).toContain("event_time < toDateTime('2026-06-01T01:00:00', 'UTC')");
    expect(query).toContain("WHERE type IN ('QueryFinish', 'ExceptionBeforeStart', 'ExceptionWhileProcessing')");
    expect(query).toContain('AND initial_query_id = query_id');
    expect(query).toContain("AND query NOT LIKE '%system.query_log%'");
    expect(query).toContain("positionCaseInsensitiveUTF8(query, 'select 1') > 0");
    expect(query).toContain('LIMIT 10 OFFSET 20');
  });

  it('uses PREWHERE for windowed recent query counts', () => {
    const query = SnapshotQueries.getRecentQueriesCount(
      {
        startUtc: '2026-06-01T00:00:00',
        endUtc: '2026-06-01T01:00:00',
      },
      "analyst"
    );

    expect(query).toContain("PREWHERE event_date >= toDate('2026-06-01')");
    expect(query).toContain("WHERE type IN ('QueryFinish', 'ExceptionBeforeStart', 'ExceptionWhileProcessing')");
    expect(query).toContain('AND initial_query_id = query_id');
    expect(query).toContain("positionCaseInsensitiveUTF8(user, 'analyst') > 0");
    expect(query).toContain('SELECT count() AS total');
  });

  it('limits failed query lists per user with a window function', () => {
    const query = SnapshotQueries.getFailedQueriesList(
      {
        startUtc: '2026-06-01T00:00:00',
        endUtc: '2026-06-01T01:00:00',
      },
      100
    );

    expect(query).toContain("PREWHERE event_date >= toDate('2026-06-01')");
    expect(query).toContain("WHERE type IN ('ExceptionBeforeStart', 'ExceptionWhileProcessing')");
    expect(query).toContain('AND initial_query_id = query_id');
    expect(query).toContain('row_number() OVER (');
    expect(query).toContain('PARTITION BY user');
    expect(query).toContain('WHERE user_row_number <= 100');
    expect(query).toContain('ORDER BY user ASC, event_time DESC, query_id DESC');
  });

  it('uses PREWHERE for recent error_log snapshots', () => {
    const query = SnapshotQueries.getConnectionErrors();

    expect(query).toContain('PREWHERE event_date >= toDate(now() - INTERVAL 1 DAY)');
    expect(query).toContain("event_time >= now() - INTERVAL 1 MINUTE");
    expect(query).toContain('WHERE code = 210');
    expect(query).not.toMatch(/\n\s*WHERE event_date\b/);
  });
});
