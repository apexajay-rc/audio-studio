import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import type {
  AudioEffectsSettings,
  AudioExportFormat,
  AudioTrackMetadata,
  Mp3BitrateKbps,
  TrimRange,
} from '../domain/audio/audioTypes';
import { DEFAULT_AUDIO_EFFECTS, EQUALIZER_BANDS } from '../domain/audio/audioEffects';
import { formatTime } from '../domain/audio/formatTime';
import { snapTimeToSample } from '../domain/audio/trimRange';
import { BrowserAudioEngine } from '../audio-engine/BrowserAudioEngine';
import type { AudioEnginePort } from '../application/ports/AudioEnginePort';
import { BrowserAudioExporter } from '../audio-engine/export/BrowserAudioExporter';
import { calculatePeakAmplitude, createExportFileName } from '../audio-engine/export/exportValidation';
import { getMp3TargetSampleRate } from '../audio-engine/export/mp3Encoder';
import { WaveformCanvas } from '../components/WaveformCanvas';

const WAVEFORM_BUCKETS = 1400;
const MP3_BITRATES: Mp3BitrateKbps[] = [128, 192, 256, 320];

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'An unexpected audio error occurred.';
}

function downloadBlob(blob: Blob, fileName: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = fileName;
  anchor.style.display = 'none';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
}

function formatDb(value: number): string {
  return `${value > 0 ? '+' : ''}${value.toFixed(1)} dB`;
}

export function App() {
  const engineRef = useRef<AudioEnginePort | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importRequestRef = useRef(0);
  const lastProgressRef = useRef(-1);

  const [track, setTrack] = useState<AudioTrackMetadata | null>(null);
  const [peaks, setPeaks] = useState<Float32Array>(() => new Float32Array());
  const [isLoading, setIsLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackMode, setPlaybackMode] = useState<'track' | 'selection'>('track');
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [trimRange, setTrimRange] = useState<TrimRange>({ startSeconds: 0, endSeconds: 0 });
  const [effects, setEffects] = useState<AudioEffectsSettings>(DEFAULT_AUDIO_EFFECTS);
  const [exportFormat, setExportFormat] = useState<AudioExportFormat>('mp3');
  const [mp3Bitrate, setMp3Bitrate] = useState<Mp3BitrateKbps>(192);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportResult, setExportResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const duration = track?.durationSeconds ?? 0;

  useEffect(() => {
    const engine = new BrowserAudioEngine();
    engineRef.current = engine;

    return () => {
      if (engineRef.current === engine) engineRef.current = null;
      void engine.dispose();
    };
  }, []);

  useEffect(() => {
    engineRef.current?.setEffects(effects);
  }, [effects]);

  useEffect(() => {
    if (!isPlaying) return undefined;

    let frameId = 0;
    const updatePlayhead = () => {
      const engine = engineRef.current;
      if (!engine) return;

      setCurrentTime(engine.getCurrentTime());
      if (engine.isPlaying()) {
        frameId = window.requestAnimationFrame(updatePlayhead);
      } else {
        setIsPlaying(false);
      }
    };

    frameId = window.requestAnimationFrame(updatePlayhead);
    return () => window.cancelAnimationFrame(frameId);
  }, [isPlaying]);

  const handleFileSelection = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    const requestId = ++importRequestRef.current;

    const engine = engineRef.current;
    if (!engine) {
      setError('The audio engine is not ready. Refresh the page and try again.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setExportResult(null);
    setIsPlaying(false);
    setTrack(null);
    setPeaks(new Float32Array());
    setCurrentTime(0);
    setTrimRange({ startSeconds: 0, endSeconds: 0 });
    setPlaybackMode('track');
    setPlaybackRate(1);
    setEffects(DEFAULT_AUDIO_EFFECTS);
    engine.setEffects(DEFAULT_AUDIO_EFFECTS);

    try {
      const metadata = await engine.loadFile(file);
      const waveformPeaks = engine.getWaveformPeaks(WAVEFORM_BUCKETS);
      if (requestId !== importRequestRef.current) return;
      setTrack(metadata);
      setPeaks(waveformPeaks);
      setTrimRange({ startSeconds: 0, endSeconds: metadata.durationSeconds });
    } catch (loadError) {
      if (requestId === importRequestRef.current) setError(getErrorMessage(loadError));
    } finally {
      if (requestId === importRequestRef.current) setIsLoading(false);
    }
  };

  const handlePlayPause = async () => {
    const engine = engineRef.current;
    if (!engine || !track) return;

    try {
      if (engine.isPlaying()) {
        engine.pause();
        setIsPlaying(false);
        setCurrentTime(engine.getCurrentTime());
      } else {
        await engine.play();
        setPlaybackMode('track');
        setIsPlaying(engine.isPlaying());
      }
      setError(null);
    } catch (playError) {
      setError(getErrorMessage(playError));
    }
  };

  const handleSeek = (nextTime: number) => {
    const engine = engineRef.current;
    if (!engine || !track) return;

    engine.seek(nextTime);
    setPlaybackMode('track');
    setCurrentTime(engine.getCurrentTime());
    setIsPlaying(engine.isPlaying());
  };

  const pauseSelectionPreview = () => {
    const engine = engineRef.current;
    if (!engine || playbackMode !== 'selection' || !engine.isPlaying()) return;

    engine.pause();
    setCurrentTime(engine.getCurrentTime());
    setIsPlaying(false);
  };

  const handleTrimStart = (nextTime: number) => {
    if (!track) return;
    pauseSelectionPreview();
    const sampleStep = 1 / track.sampleRate;
    const snappedStart = snapTimeToSample(nextTime, track.sampleRate, duration);
    setTrimRange((current) => ({
      startSeconds: Math.min(Math.max(0, snappedStart), Math.max(0, current.endSeconds - sampleStep)),
      endSeconds: current.endSeconds,
    }));
    setExportResult(null);
  };

  const handleTrimEnd = (nextTime: number) => {
    if (!track) return;
    pauseSelectionPreview();
    const sampleStep = 1 / track.sampleRate;
    const snappedEnd = snapTimeToSample(nextTime, track.sampleRate, duration);
    setTrimRange((current) => ({
      startSeconds: current.startSeconds,
      endSeconds: Math.min(duration, Math.max(snappedEnd, current.startSeconds + sampleStep)),
    }));
    setExportResult(null);
  };

  const handleResetTrim = () => {
    if (!track) return;
    pauseSelectionPreview();
    setTrimRange({ startSeconds: 0, endSeconds: track.durationSeconds });
    setExportResult(null);
  };

  const handlePreviewSelection = async () => {
    const engine = engineRef.current;
    if (!engine || !track) return;

    try {
      await engine.playRange(trimRange);
      setPlaybackMode('selection');
      setCurrentTime(engine.getCurrentTime());
      setIsPlaying(engine.isPlaying());
      setError(null);
    } catch (previewError) {
      setError(getErrorMessage(previewError));
    }
  };

  const handlePlaybackRate = (nextRate: number) => {
    const engine = engineRef.current;
    if (!engine || !track) return;

    try {
      engine.setPlaybackRate(nextRate);
      setPlaybackRate(nextRate);
      setCurrentTime(engine.getCurrentTime());
      setIsPlaying(engine.isPlaying());
      setExportResult(null);
    } catch (rateError) {
      setError(getErrorMessage(rateError));
    }
  };

  const handleEffectsChange = (patch: Partial<AudioEffectsSettings>) => {
    setEffects((current) => ({ ...current, ...patch }));
    setExportResult(null);
  };

  const handleEqualizerChange = (key: keyof AudioEffectsSettings['equalizer'], value: number) => {
    setEffects((current) => ({
      ...current,
      equalizer: { ...current.equalizer, [key]: value },
    }));
    setExportResult(null);
  };

  const handleResetEffects = () => {
    setEffects(DEFAULT_AUDIO_EFFECTS);
    engineRef.current?.setEffects(DEFAULT_AUDIO_EFFECTS);
    setExportResult(null);
  };

  const handleExport = async () => {
    const engine = engineRef.current;
    if (!engine || !track || isExporting) return;

    try {
      if (engine.isPlaying()) engine.pause();
      setIsPlaying(false);
      setCurrentTime(engine.getCurrentTime());
      setIsExporting(true);
      setExportProgress(0.03);
      setExportResult(null);
      setError(null);
      lastProgressRef.current = -1;

      const isMp3 = exportFormat === 'mp3';
      const renderedAudio = await engine.renderSelection({
        range: trimRange,
        playbackRate,
        effects,
        targetSampleRate: isMp3 ? getMp3TargetSampleRate(track.sampleRate) : track.sampleRate,
        outputChannels: isMp3 ? Math.min(track.channelCount, 2) : track.channelCount,
      });
      setExportProgress(0.42);

      const exporter = new BrowserAudioExporter();
      const blob = await exporter.exportAudio(renderedAudio, exportFormat, mp3Bitrate, (progress) => {
        const percent = Math.floor((0.42 + progress * 0.55) * 100);
        if (percent !== lastProgressRef.current) {
          lastProgressRef.current = percent;
          setExportProgress(percent / 100);
        }
      });

      const fileName = createExportFileName(track.name, exportFormat);
      downloadBlob(blob, fileName);
      const peak = calculatePeakAmplitude(renderedAudio);
      setExportResult(
        `${fileName} · ${formatTime(renderedAudio.duration)} · ${(renderedAudio.sampleRate / 1000).toFixed(1)} kHz · ${renderedAudio.numberOfChannels} ch · ${(blob.size / 1024).toFixed(0)} KB · peak ${(peak * 100).toFixed(0)}%`,
      );
      setExportProgress(1);
    } catch (exportError) {
      setError(getErrorMessage(exportError));
    } finally {
      setIsExporting(false);
    }
  };

  const progress = duration > 0 ? currentTime / duration : 0;
  const selectionStart = duration > 0 ? trimRange.startSeconds / duration : 0;
  const selectionEnd = duration > 0 ? trimRange.endSeconds / duration : 1;
  const selectedDuration = Math.max(0, trimRange.endSeconds - trimRange.startSeconds);

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Audio Studio home">
          <span className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
          </span>
          <span>audio<span className="brand-light">studio</span></span>
        </a>
        <span className="privacy-note">
          <span className="privacy-dot" /> Audio stays in this browser
        </span>
      </header>

      <section className="hero" id="top">
        <p className="eyebrow">YOUR SOUND, YOUR WAY</p>
        <h1>Make the song <span>yours.</span></h1>
        <p className="hero-copy">
          Trim your audio, shape its sound with effects, and export a finished track. Your files
          stay on this device.
        </p>

        <div className="import-card">
          <div className="import-icon" aria-hidden="true">♫</div>
          <div className="import-copy">
            <strong>{track ? 'Replace your audio' : 'Bring in your audio'}</strong>
            <span>MP3 or WAV · Up to 20 MB · Processed locally</span>
          </div>
          <button
            className="button button-primary"
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading || isExporting}
          >
            {isLoading ? 'Loading…' : track ? 'Choose another file' : 'Choose audio'}
          </button>
          <input
            ref={fileInputRef}
            className="visually-hidden"
            type="file"
            accept=".mp3,.wav,audio/mpeg,audio/wav,audio/x-wav"
            onChange={handleFileSelection}
          />
        </div>

        {error && (
          <div className="error-message" role="alert">
            <span aria-hidden="true">!</span> {error}
          </div>
        )}
      </section>

      <section className={`editor-card ${track ? 'editor-card-ready' : ''}`} aria-label="Audio editor">
        <div className="editor-heading">
          <div>
            <p className="section-kicker">WORKSPACE</p>
            <h2>{track ? 'Your audio' : 'Your workspace'}</h2>
          </div>
          <span className={`status-pill ${track ? 'status-ready' : ''}`}>
            <span /> {track ? 'Audio loaded' : 'Waiting for audio'}
          </span>
        </div>

        {track ? (
          <>
            <div className="track-heading">
              <div className="track-art" aria-hidden="true">♫</div>
              <div className="track-details">
                <strong title={track.name}>{track.name}</strong>
                <span>
                  {track.channelCount === 1 ? 'Mono' : `${track.channelCount}-channel`}
                  {' · '}{(track.sampleRate / 1000).toFixed(1)} kHz
                  {' · '}{(track.fileSizeBytes / (1024 * 1024)).toFixed(1)} MB
                </span>
              </div>
              <span className="duration-chip">{formatTime(duration)}</span>
            </div>

            <div className="waveform-area">
              <div className="waveform-time-labels">
                <span>0:00</span>
                <span>{formatTime(duration)}</span>
              </div>
              <WaveformCanvas
                peaks={peaks}
                progress={progress}
                selectionStart={selectionStart}
                selectionEnd={selectionEnd}
                onSeek={(ratio) => handleSeek(ratio * duration)}
              />
              <label className="visually-hidden" htmlFor="seek-slider">Seek through audio</label>
              <input
                id="seek-slider"
                className="seek-slider"
                type="range"
                min={0}
                max={duration || 1}
                step={0.01}
                value={Math.min(currentTime, duration || 0)}
                disabled={isExporting}
                onChange={(event) => handleSeek(Number(event.currentTarget.value))}
              />
              <div className="playback-time">
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>

            <section className="trim-panel" aria-label="Trim selection">
              <div className="trim-panel-heading">
                <div>
                  <p className="section-kicker">TRIM RANGE</p>
                  <h3>Choose the part to keep</h3>
                </div>
                <button className="text-button" type="button" onClick={handleResetTrim} disabled={isExporting}>
                  Reset range
                </button>
              </div>
              <p className="trim-description">
                Adjust the start and end points. The highlighted section is your selection; the
                original audio remains unchanged.
              </p>
              <div className="trim-controls">
                <label className="trim-control">
                  <span>Start <strong>{formatTime(trimRange.startSeconds)}</strong></span>
                  <input
                    className="trim-slider"
                    type="range"
                    min={0}
                    max={duration}
                    step={0.01}
                    value={trimRange.startSeconds}
                    disabled={isExporting}
                    onChange={(event) => handleTrimStart(Number(event.currentTarget.value))}
                    aria-label="Selection start time"
                  />
                </label>
                <label className="trim-control">
                  <span>End <strong>{formatTime(trimRange.endSeconds)}</strong></span>
                  <input
                    className="trim-slider"
                    type="range"
                    min={0}
                    max={duration}
                    step={0.01}
                    value={trimRange.endSeconds}
                    disabled={isExporting}
                    onChange={(event) => handleTrimEnd(Number(event.currentTarget.value))}
                    aria-label="Selection end time"
                  />
                </label>
              </div>
              <div className="trim-footer">
                <span>Selected duration: <strong>{formatTime(selectedDuration)}</strong></span>
                <button
                  className="button button-secondary"
                  type="button"
                  onClick={handlePreviewSelection}
                  disabled={isLoading || isExporting || selectedDuration <= 0}
                >
                  Preview selection
                </button>
              </div>
            </section>

            <div className="transport-row">
              <button
                className="play-button"
                type="button"
                disabled={isExporting}
                onClick={handlePlayPause}
                aria-label={isPlaying ? 'Pause audio' : 'Play audio'}
              >
                {isPlaying ? 'Ⅱ' : '▶'}
              </button>
              <div className="transport-label">
                <strong>{isPlaying ? (playbackMode === 'selection' ? 'Previewing selection' : 'Now playing') : 'Ready to preview'}</strong>
                <span>{playbackMode === 'selection' ? 'Selected region' : 'Full-track playback'}</span>
              </div>
              <label className="speed-control">
                <span>Speed</span>
                <select
                  value={playbackRate}
                  disabled={isExporting}
                  onChange={(event) => handlePlaybackRate(Number(event.currentTarget.value))}
                >
                  <option value={0.5}>0.5×</option>
                  <option value={0.75}>0.75×</option>
                  <option value={1}>1×</option>
                  <option value={1.25}>1.25×</option>
                  <option value={1.5}>1.5×</option>
                  <option value={2}>2×</option>
                </select>
              </label>
            </div>

            <section className="effects-panel" aria-label="Audio effects">
              <div className="effects-heading">
                <div>
                  <p className="section-kicker">SOUND DESIGN</p>
                  <h3>Shape your sound</h3>
                  <p className="effects-description">Effects update the preview immediately and are included in your export.</p>
                </div>
                <button className="text-button" type="button" onClick={handleResetEffects} disabled={isExporting}>
                  Reset effects
                </button>
              </div>

              <div className="effect-section">
                <div className="effect-section-title">
                  <strong>Bass boost</strong>
                  <span>{formatDb(effects.bassGainDb)}</span>
                </div>
                <input
                  className="effect-slider"
                  type="range"
                  min={0}
                  max={12}
                  step={0.5}
                  value={effects.bassGainDb}
                  onChange={(event) => handleEffectsChange({ bassGainDb: Number(event.currentTarget.value) })}
                  disabled={isExporting}
                  aria-label="Bass boost in decibels"
                />
                <div className="range-endpoints"><span>Neutral</span><span>+12 dB</span></div>
              </div>

              <div className="effect-section">
                <div className="effect-section-title">
                  <strong>5-band equalizer</strong>
                  <span>−12 to +12 dB</span>
                </div>
                <div className="equalizer-grid">
                  {EQUALIZER_BANDS.map((band) => (
                    <label className="equalizer-control" key={band.key}>
                      <span>{band.label}</span>
                      <strong>{formatDb(effects.equalizer[band.key])}</strong>
                      <input
                        className="effect-slider"
                        type="range"
                        min={-12}
                        max={12}
                        step={0.5}
                        value={effects.equalizer[band.key]}
                        onChange={(event) => handleEqualizerChange(band.key, Number(event.currentTarget.value))}
                        disabled={isExporting}
                        aria-label={`Equalizer ${band.label}`}
                      />
                    </label>
                  ))}
                </div>
              </div>

              <div className="effects-two-column">
                <div className="effect-section">
                  <div className="effect-section-title">
                    <strong>Reverb</strong>
                    <span>{Math.round(effects.reverbMix * 100)}%</span>
                  </div>
                  <input
                    className="effect-slider"
                    type="range"
                    min={0}
                    max={100}
                    value={Math.round(effects.reverbMix * 100)}
                    onChange={(event) => handleEffectsChange({ reverbMix: Number(event.currentTarget.value) / 100 })}
                    disabled={isExporting}
                    aria-label="Reverb mix"
                  />
                  <div className="range-endpoints"><span>Off</span><span>Ambient</span></div>
                </div>
                <div className="effect-section">
                  <div className="effect-section-title">
                    <strong>Echo</strong>
                    <span>{Math.round(effects.echoMix * 100)}%</span>
                  </div>
                  <input
                    className="effect-slider"
                    type="range"
                    min={0}
                    max={100}
                    value={Math.round(effects.echoMix * 100)}
                    onChange={(event) => handleEffectsChange({ echoMix: Number(event.currentTarget.value) / 100 })}
                    disabled={isExporting}
                    aria-label="Echo mix"
                  />
                  <div className="range-endpoints"><span>Off</span><span>Strong</span></div>
                </div>
              </div>

              <div className="effects-two-column effect-advanced-row">
                <label className="effect-select-control">
                  <span>Echo delay</span>
                  <strong>{effects.echoDelayMs} ms</strong>
                  <input
                    className="effect-slider"
                    type="range"
                    min={80}
                    max={650}
                    step={10}
                    value={effects.echoDelayMs}
                    onChange={(event) => handleEffectsChange({ echoDelayMs: Number(event.currentTarget.value) })}
                    disabled={isExporting}
                    aria-label="Echo delay in milliseconds"
                  />
                </label>
                <label className="effect-select-control">
                  <span>Echo feedback</span>
                  <strong>{Math.round(effects.echoFeedback * 100)}%</strong>
                  <input
                    className="effect-slider"
                    type="range"
                    min={0}
                    max={65}
                    value={Math.round(effects.echoFeedback * 100)}
                    onChange={(event) => handleEffectsChange({ echoFeedback: Number(event.currentTarget.value) / 100 })}
                    disabled={isExporting}
                    aria-label="Echo feedback"
                  />
                </label>
              </div>
            </section>

            <section className="export-panel" aria-label="Audio export">
              <div className="effects-heading">
                <div>
                  <p className="section-kicker">FINISHING</p>
                  <h3>Export your audio</h3>
                  <p className="effects-description">Only the selected region is rendered. Speed and effects are baked into the file.</p>
                </div>
              </div>
              <div className="export-controls">
                <label className="export-field">
                  <span>Format</span>
                  <select
                    value={exportFormat}
                    onChange={(event) => {
                      setExportFormat(event.currentTarget.value as AudioExportFormat);
                      setExportResult(null);
                    }}
                    disabled={isExporting}
                  >
                    <option value="mp3">MP3</option>
                    <option value="wav">WAV · 16-bit PCM</option>
                  </select>
                </label>
                {exportFormat === 'mp3' && (
                  <label className="export-field">
                    <span>MP3 bitrate</span>
                    <select
                      value={mp3Bitrate}
                      onChange={(event) => setMp3Bitrate(Number(event.currentTarget.value) as Mp3BitrateKbps)}
                      disabled={isExporting}
                    >
                      {MP3_BITRATES.map((bitrate) => (
                        <option key={bitrate} value={bitrate}>{bitrate} kbps</option>
                      ))}
                    </select>
                  </label>
                )}
                <button
                  className="button button-primary export-button"
                  type="button"
                  onClick={handleExport}
                  disabled={isExporting || isLoading || selectedDuration <= 0}
                >
                  {isExporting ? `Rendering ${Math.round(exportProgress * 100)}%` : 'Render & download'}
                </button>
              </div>
              {isExporting && (
                <div className="export-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(exportProgress * 100)}>
                  <div style={{ width: `${Math.round(exportProgress * 100)}%` }} />
                </div>
              )}
              {exportResult && <p className="export-result" role="status">Downloaded: {exportResult}</p>}
              <p className="export-footnote">MP3 encoding runs in a background worker. WAV uses 16-bit PCM. Reverb and echo tails are included when enabled.</p>
            </section>
          </>
        ) : (
          <div className="empty-workspace">
            <div className="empty-wave" aria-hidden="true">
              {Array.from({ length: 42 }, (_, index) => (
                <span key={index} style={{ height: `${12 + ((index * 17) % 43)}px` }} />
              ))}
            </div>
            <strong>Your waveform will appear here</strong>
            <span>Choose an MP3 or WAV file to begin editing.</span>
          </div>
        )}
      </section>

      <footer className="footer">
        <span>Audio Studio · Export and effects milestones</span>
        <span>Local processing · No account required</span>
      </footer>
    </main>
  );
}
