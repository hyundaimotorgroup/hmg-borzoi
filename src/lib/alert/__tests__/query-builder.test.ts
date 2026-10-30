import { describe, expect, it } from 'vitest';

import { buildThresholdFilteredQuery } from '../query-builder';

describe('buildThresholdFilteredQuery', () => {
  it('injects threshold conditions into multiline WHERE clauses before ORDER BY', () => {
    const query = `SELECT
  hostname() AS host,
  getMacro('shard') AS shard,
  getMacro('replica') AS replica,
  database,
  table,
  absolute_delay
FROM clusterAllReplicas('ckc02', system.replicas)
WHERE absolute_delay > 0
  AND is_readonly = 0
  AND is_session_expired = 0
ORDER BY shard`;

    const result = buildThresholdFilteredQuery(query, {
      columnName: 'absolute_delay',
      thresholds: [
        { operator: '>=', value: 1800 },
        { operator: '>=', value: 3600 },
      ],
    });

    expect(result).toContain('AND is_session_expired = 0 AND (absolute_delay >= 1800 OR absolute_delay >= 3600)');
    expect(result).not.toContain('ORDER BY shard AND');
  });

  it('injects WHERE before ORDER BY for multiline queries without an existing WHERE clause', () => {
    const query = `SELECT
  host,
  absolute_delay
FROM system.replicas
ORDER BY host`;

    const result = buildThresholdFilteredQuery(query, {
      columnName: 'absolute_delay',
      thresholds: [{ operator: '>=', value: 1800 }],
    });

    expect(result).toContain('FROM system.replicas WHERE absolute_delay >= 1800');
    expect(result).not.toContain('ORDER BY host WHERE');
  });
});
