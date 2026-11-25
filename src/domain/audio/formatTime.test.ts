import { describe, expect, it } from 'vitest';
import { formatTime } from './formatTime';

describe('formatTime', () => {
  it('formats seconds as minutes and seconds', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(65.8)).toBe('1:05');
    expect(formatTime(3600)).toBe('60:00');
  });

  it('handles invalid values', () => {
    expect(formatTime(Number.NaN)).toBe('0:00');
    expect(formatTime(-1)).toBe('0:00');
  });
});
