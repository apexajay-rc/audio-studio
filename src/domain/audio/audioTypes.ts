export const MAX_AUDIO_FILE_BYTES = 20 * 1024 * 1024;

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

export interface AudioEditConfiguration {
  readonly trim: TrimRange;
  readonly playbackRate: number;
  readonly preservePitch: boolean;
  readonly bassGainDb: number;
  readonly reverbMix: number;
  readonly echoMix: number;
}

export interface AudioProject {
  readonly id: string;
  readonly source: AudioTrackMetadata;
  readonly edits: AudioEditConfiguration;
}

export type ValidationResult =
  | { readonly valid: true }
  | { readonly valid: false; readonly reason: string };
