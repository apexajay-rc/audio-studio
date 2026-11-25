import { describe, expect, it } from 'vitest';
import {
  calculatePeakAmplitude,
  createExportFileName,
  validateMp3Bytes,
  validateRenderedAudio,
  validateWavBytes,
} from './exportValidation';
import { encodePcmWav } from './wavEncoder';

describe('export validation', () => {
  it('validates rendered audio metadata and sample values', () => {
    const audio = {
      sampleRate: 44100,
      numberOfChannels: 1,
      length: 3,
      getChannelData: () => new Float32Array([0.1, -0.8, 0.4]),
    };
    expect(validateRenderedAudio(audio)).toEqual({ valid: true });
    expect(calculatePeakAmplitude(audio)).toBeCloseTo(0.8);
  });

  it('rejects rendered audio containing invalid samples', () => {
    const audio = {
      sampleRate: 44100,
      numberOfChannels: 1,
      length: 1,
      getChannelData: () => new Float32Array([Number.NaN]),
    };
    expect(validateRenderedAudio(audio).valid).toBe(false);
  });

  it('rejects WAV headers whose declared payload does not match the file', () => {
    const valid = encodePcmWav({
      sampleRate: 44100,
      numberOfChannels: 1,
      length: 2,
      getChannelData: () => new Float32Array([0, 0]),
    });
    const corrupted = valid.slice();
    corrupted[40] = 0xff;
    expect(validateWavBytes(corrupted).valid).toBe(false);
  });

  it('accepts a valid MPEG Layer III frame header and rejects malformed headers', () => {
    expect(validateMp3Bytes(new Uint8Array([0xff, 0xfb, 0x90, 0x64]))).toEqual({ valid: true });
    expect(validateMp3Bytes(new Uint8Array([0, 1, 2, 3])).valid).toBe(false);
    expect(validateMp3Bytes(new Uint8Array([0xff, 0xeb, 0x90, 0x64])).valid).toBe(false);
    expect(validateMp3Bytes(new Uint8Array([0xff, 0xf9, 0x90, 0x64])).valid).toBe(false);
    expect(validateMp3Bytes(new Uint8Array([0xff, 0xfb, 0x00, 0x64])).valid).toBe(false);
    expect(validateMp3Bytes(new Uint8Array([0xff, 0xfb, 0xfc, 0x64])).valid).toBe(false);
  });

  it('creates a safe edited filename', () => {
    expect(createExportFileName('My song.mp3', 'wav')).toBe('My-song-edited.wav');
    expect(createExportFileName('東京 / 夜.mp3', 'mp3')).toBe('東京-夜-edited.mp3');
  });
});
