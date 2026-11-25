import type { AudioExportFormat } from '../../domain/audio/audioTypes';

export interface ExportBufferMetadata {
  readonly sampleRate: number;
  readonly numberOfChannels: number;
  readonly length: number;
  getChannelData(channel: number): Float32Array;
}

export interface ExportValidation {
  readonly valid: boolean;
  readonly reason?: string;
}

function matchesAscii(bytes: Uint8Array, offset: number, value: string): boolean {
  if (offset < 0 || offset + value.length > bytes.length) return false;
  for (let index = 0; index < value.length; index += 1) {
    if (bytes[offset + index] !== value.charCodeAt(index)) return false;
  }
  return true;
}

export function validateRenderedAudio(audio: ExportBufferMetadata): ExportValidation {
  if (!Number.isInteger(audio.sampleRate) || audio.sampleRate < 8000 || audio.sampleRate > 192000) {
    return { valid: false, reason: 'The rendered audio has an invalid sample rate.' };
  }
  if (!Number.isInteger(audio.numberOfChannels) || audio.numberOfChannels < 1 || audio.numberOfChannels > 8) {
    return { valid: false, reason: 'The rendered audio has an unsupported channel count.' };
  }
  if (!Number.isSafeInteger(audio.length) || audio.length <= 0) {
    return { valid: false, reason: 'The rendered audio is empty.' };
  }

  const duration = audio.length / audio.sampleRate;
  if (!Number.isFinite(duration) || duration <= 0 || duration > 30 * 60 + 4) {
    return { valid: false, reason: 'The rendered audio duration is outside the supported range.' };
  }

  for (let channel = 0; channel < audio.numberOfChannels; channel += 1) {
    const samples = audio.getChannelData(channel);
    if (samples.length !== audio.length) {
      return { valid: false, reason: 'The rendered audio channels have inconsistent lengths.' };
    }
    for (let index = 0; index < samples.length; index += 1) {
      if (!Number.isFinite(samples[index])) {
        return { valid: false, reason: 'The rendered audio contains invalid numeric samples.' };
      }
    }
  }

  return { valid: true };
}

export function validateWavBytes(bytes: Uint8Array): ExportValidation {
  if (bytes.byteLength < 44) return { valid: false, reason: 'The WAV output is too small.' };
  if (!matchesAscii(bytes, 0, 'RIFF') || !matchesAscii(bytes, 8, 'WAVE')) {
    return { valid: false, reason: 'The WAV output is missing a valid RIFF/WAVE header.' };
  }
  if (!matchesAscii(bytes, 12, 'fmt ') || !matchesAscii(bytes, 36, 'data')) {
    return { valid: false, reason: 'The WAV output has an invalid PCM header.' };
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const riffSize = view.getUint32(4, true);
  const format = view.getUint16(20, true);
  const channels = view.getUint16(22, true);
  const sampleRate = view.getUint32(24, true);
  const byteRate = view.getUint32(28, true);
  const blockAlign = view.getUint16(32, true);
  const bitsPerSample = view.getUint16(34, true);
  const dataSize = view.getUint32(40, true);

  if (format !== 1 || bitsPerSample !== 16) {
    return { valid: false, reason: 'The WAV output is not 16-bit linear PCM.' };
  }
  if (channels < 1 || channels > 8 || sampleRate < 8000 || sampleRate > 192000) {
    return { valid: false, reason: 'The WAV output has invalid channel or sample-rate metadata.' };
  }
  if (blockAlign !== channels * 2 || byteRate !== sampleRate * blockAlign) {
    return { valid: false, reason: 'The WAV output has inconsistent PCM format fields.' };
  }
  if (dataSize % blockAlign !== 0 || riffSize !== bytes.byteLength - 8 || dataSize !== bytes.byteLength - 44) {
    return { valid: false, reason: 'The WAV output data length does not match its header.' };
  }

  return { valid: true };
}

function findMp3FrameOffset(bytes: Uint8Array): number {
  if (matchesAscii(bytes, 0, 'ID3')) {
    if (bytes.length < 10) return -1;
    const tagSize =
      ((bytes[6] ?? 0) & 0x7f) * 0x200000 +
      ((bytes[7] ?? 0) & 0x7f) * 0x4000 +
      ((bytes[8] ?? 0) & 0x7f) * 0x80 +
      ((bytes[9] ?? 0) & 0x7f);
    const footerSize = ((bytes[5] ?? 0) & 0x10) !== 0 ? 10 : 0;
    return 10 + tagSize + footerSize;
  }
  return 0;
}

export function validateMp3Bytes(bytes: Uint8Array): ExportValidation {
  if (bytes.byteLength < 4) return { valid: false, reason: 'The MP3 output is empty or incomplete.' };
  const offset = findMp3FrameOffset(bytes);
  if (offset < 0 || offset + 4 > bytes.length) {
    return { valid: false, reason: 'The MP3 output contains an incomplete ID3 header or frame.' };
  }

  const syncByte = bytes[offset] ?? 0;
  const versionAndLayer = bytes[offset + 1] ?? 0;
  const bitrateAndSampleRate = bytes[offset + 2] ?? 0;
  const hasFrameSync = syncByte === 0xff && (versionAndLayer & 0xe0) === 0xe0;
  const version = (versionAndLayer >> 3) & 0x03;
  const layer = (versionAndLayer >> 1) & 0x03;
  const bitrateIndex = (bitrateAndSampleRate >> 4) & 0x0f;
  const sampleRateIndex = (bitrateAndSampleRate >> 2) & 0x03;

  if (
    !hasFrameSync ||
    version === 0x01 ||
    layer !== 0x01 ||
    bitrateIndex === 0x00 ||
    bitrateIndex === 0x0f ||
    sampleRateIndex === 0x03
  ) {
    return { valid: false, reason: 'The MP3 output does not contain a valid MPEG Layer III frame header.' };
  }

  return { valid: true };
}

export function validateExportBytes(bytes: Uint8Array, format: AudioExportFormat): ExportValidation {
  return format === 'wav' ? validateWavBytes(bytes) : validateMp3Bytes(bytes);
}

export function calculatePeakAmplitude(audio: ExportBufferMetadata): number {
  let peak = 0;
  for (let channel = 0; channel < audio.numberOfChannels; channel += 1) {
    const samples = audio.getChannelData(channel);
    for (let index = 0; index < samples.length; index += 1) {
      peak = Math.max(peak, Math.abs(samples[index] ?? 0));
    }
  }
  return peak;
}

export function createExportFileName(sourceName: string, format: AudioExportFormat): string {
  const withoutExtension = sourceName.replace(/\.[^.]+$/, '');
  const safeBase = withoutExtension
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}._-]+/gu, '-')
    .replace(/^[.-]+|[.-]+$/g, '')
    .slice(0, 80);
  return `${safeBase || 'audio'}-edited.${format}`;
}
