import { describe, expect, it } from 'vitest';
import { formatBytes, formatBytesPerSecond, formatMegabytesAsBytes } from './format-bytes';

describe('formatBytes', () => {
  it('formats byte values with readable units', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1024)).toBe('1.00 KB');
    expect(formatBytes(1024 * 1024)).toBe('1.00 MB');
    expect(formatBytes(4 * 1024 * 1024 * 1024)).toBe('4.00 GB');
  });

  it('formats megabyte values after converting them to bytes', () => {
    expect(formatMegabytesAsBytes(0)).toBe('0 B');
    expect(formatMegabytesAsBytes(512)).toBe('512 MB');
    expect(formatMegabytesAsBytes(2048)).toBe('2.00 GB');
  });

  it('formats byte rates with readable units', () => {
    expect(formatBytesPerSecond(0)).toBe('0 B/s');
    expect(formatBytesPerSecond(1024)).toBe('1.00 KB/s');
    expect(formatBytesPerSecond(3 * 1024 * 1024)).toBe('3.00 MB/s');
  });
});
