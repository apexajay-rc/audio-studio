import type { AudioEffectsSettings, EqualizerSettings } from './audioTypes';

export const EQUALIZER_BANDS = [
  { key: 'hz80Db', label: '80 Hz', frequency: 80, filterType: 'lowshelf' },
  { key: 'hz250Db', label: '250 Hz', frequency: 250, filterType: 'peaking' },
  { key: 'hz1000Db', label: '1 kHz', frequency: 1000, filterType: 'peaking' },
  { key: 'hz4000Db', label: '4 kHz', frequency: 4000, filterType: 'peaking' },
  { key: 'hz12000Db', label: '12 kHz', frequency: 12000, filterType: 'highshelf' },
] as const satisfies ReadonlyArray<{
  key: keyof EqualizerSettings;
  label: string;
  frequency: number;
  filterType: BiquadFilterType;
}>;

export const DEFAULT_AUDIO_EFFECTS: AudioEffectsSettings = Object.freeze({
  bassGainDb: 0,
  equalizer: Object.freeze({
    hz80Db: 0,
    hz250Db: 0,
    hz1000Db: 0,
    hz4000Db: 0,
    hz12000Db: 0,
  }),
  reverbMix: 0,
  echoMix: 0,
  echoDelayMs: 280,
  echoFeedback: 0.32,
});

export function clampNumber(value: number, minimum: number, maximum: number, fallback = minimum): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, value));
}

export function normalizeAudioEffects(settings: AudioEffectsSettings): AudioEffectsSettings {
  return {
    bassGainDb: clampNumber(settings.bassGainDb, 0, 12),
    equalizer: {
      hz80Db: clampNumber(settings.equalizer.hz80Db, -12, 12, 0),
      hz250Db: clampNumber(settings.equalizer.hz250Db, -12, 12, 0),
      hz1000Db: clampNumber(settings.equalizer.hz1000Db, -12, 12, 0),
      hz4000Db: clampNumber(settings.equalizer.hz4000Db, -12, 12, 0),
      hz12000Db: clampNumber(settings.equalizer.hz12000Db, -12, 12, 0),
    },
    reverbMix: clampNumber(settings.reverbMix, 0, 1),
    echoMix: clampNumber(settings.echoMix, 0, 1),
    echoDelayMs: clampNumber(settings.echoDelayMs, 80, 650),
    echoFeedback: clampNumber(settings.echoFeedback, 0, 0.65),
  };
}

export function areAudioEffectsDefault(settings: AudioEffectsSettings): boolean {
  const normalized = normalizeAudioEffects(settings);
  return (
    normalized.bassGainDb === 0 &&
    Object.values(normalized.equalizer).every((gain) => gain === 0) &&
    normalized.reverbMix === 0 &&
    normalized.echoMix === 0
  );
}


export function calculateEffectsTailSeconds(settings: AudioEffectsSettings): number {
  const normalized = normalizeAudioEffects(settings);
  const reverbTailSeconds = normalized.reverbMix > 0 ? 2.4 : 0;
  if (normalized.echoMix <= 0) return reverbTailSeconds;

  const feedback = Math.max(0.01, normalized.echoFeedback);
  const repeats = Math.max(1, Math.ceil(Math.log(0.01) / Math.log(feedback)));
  const echoTailSeconds = Math.min(7.5, (normalized.echoDelayMs / 1000) * repeats);
  return reverbTailSeconds + echoTailSeconds;
}
