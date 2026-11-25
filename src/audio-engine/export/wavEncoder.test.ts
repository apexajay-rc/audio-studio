import { describe, expect, it } from 'vitest';
import { encodePcmWav } from './wavEncoder';
import { validateWavBytes } from './exportValidation';

function createPcmSource(channels: Float32Array[], sampleRate = 44100) {
  return {
    sampleRate,
    numberOfChannels: channels.length,
    length: channels[0]?.length ?? 0,
    getChannelData: (channel: number) => channels[channel] ?? new Float32Array(),
  };
}

describe('16-bit PCM WAV encoder', () => {
  it('writes a valid mono PCM WAV header and samples', () => {
    const encoded = encodePcmWav(createPcmSource([new Float32Array([-1, -0.5, 0, 0.5, 1])]));
    const view = new DataView(encoded.buffer, encoded.byteOffset, encoded.byteLength);

    expect(String.fromCharCode(...encoded.subarray(0, 4))).toBe('RIFF');
    expect(String.fromCharCode(...encoded.subarray(8, 12))).toBe('WAVE');
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(44100);
    expect(view.getUint16(34, true)).toBe(16);
    expect(view.getUint32(40, true)).toBe(10);
    expect(view.getInt16(44, true)).toBe(-32768);
    expect(view.getInt16(52, true)).toBe(32767);
    expect(validateWavBytes(encoded)).toEqual({ valid: true });
  });

  it('interleaves stereo samples frame-by-frame', () => {
    const encoded = encodePcmWav(createPcmSource([
      new Float32Array([0.25, 0.5]),
      new Float32Array([-0.25, -0.5]),
    ]));
    const view = new DataView(encoded.buffer, encoded.byteOffset, encoded.byteLength);

    expect(view.getUint16(22, true)).toBe(2);
    expect(view.getInt16(44, true)).toBe(8192);
    expect(view.getInt16(46, true)).toBe(-8192);
    expect(view.getInt16(48, true)).toBe(16384);
    expect(view.getInt16(50, true)).toBe(-16384);
    expect(validateWavBytes(encoded)).toEqual({ valid: true });
  });

  it('rejects an empty or invalid source', () => {
    expect(() => encodePcmWav(createPcmSource([new Float32Array()]))).toThrow(/at least one/);
    expect(() => encodePcmWav(createPcmSource([new Float32Array([0])], 1000))).toThrow(/sample rate/);
  });

  it('replaces non-finite sample values with silence', () => {
    const encoded = encodePcmWav(createPcmSource([new Float32Array([Number.NaN])]));
    const view = new DataView(encoded.buffer, encoded.byteOffset, encoded.byteLength);
    expect(view.getInt16(44, true)).toBe(0);
  });
});
