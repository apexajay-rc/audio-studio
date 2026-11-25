import { afterEach, describe, expect, it, vi } from 'vitest';
import { BrowserAudioEngine } from './BrowserAudioEngine';
import type { AudioFileLike } from '../domain/audio/audioTypes';

interface StartCall {
  readonly when: number;
  readonly offset: number;
  readonly duration: number | undefined;
}

class FakeAudioBuffer {
  readonly duration = 10;
  readonly sampleRate = 10;
  readonly numberOfChannels = 1;
  readonly length = 100;

  getChannelData(): Float32Array {
    return new Float32Array(this.length);
  }
}

class FakeBufferSource {
  buffer: AudioBuffer | null = null;
  playbackRate = { value: 1 };
  onended: (() => void) | null = null;
  readonly startCalls: StartCall[] = [];
  stopped = false;
  disconnected = false;

  connect(): void {}

  disconnect(): void {
    this.disconnected = true;
  }

  start(when = 0, offset = 0, duration?: number): void {
    this.startCalls.push({ when, offset, duration });
  }

  stop(): void {
    this.stopped = true;
  }
}

class FakeGainNode {
  readonly gain = { value: 1 };

  connect(): void {}
}

class FakeAudioContext {
  static clock = 0;
  static readonly createdSources: FakeBufferSource[] = [];

  state: AudioContextState = 'running';
  readonly destination = {} as AudioDestinationNode;

  get currentTime(): number {
    return FakeAudioContext.clock;
  }

  createGain(): GainNode {
    return new FakeGainNode() as unknown as GainNode;
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

function validFile(): AudioFileLike {
  return {
    name: 'test-track.wav',
    size: 100,
    type: 'audio/wav',
    arrayBuffer: async () => new ArrayBuffer(8),
  };
}

describe('BrowserAudioEngine range playback', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    FakeAudioContext.clock = 0;
    FakeAudioContext.createdSources.length = 0;
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
});
