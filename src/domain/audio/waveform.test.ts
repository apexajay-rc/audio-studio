import { describe, expect, it } from 'vitest';
import { buildWaveformPeaks } from './waveform';

describe('buildWaveformPeaks', () => {
  it('returns peak magnitudes across all channels', () => {
    const left = new Float32Array([0.1, -0.8, 0.2, 0.1]);
    const right = new Float32Array([0.2, 0.1, -0.6, 0.3]);

    const peaks = buildWaveformPeaks([left, right], 2);
    expect(peaks[0]).toBeCloseTo(0.8, 6);
    expect(peaks[1]).toBeCloseTo(0.6, 6);
  });

  it('clamps out-of-range floating point magnitudes', () => {
    const channel = new Float32Array([1.2, -1.1]);
    expect(Array.from(buildWaveformPeaks([channel], 2))).toEqual([1, 1]);
  });

  it('rejects an empty channel list', () => {
    expect(() => buildWaveformPeaks([], 2)).toThrow(RangeError);
  });

  it('rejects invalid bucket counts', () => {
    expect(() => buildWaveformPeaks([new Float32Array([0.2])], 0)).toThrow(RangeError);
  });

  it('rejects channels with different sample counts', () => {
    expect(() =>
      buildWaveformPeaks([new Float32Array([0.1]), new Float32Array([0.1, 0.2])], 2),
    ).toThrow(RangeError);
  });
});
