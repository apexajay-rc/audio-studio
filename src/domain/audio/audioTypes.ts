export const MAX_AUDIO_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_EXPORT_DURATION_SECONDS = 30 * 60;

export interface AudioFileLike {
  readonly name: string;
  readonly size: number;
  readonly type: string;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface AudioTrackMetadata {
  readonly name: string;
  readonly durationSeconds: number;
  readonly sampleRate: number;
  readonly channelCount: number;
  readonly fileSizeBytes: number;
}

export interface TrimRange {
  readonly startSeconds: number;
  readonly endSeconds: number;
}

export interface EqualizerSettings {
  readonly hz80Db: number;
  readonly hz250Db: number;
  readonly hz1000Db: number;
  readonly hz4000Db: number;
  readonly hz12000Db: number;
}

export interface AudioEffectsSettings {
  /** Low-shelf bass boost, from 0 to +12 dB. */
  readonly bassGainDb: number;
  /** Five-band graphic EQ, each band from -12 to +12 dB. */
  readonly equalizer: EqualizerSettings;
  /** Wet reverb level, from 0 to 1. */
  readonly reverbMix: number;
  /** Wet echo level, from 0 to 1. */
  readonly echoMix: number;
  /** Echo delay in milliseconds, from 80 to 650 ms. */
  readonly echoDelayMs: number;
  /** Echo feedback, from 0 to 0.65. */
  readonly echoFeedback: number;
}

export interface AudioEditConfiguration {
  readonly trim: TrimRange;
  readonly playbackRate: number;
  readonly preservePitch: boolean;
  readonly effects: AudioEffectsSettings;
}

export interface AudioProject {
  readonly id: string;
  readonly source: AudioTrackMetadata;
  readonly edits: AudioEditConfiguration;
}

export type AudioExportFormat = 'wav' | 'mp3';
export type Mp3BitrateKbps = 128 | 192 | 256 | 320;

export interface AudioRenderRequest {
  readonly range: TrimRange;
  readonly playbackRate: number;
  readonly effects: AudioEffectsSettings;
  /** Optional target rate used for MP3's supported sample-rate set. */
  readonly targetSampleRate?: number;
  /** Optional output channel count. MP3 is rendered as mono or stereo. */
  readonly outputChannels?: number;
}

export interface AudioExportMetadata {
  readonly fileName: string;
  readonly format: AudioExportFormat;
  readonly mimeType: string;
  readonly fileSizeBytes: number;
  readonly durationSeconds: number;
  readonly sampleRate: number;
  readonly channelCount: number;
  readonly peakAmplitude: number;
}

export interface ValidValidationResult {
  readonly valid: true;
}

export interface InvalidValidationResult {
  readonly valid: false;
  readonly reason: string;
}

export type ValidationResult = ValidValidationResult | InvalidValidationResult;
export type AudioValidationResult = ValidationResult;
