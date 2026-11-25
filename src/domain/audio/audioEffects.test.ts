import { describe, expect, it } from 'vitest';
import {
  areAudioEffectsDefault,
  calculateEffectsTailSeconds,
  DEFAULT_AUDIO_EFFECTS,
  normalizeAudioEffects,
} from './audioEffects';

describe('audio effect configuration', () => {
  it('provides a neutral configuration by default', () => {
    expect(areAudioEffectsDefault(DEFAULT_AUDIO_EFFECTS)).toBe(true);
    expect(DEFAULT_AUDIO_EFFECTS.bassGainDb).toBe(0);
    expect(DEFAULT_AUDIO_EFFECTS.reverbMix).toBe(0);
    expect(DEFAULT_AUDIO_EFFECTS.echoMix).toBe(0);
  });

  it('clamps effect values to safe supported ranges', () => {
    const normalized = normalizeAudioEffects({
      bassGainDb: 18,
      equalizer: {
        hz80Db: -20,
        hz250Db: -4,
        hz1000Db: 0,
        hz4000Db: 8,
        hz12000Db: 20,
      },
      reverbMix: 1.5,
      echoMix: -1,
      echoDelayMs: 900,
      echoFeedback: 0.9,
    });

    expect(normalized).toEqual({
      bassGainDb: 12,
      equalizer: {
        hz80Db: -12,
        hz250Db: -4,
        hz1000Db: 0,
        hz4000Db: 8,
        hz12000Db: 12,
      },
      reverbMix: 1,
      echoMix: 0,
      echoDelayMs: 650,
      echoFeedback: 0.65,
    });
  });

  it('calculates a bounded tail for reverb and echo', () => {
    expect(calculateEffectsTailSeconds({ ...DEFAULT_AUDIO_EFFECTS, reverbMix: 0.5 })).toBe(2.4);
    expect(calculateEffectsTailSeconds({ ...DEFAULT_AUDIO_EFFECTS, echoMix: 0.5 })).toBeGreaterThan(0.28);
    expect(calculateEffectsTailSeconds({ ...DEFAULT_AUDIO_EFFECTS, echoMix: 0.5, echoDelayMs: 650, echoFeedback: 0.65 })).toBeLessThanOrEqual(7.5);
  });

  it('replaces non-finite values with safe lower bounds', () => {
    const normalized = normalizeAudioEffects({
      ...DEFAULT_AUDIO_EFFECTS,
      bassGainDb: Number.NaN,
      equalizer: { ...DEFAULT_AUDIO_EFFECTS.equalizer, hz1000Db: Number.POSITIVE_INFINITY },
      reverbMix: Number.NaN,
    });

    expect(normalized.bassGainDb).toBe(0);
    expect(normalized.equalizer.hz1000Db).toBe(0);
    expect(normalized.reverbMix).toBe(0);
  });
});
