import { MAX_AUDIO_FILE_BYTES, type AudioFileLike, type ValidationResult } from './audioTypes';

const SUPPORTED_EXTENSIONS = new Set(['.mp3', '.wav']);
const SUPPORTED_MIME_TYPES = new Set([
  'audio/mpeg',
  'audio/mp3',
  'audio/x-mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
  'audio/vnd.wave',
  'application/octet-stream',
]);

export function validateAudioFile(file: AudioFileLike): ValidationResult {
  if (!Number.isFinite(file.size) || file.size <= 0) {
    return { valid: false, reason: 'The selected file is empty or has an invalid size.' };
  }

  if (file.size > MAX_AUDIO_FILE_BYTES) {
    return {
      valid: false,
      reason: 'This first version supports files up to 20 MB.',
    };
  }

  const extension = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
  if (!SUPPORTED_EXTENSIONS.has(extension)) {
    return { valid: false, reason: 'Choose an MP3 or WAV file.' };
  }

  const mimeType = file.type.trim().toLowerCase();
  if (mimeType.length > 0 && !SUPPORTED_MIME_TYPES.has(mimeType)) {
    return {
      valid: false,
      reason: 'The file type does not match the supported MP3/WAV formats.',
    };
  }

  return { valid: true };
}
