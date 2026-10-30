import { describe, expect, it } from 'vitest';

import {
  getHighestSeverity,
  getPrefilterThreshold,
  parseThresholdLevels,
  resolveMatchedThreshold,
} from '../thresholds';
import { alertRuleApiCreateSchema, alertRuleTestSchema } from '../validation';

describe('multi-threshold helpers', () => {
  it('parses and sorts thresholds', () => {
    expect(
      parseThresholdLevels([
        { severity: 'critical', operator: '>=', value: 90, order: 1 },
        { severity: 'warning', operator: '>=', value: 80, order: 0 },
      ])
    ).toEqual([
      { severity: 'warning', operator: '>=', value: 80, order: 0 },
      { severity: 'critical', operator: '>=', value: 90, order: 1 },
    ]);
  });

  it('returns the lowest threshold as prefilter for upward comparisons', () => {
    expect(
      getPrefilterThreshold([
        { severity: 'warning', operator: '>=', value: 80, order: 0 },
        { severity: 'critical', operator: '>=', value: 90, order: 1 },
      ])
    ).toEqual({ severity: 'warning', operator: '>=', value: 80, order: 0 });
  });

  it('selects the highest matched severity', () => {
    const matched = resolveMatchedThreshold(
      95,
      [
        { severity: 'warning', operator: '>=', value: 80, order: 0 },
        { severity: 'critical', operator: '>=', value: 90, order: 1 },
      ],
      (value, operator, threshold) => {
        switch (operator) {
          case '>=':
            return value >= threshold;
          case '>':
            return value > threshold;
          case '<=':
            return value <= threshold;
          case '<':
            return value < threshold;
          case '=':
            return value === threshold;
          case '!=':
            return value !== threshold;
          default:
            return false;
        }
      }
    );

    expect(matched).toEqual({ severity: 'critical', operator: '>=', value: 90, order: 1 });
    expect(getHighestSeverity([matched!])).toBe('critical');
  });
});

describe('alertRuleApiCreateSchema', () => {
  it('requires thresholds-only payloads', () => {
    const parsed = alertRuleApiCreateSchema.parse({
      clusterId: 'ck1234567890abcdef1234567',
      name: 'CPU usage',
      description: 'CPU threshold',
      query: 'SELECT 95 as cpu_usage',
      checkIntervalMinutes: 5,
      thresholdColumnName: 'cpu_usage',
      thresholds: [
        { severity: 'warning', operator: '>=', value: 80, order: 0 },
        { severity: 'critical', operator: '>=', value: 90, order: 1 },
      ],
      notificationChannels: [
        { type: 'slack', url: 'https://hooks.slack.com/services/test', templateType: 'basic' },
      ],
      enabled: true,
    });

    expect(parsed.thresholds).toHaveLength(2);
    expect(parsed.thresholdColumnName).toBe('cpu_usage');
  });

  it('accepts slug-based cluster ids used by this app', () => {
    const parsed = alertRuleApiCreateSchema.parse({
      clusterId: 'ckc02-stg',
      name: 'CPU usage',
      description: 'CPU threshold',
      query: 'SELECT 95 as cpu_usage',
      checkIntervalMinutes: 5,
      thresholdColumnName: 'cpu_usage',
      thresholds: [
        { severity: 'warning', operator: '>=', value: 80, order: 0 },
        { severity: 'critical', operator: '>=', value: 90, order: 1 },
      ],
      notificationChannels: [
        { type: 'slack', url: 'https://hooks.slack.com/services/test', templateType: 'basic' },
      ],
      enabled: true,
    });

    expect(parsed.clusterId).toBe('ckc02-stg');
  });

  it('rejects the all-clusters sentinel as a cluster id', () => {
    const result = alertRuleTestSchema.safeParse({
      clusterId: 'all',
      query: 'SELECT 95 as cpu_usage',
      thresholdColumnName: 'cpu_usage',
      thresholds: [{ severity: 'warning', operator: '>=', value: 80, order: 0 }],
    });

    expect(result.success).toBe(false);
  });
});
