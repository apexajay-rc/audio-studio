import {
  EQUALIZER_BANDS,
  normalizeAudioEffects,
} from '../domain/audio/audioEffects';
import type { AudioEffectsSettings, EqualizerSettings } from '../domain/audio/audioTypes';

export interface AudioEffectsGraph {
  readonly input: GainNode;
  update(settings: AudioEffectsSettings, smooth?: boolean): void;
  dispose(): void;
}

interface EqualizerNode {
  readonly key: keyof EqualizerSettings;
  readonly node: BiquadFilterNode;
}

function setParameter(
  parameter: AudioParam,
  value: number,
  context: BaseAudioContext,
  smooth: boolean,
): void {
  if (smooth) {
    parameter.setTargetAtTime(value, context.currentTime, 0.025);
  } else {
    parameter.value = value;
  }
}

function createReverbImpulse(context: BaseAudioContext): AudioBuffer {
  const sampleRate = context.sampleRate;
  const impulseSeconds = 2.4;
  const frameCount = Math.max(1, Math.floor(sampleRate * impulseSeconds));
  const impulse = context.createBuffer(2, frameCount, sampleRate);
  let seed = 0x6d2b79f5;

  const randomSigned = (): number => {
    seed = (Math.imul(seed ^ (seed >>> 15), seed | 1) + 0x6d2b79f5) | 0;
    seed ^= seed + Math.imul(seed ^ (seed >>> 7), seed | 61);
    const unsigned = (seed ^ (seed >>> 14)) >>> 0;
    return (unsigned / 0xffffffff) * 2 - 1;
  };

  for (let channel = 0; channel < impulse.numberOfChannels; channel += 1) {
    const samples = impulse.getChannelData(channel);
    for (let frame = 0; frame < frameCount; frame += 1) {
      const progress = frame / frameCount;
      const decay = Math.pow(1 - progress, 3.8);
      const earlyReflection = frame < sampleRate * 0.035 ? 1.35 : 1;
      samples[frame] = randomSigned() * decay * earlyReflection * 0.32;
    }
  }

  return impulse;
}

export function createAudioEffectsGraph(
  context: BaseAudioContext,
  destination: AudioNode,
  initialSettings: AudioEffectsSettings,
): AudioEffectsGraph {
  const input = context.createGain();
  const bass = context.createBiquadFilter();
  bass.type = 'lowshelf';
  bass.frequency.value = 90;
  bass.gain.value = 0;
  input.connect(bass);

  const equalizerNodes: EqualizerNode[] = [];
  let previousNode: AudioNode = bass;

  for (const band of EQUALIZER_BANDS) {
    const filter = context.createBiquadFilter();
    filter.type = band.filterType;
    filter.frequency.value = band.frequency;
    filter.Q.value = band.filterType === 'peaking' ? 0.9 : 0.707;
    filter.gain.value = 0;
    previousNode.connect(filter);
    previousNode = filter;
    equalizerNodes.push({ key: band.key, node: filter });
  }

  const compressor = context.createDynamicsCompressor();
  compressor.threshold.value = -3;
  compressor.knee.value = 6;
  compressor.ratio.value = 8;
  compressor.attack.value = 0.003;
  compressor.release.value = 0.22;

  const dryGain = context.createGain();
  dryGain.gain.value = 1;
  previousNode.connect(dryGain);
  dryGain.connect(compressor);

  const convolver = context.createConvolver();
  convolver.normalize = false;
  convolver.buffer = createReverbImpulse(context);
  const reverbGain = context.createGain();
  previousNode.connect(convolver);
  convolver.connect(reverbGain);
  reverbGain.connect(compressor);

  const delay = context.createDelay(1);
  const echoGain = context.createGain();
  const feedbackFilter = context.createBiquadFilter();
  feedbackFilter.type = 'lowpass';
  feedbackFilter.frequency.value = 5200;
  feedbackFilter.Q.value = 0.7;
  const feedbackGain = context.createGain();

  previousNode.connect(delay);
  delay.connect(echoGain);
  echoGain.connect(compressor);
  delay.connect(feedbackFilter);
  feedbackFilter.connect(feedbackGain);
  feedbackGain.connect(delay);

  const output = context.createGain();
  output.gain.value = 1;
  compressor.connect(output);
  output.connect(destination);

  const update = (rawSettings: AudioEffectsSettings, smooth = true): void => {
    const settings = normalizeAudioEffects(rawSettings);
    setParameter(bass.gain, settings.bassGainDb, context, smooth);

    for (const equalizer of equalizerNodes) {
      setParameter(
        equalizer.node.gain,
        settings.equalizer[equalizer.key],
        context,
        smooth,
      );
    }

    setParameter(reverbGain.gain, settings.reverbMix * 0.72, context, smooth);
    setParameter(echoGain.gain, settings.echoMix * 0.68, context, smooth);
    setParameter(delay.delayTime, settings.echoDelayMs / 1000, context, smooth);
    setParameter(feedbackGain.gain, settings.echoFeedback, context, smooth);
  };

  update(initialSettings, false);

  return {
    input,
    update,
    dispose: () => {
      const nodes: AudioNode[] = [
        input,
        bass,
        ...equalizerNodes.map((entry) => entry.node),
        dryGain,
        convolver,
        reverbGain,
        delay,
        echoGain,
        feedbackFilter,
        feedbackGain,
        compressor,
        output,
      ];
      for (const node of nodes) {
        try {
          node.disconnect();
        } catch {
          // Disconnection is best-effort during disposal.
        }
      }
    },
  };
}
