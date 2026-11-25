import { describe, expect, it } from 'vitest';
import { clampTime, snapTimeToSample, validateTrimRange } from './trimRange';

describe('validateTrimRange', () => {
  it('accepts a valid range inside the track', () => {
    expect(validateTrimRange({ startSeconds: 5, endSeconds: 25 }, 60)).toBe(true);
  });

  it('rejects negative start time', () => {
    expect(validateTrimRange({ startSeconds: -1, endSeconds: 25 }, 60)).toBe(false);
  });

  it('rejects an end time after the track duration', () => {
    expect(validateTrimRange({ startSeconds: 5, endSeconds: 61 }, 60)).toBe(false);
  });

  it('rejects a zero-length or reversed range', () => {
    expect(validateTrimRange({ startSeconds: 10, endSeconds: 10 }, 60)).toBe(false);
    expect(validateTrimRange({ startSeconds: 20, endSeconds: 10 }, 60)).toBe(false);
  });

  it('rejects non-finite boundaries', () => {
    expect(validateTrimRange({ startSeconds: Number.NaN, endSeconds: 10 }, 60)).toBe(false);
    expect(validateTrimRange({ startSeconds: 0, endSeconds: Number.POSITIVE_INFINITY }, 60)).toBe(false);
  });
});

describe('clampTime', () => {
  it('clamps negative values to zero', () => {
    expect(clampTime(-4, 30)).toBe(0);
  });

  it('clamps values beyond duration', () => {
    expect(clampTime(40, 30)).toBe(30);
  });

  it('returns a valid time unchanged', () => {
    expect(clampTime(12.5, 30)).toBe(12.5);
  });

  it('handles non-finite values safely', () => {
    expect(clampTime(Number.NaN, 30)).toBe(0);
  });
});

describe('snapTimeToSample', () => {
  it('snaps a time to the nearest sample boundary', () => {
    expect(snapTimeToSample(1.23456, 1_000, 10)).toBe(1.235);
  });

  it('clamps times below zero and beyond the track', () => {
    expect(snapTimeToSample(-1, 1_000, 2)).toBe(0);
    expect(snapTimeToSample(5, 1_000, 2)).toBe(2);
  });

  it('returns zero for invalid sample rates or durations', () => {
    expect(snapTimeToSample(1, 0, 2)).toBe(0);
    expect(snapTimeToSample(1, 1_000, Number.NaN)).toBe(0);
  });
});
