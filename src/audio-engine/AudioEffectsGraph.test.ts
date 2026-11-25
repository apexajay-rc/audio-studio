import { describe, expect, it } from 'vitest';
import { createAudioEffectsGraph } from './AudioEffectsGraph';
import { DEFAULT_AUDIO_EFFECTS } from '../domain/audio/audioEffects';

class FakeAudioParam {
  value = 0;
  setTargetAtTime(value: number): void {
    this.value = value;
  }
}

class FakeNode {
  disconnected = false;
  connect(): void {}
  disconnect(): void {
    this.disconnected = true;
  }
}

class FakeFilter extends FakeNode {
  type: BiquadFilterType = 'lowpass';
  readonly frequency = new FakeAudioParam();
  readonly Q = new FakeAudioParam();
  readonly gain = new FakeAudioParam();
}

class FakeGain extends FakeNode {
  readonly gain = new FakeAudioParam();
}

class FakeConvolver extends FakeNode {
  buffer: AudioBuffer | null = null;
  normalize = true;
}

class FakeDelay extends FakeNode {
  readonly delayTime = new FakeAudioParam();
}

class FakeCompressor extends FakeNode {
  readonly threshold = new FakeAudioParam();
  readonly knee = new FakeAudioParam();
  readonly ratio = new FakeAudioParam();
  readonly attack = new FakeAudioParam();
  readonly release = new FakeAudioParam();
}

class FakeImpulseBuffer {
  readonly numberOfChannels: number;
  readonly length: number;
  private readonly channels: Float32Array[];

  constructor(channels: number, length: number) {
    this.numberOfChannels = channels;
    this.length = length;
    this.channels = Array.from({ length: channels }, () => new Float32Array(length));
  }

  getChannelData(channel: number): Float32Array {
    return this.channels[channel] ?? new Float32Array(this.length);
  }
}

class FakeContext {
  readonly currentTime = 0;
  readonly sampleRate = 8000;
  readonly filters: FakeFilter[] = [];
  readonly gains: FakeGain[] = [];
  readonly delays: FakeDelay[] = [];
  readonly convolvers: FakeConvolver[] = [];
  readonly compressors: FakeCompressor[] = [];

  createGain(): GainNode {
    const node = new FakeGain();
    this.gains.push(node);
    return node as unknown as GainNode;
  }

  createBiquadFilter(): BiquadFilterNode {
    const node = new FakeFilter();
    this.filters.push(node);
    return node as unknown as BiquadFilterNode;
  }

  createConvolver(): ConvolverNode {
    const node = new FakeConvolver();
    this.convolvers.push(node);
    return node as unknown as ConvolverNode;
  }

  createDelay(): DelayNode {
    const node = new FakeDelay();
    this.delays.push(node);
    return node as unknown as DelayNode;
  }

  createDynamicsCompressor(): DynamicsCompressorNode {
    const node = new FakeCompressor();
    this.compressors.push(node);
    return node as unknown as DynamicsCompressorNode;
  }

  createBuffer(channels: number, length: number): AudioBuffer {
    return new FakeImpulseBuffer(channels, length) as unknown as AudioBuffer;
  }
}

describe('shared audio effects graph', () => {
  it('constructs a bass, five-band EQ, convolution reverb, and feedback echo graph', () => {
    const context = new FakeContext();
    const graph = createAudioEffectsGraph(
      context as unknown as BaseAudioContext,
      new FakeNode() as unknown as AudioNode,
      DEFAULT_AUDIO_EFFECTS,
    );

    expect(context.filters).toHaveLength(7);
    expect(context.convolvers).toHaveLength(1);
    expect(context.delays).toHaveLength(1);
    expect(context.compressors).toHaveLength(1);
    expect(context.convolvers[0]?.normalize).toBe(false);
    expect(context.convolvers[0]?.buffer).not.toBeNull();
    expect(context.delays[0]?.delayTime.value).toBe(0.28);

    graph.dispose();
    expect(context.filters.every((node) => node.disconnected)).toBe(true);
    expect(context.delays[0]?.disconnected).toBe(true);
  });

  it('updates effect parameters and clamps unsafe feedback settings', () => {
    const context = new FakeContext();
    const graph = createAudioEffectsGraph(
      context as unknown as BaseAudioContext,
      new FakeNode() as unknown as AudioNode,
      DEFAULT_AUDIO_EFFECTS,
    );

    graph.update({
      bassGainDb: 7,
      equalizer: {
        hz80Db: 2,
        hz250Db: -3,
        hz1000Db: 4,
        hz4000Db: 5,
        hz12000Db: -2,
      },
      reverbMix: 0.5,
      echoMix: 0.75,
      echoDelayMs: 420,
      echoFeedback: 0.9,
    }, false);

    expect(context.filters[0]?.gain.value).toBe(7);
    expect(context.filters[1]?.gain.value).toBe(2);
    expect(context.filters[2]?.gain.value).toBe(-3);
    // Gain-node creation order: input, dry, reverb, echo, feedback, output.
    expect(context.gains[1]?.gain.value).toBe(1);
    expect(context.gains[2]?.gain.value).toBeCloseTo(0.36);
    expect(context.gains[3]?.gain.value).toBeCloseTo(0.51);
    expect(context.delays[0]?.delayTime.value).toBe(0.42);
    expect(context.gains[4]?.gain.value).toBe(0.65);

    graph.dispose();
  });
});
