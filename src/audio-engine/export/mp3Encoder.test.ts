import { describe, expect, it } from 'vitest';
import {
  convertFloatSamplesToPcm16,
  getMp3TargetSampleRate,
  SUPPORTED_MP3_SAMPLE_RATES,
} from './mp3Encoder';

describe('MP3 encoder input preparation', () => {
  it('converts float samples to signed 16-bit PCM and clamps peaks', () => {
    const samples = new Float32Array([-2, -1, -0.5, 0, 0.5, 1, 2, Number.NaN]);
    expect(Array.from(convertFloatSamplesToPcm16(samples))).toEqual([
      -32768,
      -32768,
      -16384,
      0,
      16384,
      32767,
      32767,
      0,
    ]);
  });

  it('selects a supported MP3 sample rate close to the source', () => {
    expect(getMp3TargetSampleRate(44100)).toBe(44100);
    expect(getMp3TargetSampleRate(48000)).toBe(48000);
    expect(getMp3TargetSampleRate(96000)).toBe(48000);
    expect(getMp3TargetSampleRate(22050)).toBe(32000);
    expect(SUPPORTED_MP3_SAMPLE_RATES).toContain(getMp3TargetSampleRate(44100));
  });

  it('rejects invalid sample rates', () => {
    expect(() => getMp3TargetSampleRate(0)).toThrow(/sample rate/);
    expect(() => getMp3TargetSampleRate(Number.NaN)).toThrow(/sample rate/);
  });
});
