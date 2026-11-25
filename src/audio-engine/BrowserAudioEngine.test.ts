import { afterEach, describe, expect, it, vi } from 'vitest';
import { BrowserAudioEngine } from './BrowserAudioEngine';
import type { AudioFileLike } from '../domain/audio/audioTypes';
import { DEFAULT_AUDIO_EFFECTS } from '../domain/audio/audioEffects';

interface StartCall {
  readonly when: number;
  readonly offset: number;
  readonly duration: number | undefined;
}

class FakeAudioParam {
  value = 0;
  setTargetAtTime(value: number): void {
    this.value = value;
  }
}

class FakeNode {
  connect(): void {}
  disconnect(): void {}
}

class FakeAudioBuffer {
  readonly duration: number;
  readonly sampleRate: number;
  readonly numberOfChannels: number;
  readonly length: number;
  private readonly channels: Float32Array[];

  constructor(numberOfChannels = 1, length = 441000, sampleRate = 44100) {
    this.numberOfChannels = numberOfChannels;
    this.length = length;
    this.sampleRate = sampleRate;
    this.duration = length / sampleRate;
    this.channels = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
  }

  getChannelData(channel: number): Float32Array {
    return this.channels[channel] ?? new Float32Array(this.length);
  }
}

class FakeBufferSource extends FakeNode {
  buffer: AudioBuffer | null = null;
  playbackRate = new FakeAudioParam();
  onended: (() => void) | null = null;
  readonly startCalls: StartCall[] = [];
  stopped = false;

  start(when = 0, offset = 0, duration?: number): void {
    this.startCalls.push({ when, offset, duration });
  }

  stop(): void {
    this.stopped = true;
  }
}

class FakeGainNode extends FakeNode {
  readonly gain = new FakeAudioParam();
}

class FakeBiquadFilter extends FakeNode {
  type: BiquadFilterType = 'lowpass';
  readonly frequency = new FakeAudioParam();
  readonly Q = new FakeAudioParam();
  readonly gain = new FakeAudioParam();
}

class FakeConvolver extends FakeNode {
  buffer: AudioBuffer | null = null;
  normalize = true;
}

class FakeDelay extends FakeNode {
  readonly delayTime = new FakeAudioParam();
}

class FakeDynamicsCompressor extends FakeNode {
  readonly threshold = new FakeAudioParam();
  readonly knee = new FakeAudioParam();
  readonly ratio = new FakeAudioParam();
  readonly attack = new FakeAudioParam();
  readonly release = new FakeAudioParam();
}

class FakeAudioContext {
  static clock = 0;
  static readonly createdSources: FakeBufferSource[] = [];

  state: AudioContextState = 'running';
  readonly sampleRate = 44100;
  readonly destination = new FakeNode() as unknown as AudioDestinationNode;

  get currentTime(): number {
    return FakeAudioContext.clock;
  }

  createGain(): GainNode {
    return new FakeGainNode() as unknown as GainNode;
  }

  createBiquadFilter(): BiquadFilterNode {
    return new FakeBiquadFilter() as unknown as BiquadFilterNode;
  }

  createConvolver(): ConvolverNode {
    return new FakeConvolver() as unknown as ConvolverNode;
  }

  createDelay(): DelayNode {
    return new FakeDelay() as unknown as DelayNode;
  }

  createDynamicsCompressor(): DynamicsCompressorNode {
    return new FakeDynamicsCompressor() as unknown as DynamicsCompressorNode;
  }

  createBuffer(channels: number, length: number, sampleRate: number): AudioBuffer {
    return new FakeAudioBuffer(channels, length, sampleRate) as unknown as AudioBuffer;
  }

  createBufferSource(): AudioBufferSourceNode {
    const source = new FakeBufferSource();
    FakeAudioContext.createdSources.push(source);
    return source as unknown as AudioBufferSourceNode;
  }

  async decodeAudioData(): Promise<AudioBuffer> {
    return new FakeAudioBuffer() as unknown as AudioBuffer;
  }

  async resume(): Promise<void> {}

  async close(): Promise<void> {
    this.state = 'closed';
  }
}

class FakeOfflineAudioContext extends FakeAudioContext {
  static lastInstance: FakeOfflineAudioContext | null = null;
  static lastSource: FakeBufferSource | null = null;
  readonly requestedLength: number;
  readonly requestedChannels: number;

  constructor(channels: number, length: number, sampleRate: number) {
    super();
    this.requestedChannels = channels;
    this.requestedLength = length;
    Object.defineProperty(this, 'sampleRate', { value: sampleRate });
    FakeOfflineAudioContext.lastInstance = this;
  }

  override createBufferSource(): AudioBufferSourceNode {
    const source = new FakeBufferSource();
    FakeOfflineAudioContext.lastSource = source;
    return source as unknown as AudioBufferSourceNode;
  }

  async startRendering(): Promise<AudioBuffer> {
    return new FakeAudioBuffer(
      this.requestedChannels,
      this.requestedLength,
      this.sampleRate,
    ) as unknown as AudioBuffer;
  }
}

function validFile(): AudioFileLike {
  return {
    name: 'test-track.wav',
    size: 100,
    type: 'audio/wav',
    arrayBuffer: async () => new ArrayBuffer(8),
  };
}

describe('BrowserAudioEngine range playback and rendering', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    FakeAudioContext.clock = 0;
    FakeAudioContext.createdSources.length = 0;
    FakeOfflineAudioContext.lastInstance = null;
    FakeOfflineAudioContext.lastSource = null;
  });

  it('starts playback at the selected offset and stops at the selected end', async () => {
    vi.stubGlobal('AudioContext', FakeAudioContext);
    const engine = new BrowserAudioEngine();
    await engine.loadFile(validFile());

    await engine.playRange({ startSeconds: 2, endSeconds: 4 });

    const source = FakeAudioContext.createdSources[0];
    expect(source?.startCalls).toEqual([{ when: 0, offset: 2, duration: 2 }]);
    expect(engine.isPlaying()).toBe(true);

    FakeAudioContext.clock = 1.5;
    expect(engine.getCurrentTime()).toBe(3.5);

    source?.onended?.();
    expect(engine.isPlaying()).toBe(false);
    expect(engine.getCurrentTime()).toBe(4);

    await engine.dispose();
  });

  it('rejects a range outside the decoded track', async () => {
    vi.stubGlobal('AudioContext', FakeAudioContext);
    const engine = new BrowserAudioEngine();
    await engine.loadFile(validFile());

    await expect(engine.playRange({ startSeconds: 8, endSeconds: 12 })).rejects.toThrow(
      'Choose a valid selection inside the audio track.',
    );
    expect(engine.isPlaying()).toBe(false);

    await engine.dispose();
  });

  it('preserves the selected end when playback rate changes', async () => {
    vi.stubGlobal('AudioContext', FakeAudioContext);
    const engine = new BrowserAudioEngine();
    await engine.loadFile(validFile());
    await engine.playRange({ startSeconds: 2, endSeconds: 6 });

    FakeAudioContext.clock = 1;
    engine.setPlaybackRate(0.5);

    const resumedSource = FakeAudioContext.createdSources[1];
    expect(resumedSource?.playbackRate.value).toBe(0.5);
    expect(resumedSource?.startCalls).toEqual([{ when: 0, offset: 3, duration: 3 }]);

    await engine.dispose();
  });

  it('renders the selected range at the requested playback speed', async () => {
    vi.stubGlobal('AudioContext', FakeAudioContext);
    vi.stubGlobal('OfflineAudioContext', FakeOfflineAudioContext);
    const engine = new BrowserAudioEngine();
    await engine.loadFile(validFile());

    const rendered = await engine.renderSelection({
      range: { startSeconds: 2, endSeconds: 4 },
      playbackRate: 0.5,
      effects: DEFAULT_AUDIO_EFFECTS,
      targetSampleRate: 44100,
      outputChannels: 1,
    });

    expect(FakeOfflineAudioContext.lastInstance?.requestedLength).toBe(44100 * 4);
    expect(FakeOfflineAudioContext.lastSource?.playbackRate.value).toBe(0.5);
    expect(FakeOfflineAudioContext.lastSource?.startCalls).toEqual([
      { when: 0, offset: 2, duration: 2 },
    ]);
    expect(rendered.duration).toBe(4);
    await engine.dispose();
  });

  it('adds a render tail when reverb or echo is enabled', async () => {
    vi.stubGlobal('AudioContext', FakeAudioContext);
    vi.stubGlobal('OfflineAudioContext', FakeOfflineAudioContext);
    const engine = new BrowserAudioEngine();
    await engine.loadFile(validFile());

    await engine.renderSelection({
      range: { startSeconds: 2, endSeconds: 4 },
      playbackRate: 1,
      effects: { ...DEFAULT_AUDIO_EFFECTS, reverbMix: 0.5 },
      targetSampleRate: 44100,
      outputChannels: 1,
    });

    // 4.4 * 44,100 is mathematically integral; tolerate FP representation noise.
    expect(FakeOfflineAudioContext.lastInstance?.requestedLength).toBe(194040);
    await engine.dispose();
  });

  it('rounds genuinely fractional render lengths up to the next sample frame', async () => {
    vi.stubGlobal('AudioContext', FakeAudioContext);
    vi.stubGlobal('OfflineAudioContext', FakeOfflineAudioContext);
    const engine = new BrowserAudioEngine();
    await engine.loadFile(validFile());

    await engine.renderSelection({
      range: { startSeconds: 2, endSeconds: 4.00001 },
      playbackRate: 1,
      effects: { ...DEFAULT_AUDIO_EFFECTS, reverbMix: 0.5 },
      targetSampleRate: 44100,
      outputChannels: 1,
    });

    expect(FakeOfflineAudioContext.lastInstance?.requestedLength).toBe(194041);
    await engine.dispose();
  });
});
