import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({ prisma: {} }));

import { compareThreshold, resolveNotificationAction } from '../evaluator';

describe('compareThreshold', () => {
  it.each([
    [100, '>', 50, true],
    [100, '>', 100, false],
    [50, '>', 100, false],
    [50, '<', 100, true],
    [100, '<', 50, false],
    [100, '<', 100, false],
    [100, '>=', 100, true],
    [101, '>=', 100, true],
    [99, '>=', 100, false],
    [100, '<=', 100, true],
    [99, '<=', 100, true],
    [101, '<=', 100, false],
    [100, '=', 100, true],
    [100, '=', 99, false],
    [100, '!=', 99, true],
    [100, '!=', 100, false],
  ] as [number, string, number, boolean][])(
    'compareThreshold(%d, %s, %d) returns %s',
    (value, op, threshold, expected) => {
      expect(compareThreshold(value, op, threshold)).toBe(expected);
    }
  );

  it('throws for unknown operator', () => {
    expect(() => compareThreshold(100, '??', 50)).toThrow('Unknown operator: ??');
  });
});

describe('resolveNotificationAction', () => {
  it('fires when transitioning from idle to firing', () => {
    expect(resolveNotificationAction(null, 'warning')).toEqual({ type: 'fire' });
  });

  it('suppresses when severity stays the same', () => {
    expect(resolveNotificationAction('warning', 'warning')).toEqual({ type: 'none' });
  });

  it('fires again when severity escalates', () => {
    expect(resolveNotificationAction('warning', 'critical')).toEqual({ type: 'fire' });
  });

  it('fires again when severity de-escalates', () => {
    expect(resolveNotificationAction('critical', 'warning')).toEqual({ type: 'fire' });
  });

  it('resolves when transitioning from firing back to idle', () => {
    expect(resolveNotificationAction('warning', null)).toEqual({
      type: 'resolve',
      previousSeverity: 'warning',
    });
  });

  it('stays none when already idle and remains idle', () => {
    expect(resolveNotificationAction(null, null)).toEqual({ type: 'none' });
  });
});
