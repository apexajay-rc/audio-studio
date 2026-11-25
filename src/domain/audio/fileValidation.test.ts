import { describe, expect, it } from 'vitest';
import { MAX_AUDIO_FILE_BYTES, type AudioFileLike } from './audioTypes';
import { validateAudioFile } from './fileValidation';

function fileLike(name: string, size: number, type = 'audio/mpeg'): AudioFileLike {
  return { name, size, type, arrayBuffer: async () => new ArrayBuffer(0) };
}

describe('validateAudioFile', () => {
  it('accepts an MP3 file', () => {
    expect(validateAudioFile(fileLike('song.mp3', 1024))).toEqual({ valid: true });
  });

  it('accepts a WAV file', () => {
    expect(validateAudioFile(fileLike('voice.wav', 1024, 'audio/wav'))).toEqual({ valid: true });
  });

  it('rejects unsupported extensions', () => {
    expect(validateAudioFile(fileLike('song.flac', 1024)).valid).toBe(false);
  });

  it('rejects empty files', () => {
    expect(validateAudioFile(fileLike('empty.mp3', 0)).valid).toBe(false);
  });

  it('rejects files over the configured size limit', () => {
    expect(validateAudioFile(fileLike('large.mp3', MAX_AUDIO_FILE_BYTES + 1)).valid).toBe(false);
  });

  it('rejects a MIME type that conflicts with the extension', () => {
    expect(validateAudioFile(fileLike('song.mp3', 1024, 'image/png')).valid).toBe(false);
  });

  it('accepts a valid extension when the browser provides no MIME type', () => {
    expect(validateAudioFile(fileLike('song.mp3', 1024, '')).valid).toBe(true);
  });
});
