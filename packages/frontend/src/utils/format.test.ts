import { describe, it, expect } from 'vitest';
import { formatBytes, formatUptime } from './format';

describe('formatBytes', () => {
  it('formats bytes, KB, MB, GB', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(500)).toBe('500 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
    expect(formatBytes(2.5 * 1024 * 1024 * 1024)).toBe('2.5 GB');
  });

  it('returns an em dash for null/undefined/NaN', () => {
    expect(formatBytes(null)).toBe('—');
    expect(formatBytes(undefined)).toBe('—');
    expect(formatBytes(NaN)).toBe('—');
  });
});

describe('formatUptime', () => {
  it('formats seconds, minutes, hours, days', () => {
    expect(formatUptime(0)).toBe('0s');
    expect(formatUptime(90)).toBe('1m 30s');
    expect(formatUptime(3661)).toBe('1h 1m 1s');
    expect(formatUptime(90061)).toBe('1d 1h 1m 1s');
  });
});
