import type { AudioExporterPort } from '../../application/ports/AudioExporterPort';
import type { AudioExportFormat, Mp3BitrateKbps } from '../../domain/audio/audioTypes';
import {
  validateExportBytes,
  validateRenderedAudio,
} from './exportValidation';
import { encodePcmWav } from './wavEncoder';
import { encodeMp3InWorker } from './mp3Encoder';

export class BrowserAudioExporter implements AudioExporterPort {
  async exportAudio(
    audio: AudioBuffer,
    format: AudioExportFormat,
    bitrateKbps: Mp3BitrateKbps = 192,
    onProgress?: (progress: number) => void,
  ): Promise<Blob> {
    const renderedValidation = validateRenderedAudio(audio);
    if (!renderedValidation.valid) throw new Error(renderedValidation.reason);

    onProgress?.(0.05);
    let blob: Blob;

    if (format === 'wav') {
      const bytes = encodePcmWav(audio);
      onProgress?.(0.9);
      const validation = validateExportBytes(bytes, 'wav');
      if (!validation.valid) throw new Error(validation.reason);
      blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'audio/wav' });
    } else {
      if (audio.numberOfChannels > 2) {
        throw new Error('MP3 export requires mono or stereo audio.');
      }
      blob = await encodeMp3InWorker(audio, bitrateKbps, (progress) => {
        onProgress?.(0.05 + progress * 0.9);
      });
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const validation = validateExportBytes(bytes, 'mp3');
      if (!validation.valid) throw new Error(validation.reason);
    }

    if (blob.size === 0) throw new Error('The encoder produced an empty audio file.');
    onProgress?.(1);
    return blob;
  }
}
