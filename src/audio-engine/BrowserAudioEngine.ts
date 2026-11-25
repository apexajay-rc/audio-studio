import type { AudioEnginePort } from '../application/ports/AudioEnginePort';
import type { AudioFileLike, AudioTrackMetadata, TrimRange } from '../domain/audio/audioTypes';
import { validateAudioFile } from '../domain/audio/fileValidation';
import { clampTime, validateTrimRange } from '../domain/audio/trimRange';
import { buildWaveformPeaks } from '../domain/audio/waveform';

const MIN_PLAYBACK_RATE = 0.5;
const MAX_PLAYBACK_RATE = 2;

export class BrowserAudioEngine implements AudioEnginePort {
  private context: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private audioBuffer: AudioBuffer | null = null;
  private sourceNode: AudioBufferSourceNode | null = null;
  private playing = false;
  private startContextTime = 0;
  private startOffset = 0;
  private playbackEnd: number | null = null;
  private playbackRate = 1;
  private disposed = false;
  private loadRequestId = 0;

  async loadFile(file: AudioFileLike): Promise<AudioTrackMetadata> {
    this.assertNotDisposed();
    const requestId = ++this.loadRequestId;
    this.stopSourceNode();
    this.playing = false;
    this.audioBuffer = null;
    this.startOffset = 0;
    this.playbackEnd = null;

    const validation = validateAudioFile(file);
    if (!validation.valid) throw new Error(validation.reason);

    const bytes = await file.arrayBuffer();
    const context = this.getOrCreateContext();

    let decoded: AudioBuffer;
    try {
      decoded = await context.decodeAudioData(bytes);
    } catch {
      throw new Error(
        'The browser could not decode this file. It may be damaged or use an unsupported codec.',
      );
    }

    if (requestId !== this.loadRequestId) {
      throw new Error('This import was superseded by a newer file selection.');
    }

    this.audioBuffer = decoded;
    this.startOffset = 0;
    this.playbackEnd = null;
    this.playbackRate = 1;

    return {
      name: file.name,
      durationSeconds: decoded.duration,
      sampleRate: decoded.sampleRate,
      channelCount: decoded.numberOfChannels,
      fileSizeBytes: file.size,
    };
  }

  getWaveformPeaks(bucketCount: number): Float32Array {
    const buffer = this.requireBuffer();
    const channels: Float32Array[] = [];

    for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
      channels.push(buffer.getChannelData(channel));
    }

    return buildWaveformPeaks(channels, bucketCount);
  }

  async play(): Promise<void> {
    this.assertNotDisposed();
    const context = this.getOrCreateContext();
    const buffer = this.requireBuffer();

    if (this.playing) return;
    this.playbackEnd = null;
    await context.resume();

    if (this.startOffset >= buffer.duration) this.startOffset = 0;
    this.startPlaybackNode();
  }

  async playRange(range: TrimRange): Promise<void> {
    this.assertNotDisposed();
    const buffer = this.requireBuffer();

    if (!validateTrimRange(range, buffer.duration)) {
      throw new RangeError('Choose a valid selection inside the audio track.');
    }

    const context = this.getOrCreateContext();
    this.stopSourceNode();
    this.playing = false;
    this.startOffset = range.startSeconds;
    this.playbackEnd = range.endSeconds;

    await context.resume();
    this.startPlaybackNode();
  }

  pause(): void {
    if (!this.playing) return;

    this.startOffset = this.getCurrentTime();
    this.stopSourceNode();
    this.playing = false;
  }

  seek(timeSeconds: number): void {
    const buffer = this.requireBuffer();
    const nextOffset = clampTime(timeSeconds, buffer.duration);
    const shouldResume = this.playing;

    this.stopSourceNode();
    this.startOffset = nextOffset;
    this.playbackEnd = null;
    this.playing = false;

    if (shouldResume && nextOffset < buffer.duration) {
      this.startPlaybackNode();
    }
  }

  setPlaybackRate(rate: number): void {
    if (!Number.isFinite(rate) || rate < MIN_PLAYBACK_RATE || rate > MAX_PLAYBACK_RATE) {
      throw new RangeError(`Playback rate must be between ${MIN_PLAYBACK_RATE}x and ${MAX_PLAYBACK_RATE}x.`);
    }

    if (rate === this.playbackRate) return;

    const shouldResume = this.playing;
    const playbackEnd = this.playbackEnd;
    if (shouldResume) this.startOffset = this.getCurrentTime();

    this.stopSourceNode();
    this.playbackRate = rate;
    this.playing = false;
    this.playbackEnd = playbackEnd;

    const upperBound = playbackEnd ?? this.requireBuffer().duration;
    if (shouldResume && this.startOffset < upperBound) {
      this.startPlaybackNode();
    }
  }

  getCurrentTime(): number {
    const buffer = this.audioBuffer;
    if (!buffer) return 0;

    const upperBound = this.playbackEnd ?? buffer.duration;
    if (!this.playing || !this.context) {
      return Math.min(clampTime(this.startOffset, buffer.duration), upperBound);
    }

    const elapsed = Math.max(0, this.context.currentTime - this.startContextTime);
    return Math.min(
      clampTime(this.startOffset + elapsed * this.playbackRate, buffer.duration),
      upperBound,
    );
  }

  getDuration(): number {
    return this.audioBuffer?.duration ?? 0;
  }

  isPlaying(): boolean {
    return this.playing;
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    this.loadRequestId += 1;
    this.stopSourceNode();
    this.playing = false;
    this.audioBuffer = null;
    this.playbackEnd = null;

    const context = this.context;
    this.context = null;
    this.masterGain = null;

    if (context && context.state !== 'closed') {
      await context.close();
    }
  }

  private getOrCreateContext(): AudioContext {
    this.assertNotDisposed();

    if (!this.context) {
      const context = new AudioContext();
      const masterGain = context.createGain();
      masterGain.gain.value = 1;
      masterGain.connect(context.destination);
      this.context = context;
      this.masterGain = masterGain;
    }

    return this.context;
  }

  private startPlaybackNode(): void {
    const context = this.getOrCreateContext();
    const buffer = this.requireBuffer();
    const masterGain = this.masterGain;

    if (!masterGain) throw new Error('Audio output is not initialized.');

    const playbackEnd = this.playbackEnd ?? buffer.duration;
    const remainingDuration = playbackEnd - this.startOffset;
    if (remainingDuration <= 0) {
      this.playing = false;
      this.startOffset = playbackEnd;
      this.playbackEnd = null;
      return;
    }

    const source = context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = this.playbackRate;
    source.connect(masterGain);

    this.sourceNode = source;
    this.startContextTime = context.currentTime;
    this.playing = true;

    source.onended = () => {
      if (this.sourceNode !== source) return;
      this.playing = false;
      this.startOffset = playbackEnd;
      this.playbackEnd = null;
      this.sourceNode = null;
      source.disconnect();
    };

    source.start(0, this.startOffset, remainingDuration);
  }

  private stopSourceNode(): void {
    const source = this.sourceNode;
    this.sourceNode = null;

    if (!source) return;
    source.onended = null;
    try {
      source.stop();
    } catch {
      // A source that has already stopped does not need further action.
    }
    source.disconnect();
  }

  private requireBuffer(): AudioBuffer {
    if (!this.audioBuffer) throw new Error('Import an audio file before using playback.');
    return this.audioBuffer;
  }

  private assertNotDisposed(): void {
    if (this.disposed) throw new Error('The audio engine has already been disposed.');
  }
}
