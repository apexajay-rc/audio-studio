import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import type { AudioTrackMetadata, TrimRange } from '../domain/audio/audioTypes';
import { formatTime } from '../domain/audio/formatTime';
import { snapTimeToSample } from '../domain/audio/trimRange';
import { BrowserAudioEngine } from '../audio-engine/BrowserAudioEngine';
import type { AudioEnginePort } from '../application/ports/AudioEnginePort';
import { WaveformCanvas } from '../components/WaveformCanvas';

const WAVEFORM_BUCKETS = 1400;

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'An unexpected audio error occurred.';
}

export function App() {
  const engineRef = useRef<AudioEnginePort | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importRequestRef = useRef(0);

  const [track, setTrack] = useState<AudioTrackMetadata | null>(null);
  const [peaks, setPeaks] = useState<Float32Array>(() => new Float32Array());
  const [isLoading, setIsLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackMode, setPlaybackMode] = useState<'track' | 'selection'>('track');
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [trimRange, setTrimRange] = useState<TrimRange>({ startSeconds: 0, endSeconds: 0 });
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
    setIsPlaying(false);
    setTrack(null);
    setPeaks(new Float32Array());
    setCurrentTime(0);
    setTrimRange({ startSeconds: 0, endSeconds: 0 });
    setPlaybackMode('track');

    try {
      const metadata = await engine.loadFile(file);
      const waveformPeaks = engine.getWaveformPeaks(WAVEFORM_BUCKETS);
      if (requestId !== importRequestRef.current) return;
      setTrack(metadata);
      setPeaks(waveformPeaks);
      setTrimRange({ startSeconds: 0, endSeconds: metadata.durationSeconds });
      setPlaybackRate(1);
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
  };

  const handleResetTrim = () => {
    if (!track) return;
    pauseSelectionPreview();
    setTrimRange({ startSeconds: 0, endSeconds: track.durationSeconds });
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
    } catch (rateError) {
      setError(getErrorMessage(rateError));
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
          Preview your audio, change its playback speed, and explore your sound. Start with a
          file from your device.
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
            disabled={isLoading}
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
                <button className="text-button" type="button" onClick={handleResetTrim}>
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
                  disabled={isLoading || selectedDuration <= 0}
                >
                  Preview selection
                </button>
              </div>
            </section>

            <div className="transport-row">
              <button
                className="play-button"
                type="button"
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
        <span>Audio Studio · First engineering milestone</span>
        <span>Local processing · No account required</span>
      </footer>
    </main>
  );
}
