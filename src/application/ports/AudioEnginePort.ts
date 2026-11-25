import type {
  AudioEffectsSettings,
  AudioFileLike,
  AudioRenderRequest,
  AudioTrackMetadata,
  TrimRange,
} from '../../domain/audio/audioTypes';

export interface AudioEnginePort {
  loadFile(file: AudioFileLike): Promise<AudioTrackMetadata>;
  getWaveformPeaks(bucketCount: number): Float32Array;
  play(): Promise<void>;
  playRange(range: TrimRange): Promise<void>;
  pause(): void;
  seek(timeSeconds: number): void;
  setPlaybackRate(rate: number): void;
  setEffects(settings: AudioEffectsSettings): void;
  renderSelection(request: AudioRenderRequest): Promise<AudioBuffer>;
  getCurrentTime(): number;
  getDuration(): number;
  isPlaying(): boolean;
  dispose(): Promise<void>;
}
