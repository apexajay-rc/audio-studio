import type { AudioExportFormat, Mp3BitrateKbps } from '../../domain/audio/audioTypes';

export interface AudioExporterPort {
  exportAudio(
    audio: AudioBuffer,
    format: AudioExportFormat,
    bitrateKbps?: Mp3BitrateKbps,
    onProgress?: (progress: number) => void,
  ): Promise<Blob>;
}
