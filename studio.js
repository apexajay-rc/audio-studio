'use strict';

const $ = (id) => document.getElementById(id);
let streamId = null;
let sourceTabId = null;
let sourceTitle = 'Current browser tab';
let sourceHost = '';
let ownStudioTabId = null;

const ui = {
  title: $('source-title'), host: $('source-host'), capturePill: $('capture-pill'),
  captureStatus: $('capture-status'), signalState: $('signal-state'),
  signalLevel: $('signal-level'), meterFill: $('meter-fill'),
  resume: $('resume-button'), stopCapture: $('stop-capture'),
  recordTime: $('record-time'), recordState: $('record-state'),
  recordButton: $('record-button'), stopRecording: $('stop-recording'),
  format: $('format'), encoding: $('encoding-label'), exportStatus: $('export-status'),
  recDot: $('rec-dot'), toast: $('toast')
};

const DEFAULTS = Object.freeze({
  speed: 0.8, keepPitch: false, reverb: 40, echo: 0,
  bass: 0, mid: 0, treble: 0, width: 100, pan: 0, saturation: 0
});
let settings = { ...DEFAULTS };
let mediaStream = null;
let audioContext = null;
let graph = null;
let recorder = null;
let recordedChunks = [];
let recordingStartedAt = 0;
let recordingTimer = null;
let meterFrame = 0;
let isCapturing = false;
let isRecording = false;
let isClosing = false;

const CONTROL_IDS = ['speed', 'reverb', 'echo', 'bass', 'mid', 'treble', 'width', 'pan', 'saturation'];

function setStatus(message, kind = '') {
  ui.exportStatus.textContent = message;
  ui.exportStatus.className = `export-status${kind ? ` ${kind}` : ''}`;
}

function toast(message) {
  ui.toast.textContent = message;
  ui.toast.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => ui.toast.classList.remove('show'), 2600);
}

function setCaptureBadge(label, kind) {
  ui.captureStatus.textContent = label;
  ui.capturePill.className = `status-pill ${kind}`;
}

function displaySource() {
  ui.title.textContent = sourceTitle;
  ui.host.textContent = sourceHost || 'Browser tab audio';
}

function smooth(param, value, time = 0.035) {
  if (!param || !audioContext) return;
  const now = audioContext.currentTime;
  param.cancelScheduledValues(now);
  param.setTargetAtTime(value, now, time);
}

function makeImpulseResponse(context, seconds = 2.25, decay = 2.7) {
  const frames = Math.max(1, Math.floor(context.sampleRate * seconds));
  const impulse = context.createBuffer(2, frames, context.sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const samples = impulse.getChannelData(channel);
    for (let i = 0; i < frames; i++) {
      const envelope = Math.pow(1 - i / frames, decay);
      samples[i] = (Math.random() * 2 - 1) * envelope;
    }
  }
  return impulse;
}

function makeSaturationCurve(amount = 4) {
  const samples = 44100;
  const curve = new Float32Array(samples);
  const drive = 1 + amount * 1.6;
  const normalization = Math.tanh(drive);
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / (samples - 1) - 1;
    curve[i] = Math.tanh(drive * x) / normalization;
  }
  return curve;
}

function connectStereoWidth(context, input, widthControl) {
  const splitter = context.createChannelSplitter(2);
  const merger = context.createChannelMerger(2);
  const mid = context.createGain();
  const side = context.createGain();
  const sideInvert = context.createGain();
  const left = context.createGain();
  const right = context.createGain();
  const half = context.createGain();
  const minusHalf = context.createGain();
  half.gain.value = 0.5;
  minusHalf.gain.value = -0.5;
  sideInvert.gain.value = -1;

  input.connect(splitter);
  splitter.connect(half, 0).connect(mid);
  splitter.connect(half, 1).connect(mid);
  splitter.connect(half, 0).connect(side);
  splitter.connect(minusHalf, 1).connect(side);
  side.connect(widthControl);
  mid.connect(left);
  widthControl.connect(left);
  mid.connect(right);
  widthControl.connect(sideInvert).connect(right);
  left.connect(merger, 0, 0);
  right.connect(merger, 0, 1);
  return merger;
}

function buildAudioGraph(stream) {
  const context = new AudioContext({ latencyHint: 'interactive' });
  audioContext = context;
  const source = context.createMediaStreamSource(stream);
  const analyser = context.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.78;
  source.connect(analyser);

  const bass = context.createBiquadFilter();
  bass.type = 'lowshelf';
  bass.frequency.value = 180;
  const mid = context.createBiquadFilter();
  mid.type = 'peaking';
  mid.frequency.value = 1000;
  mid.Q.value = 1;
  const treble = context.createBiquadFilter();
  treble.type = 'highshelf';
  treble.frequency.value = 4200;

  const dry = context.createGain();
  const convolver = context.createConvolver();
  convolver.buffer = makeImpulseResponse(context);
  const wet = context.createGain();
  const delay = context.createDelay(1.0);
  delay.delayTime.value = 0.32;
  const feedback = context.createGain();
  feedback.gain.value = 0.32;
  const echo = context.createGain();
  const saturator = context.createWaveShaper();
  saturator.curve = makeSaturationCurve();
  saturator.oversample = '4x';
  const saturation = context.createGain();
  const mix = context.createGain();
  const width = context.createGain();
  const pan = context.createStereoPanner();
  const compressor = context.createDynamicsCompressor();
  compressor.threshold.value = -5;
  compressor.knee.value = 4;
  compressor.ratio.value = 10;
  compressor.attack.value = 0.004;
  compressor.release.value = 0.16;
  const master = context.createGain();
  const recordDestination = context.createMediaStreamDestination();

  dry.gain.value = 1;
  wet.gain.value = 0;
  echo.gain.value = 0;
  saturation.gain.value = 0;
  width.gain.value = 1;
  master.gain.value = 0.92;

  source.connect(bass).connect(mid).connect(treble);
  treble.connect(dry).connect(mix);
  treble.connect(convolver).connect(wet).connect(mix);
  treble.connect(delay);
  delay.connect(feedback).connect(delay);
  delay.connect(echo).connect(mix);
  treble.connect(saturator).connect(saturation).connect(mix);
  const stereo = connectStereoWidth(context, mix, width);
  stereo.connect(pan).connect(compressor).connect(master);
  master.connect(context.destination);
  master.connect(recordDestination);

  const result = {
    context, source, analyser, bass, mid, treble, dry, wet, delay,
    feedback, echo, saturation, width, pan, master, compressor,
    recordDestination
  };
  applySettingsToGraph(result);
  return result;
}

function applySettingsToGraph(target = graph) {
  if (!target) return;
  const s = settings;
  smooth(target.bass.gain, s.bass);
  smooth(target.mid.gain, s.mid);
  smooth(target.treble.gain, s.treble);
  const reverb = s.reverb / 100;
  smooth(target.wet.gain, reverb * 0.72);
  smooth(target.dry.gain, 1 - reverb * 0.22);
  smooth(target.echo.gain, (s.echo / 100) * 0.45);
  smooth(target.feedback.gain, s.echo > 0 ? 0.18 + (s.echo / 100) * 0.2 : 0);
  smooth(target.saturation.gain, (s.saturation / 100) * 0.62);
  smooth(target.width.gain, s.width / 100);
  smooth(target.pan.pan, s.pan / 100);
  smooth(target.master.gain, 0.92);
}

// This function is injected into the page's MAIN world. It changes ordinary
// HTMLMediaElement playback speed without depending on a site's player API.
// It does not inspect, extract, or alter protected media streams.
function setPagePlaybackSpeed(speed, keepPitch, restore = false) {
  const key = '__universalTabAudioStudioSpeed';
  let controller = window[key];

  if (restore) {
    if (!controller) return { restored: true, count: 0 };
    controller.active = false;
    controller.observer?.disconnect();
    for (const [media, state] of controller.originals) {
      const listeners = controller.listeners.get(media);
      if (listeners) {
        media.removeEventListener('play', listeners.apply);
        media.removeEventListener('loadedmetadata', listeners.apply);
        media.removeEventListener('ratechange', listeners.ratechange);
      }
      try {
        media.playbackRate = state.rate;
        if (state.preservesPitch !== undefined) media.preservesPitch = state.preservesPitch;
        if (state.mozPreservesPitch !== undefined) media.mozPreservesPitch = state.mozPreservesPitch;
        if (state.webkitPreservesPitch !== undefined) media.webkitPreservesPitch = state.webkitPreservesPitch;
      } catch {}
    }
    const count = controller.originals.size;
    delete window[key];
    return { restored: true, count };
  }

  if (!controller) {
    controller = {
      active: true,
      speed,
      keepPitch,
      originals: new Map(),
      listeners: new Map(),
      observer: null,
      applyAll: null
    };
    controller.applyAll = () => {
      if (!controller.active) return;
      for (const [media, listeners] of controller.listeners) listeners.apply();
    };

    const attach = (media) => {
      if (!(media instanceof HTMLMediaElement) || controller.originals.has(media)) return;
      controller.originals.set(media, {
        rate: media.playbackRate,
        preservesPitch: typeof media.preservesPitch === 'boolean' ? media.preservesPitch : undefined,
        mozPreservesPitch: typeof media.mozPreservesPitch === 'boolean' ? media.mozPreservesPitch : undefined,
        webkitPreservesPitch: typeof media.webkitPreservesPitch === 'boolean' ? media.webkitPreservesPitch : undefined
      });
      const apply = () => {
        if (!controller.active || !media.isConnected) return;
        try {
          if (Math.abs(media.playbackRate - controller.speed) > 0.001) {
            media.playbackRate = controller.speed;
          }
          if ('preservesPitch' in media) media.preservesPitch = controller.keepPitch;
          if ('mozPreservesPitch' in media) media.mozPreservesPitch = controller.keepPitch;
          if ('webkitPreservesPitch' in media) media.webkitPreservesPitch = controller.keepPitch;
        } catch {}
      };
      const ratechange = () => {
        if (controller.active && Math.abs(media.playbackRate - controller.speed) > 0.001) apply();
      };
      controller.listeners.set(media, { apply, ratechange });
      media.addEventListener('play', apply);
      media.addEventListener('loadedmetadata', apply);
      media.addEventListener('ratechange', ratechange);
      apply();
    };

    controller.attach = attach;
    controller.observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node instanceof HTMLMediaElement) attach(node);
          else if (node.querySelectorAll) node.querySelectorAll('audio,video').forEach(attach);
        }
      }
    });
    controller.observer.observe(document.documentElement, { childList: true, subtree: true });
    document.querySelectorAll('audio,video').forEach(attach);
    window[key] = controller;
  }

  controller.active = true;
  controller.speed = speed;
  controller.keepPitch = keepPitch;
  controller.applyAll();
  return { restored: false, count: controller.originals.size };
}

async function updateSourceSpeed() {
  if (!Number.isInteger(sourceTabId) || sourceTabId < 0) return;
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: sourceTabId },
      world: 'MAIN',
      func: setPagePlaybackSpeed,
      args: [settings.speed, settings.keepPitch, false]
    });
    const count = results?.[0]?.result?.count ?? 0;
    $('speed').dataset.mediaCount = String(count);
  } catch (error) {
    setStatus(`Speed control could not reach the source tab: ${error.message}. Live effects and export can still work.`, 'error');
  }
}

async function restoreSourceSpeed() {
  if (!Number.isInteger(sourceTabId) || sourceTabId < 0) return;
  try {
    await chrome.scripting.executeScript({
      target: { tabId: sourceTabId },
      world: 'MAIN',
      func: setPagePlaybackSpeed,
      args: [1, false, true]
    });
  } catch {
    // The source tab may have navigated or closed. Its former media elements
    // no longer exist, so there is nothing useful to restore in that case.
  }
}

function updateReadouts() {
  $('speed-value').textContent = `${Number(settings.speed).toFixed(2)}×`;
  $('reverb-value').textContent = `${settings.reverb}%`;
  $('echo-value').textContent = `${settings.echo}%`;
  $('bass-value').textContent = `${settings.bass > 0 ? '+' : ''}${settings.bass} dB`;
  $('mid-value').textContent = `${settings.mid > 0 ? '+' : ''}${settings.mid} dB`;
  $('treble-value').textContent = `${settings.treble > 0 ? '+' : ''}${settings.treble} dB`;
  $('width-value').textContent = `${settings.width}%`;
  $('pan-value').textContent = settings.pan === 0 ? 'Center' : settings.pan < 0 ? `${Math.abs(settings.pan)}% L` : `${settings.pan}% R`;
  $('saturation-value').textContent = `${settings.saturation}%`;
  ui.encoding.textContent = ui.format.value === 'wav' ? '16-bit PCM · WAV' : 'Opus · WebM';
}

function syncInputs() {
  $('speed').value = String(settings.speed);
  $('keep-pitch').checked = settings.keepPitch;
  for (const id of ['reverb', 'echo', 'bass', 'mid', 'treble', 'width', 'pan', 'saturation']) {
    $(id).value = String(settings[id]);
  }
  updateReadouts();
}

function setPreset(preset) {
  if (preset === 'slowed') {
    settings = { ...settings, speed: 0.8, keepPitch: false, reverb: 40 };
  } else if (preset === 'nightcore') {
    settings = { ...settings, speed: 1.2, keepPitch: false, reverb: 0, echo: 0 };
  } else {
    settings = { ...DEFAULTS, speed: 1, reverb: 0 };
  }
  syncInputs();
  applySettingsToGraph();
  updateSourceSpeed();
  document.querySelectorAll('.preset').forEach((button) => button.classList.remove('active'));
  if (preset !== 'reset') $(`preset-${preset}`).classList.add('active');
}

function bindControls() {
  for (const id of CONTROL_IDS) {
    $(id).addEventListener('input', () => {
      settings[id] = Number($(id).value);
      updateReadouts();
      if (id === 'speed') updateSourceSpeed();
      applySettingsToGraph();
      document.querySelectorAll('.preset').forEach((button) => button.classList.remove('active'));
    });
  }
  $('keep-pitch').addEventListener('change', () => {
    settings.keepPitch = $('keep-pitch').checked;
    updateSourceSpeed();
  });
  $('preset-slow').addEventListener('click', () => setPreset('slowed'));
  $('preset-nightcore').addEventListener('click', () => setPreset('nightcore'));
  $('preset-reset').addEventListener('click', () => setPreset('reset'));
  ui.format.addEventListener('change', updateReadouts);
}

function startMeter() {
  const buffer = new Float32Array(graph.analyser.fftSize);
  const tick = () => {
    if (!graph || !isCapturing) return;
    graph.analyser.getFloatTimeDomainData(buffer);
    let sum = 0;
    for (let i = 0; i < buffer.length; i++) sum += buffer[i] * buffer[i];
    const rms = Math.sqrt(sum / buffer.length);
    const db = rms > 0 ? 20 * Math.log10(rms) : -Infinity;
    const normalized = Number.isFinite(db) ? Math.max(0, Math.min(1, (db + 60) / 52)) : 0;
    ui.meterFill.style.width = `${(normalized * 100).toFixed(1)}%`;
    ui.signalLevel.textContent = Number.isFinite(db) ? `${db.toFixed(1)} dBFS` : '−∞ dBFS';
    if (rms > 0.004) {
      ui.signalState.textContent = 'Audio detected';
      ui.signalState.style.color = '#8ae6d2';
    } else {
      ui.signalState.textContent = 'Waiting for audio';
      ui.signalState.style.color = '';
    }
    meterFrame = requestAnimationFrame(tick);
  };
  tick();
}

function updateRecordTimer() {
  if (!isRecording) return;
  const seconds = Math.max(0, Math.floor((Date.now() - recordingStartedAt) / 1000));
  const minutes = String(Math.floor(seconds / 60)).padStart(2, '0');
  const remainder = String(seconds % 60).padStart(2, '0');
  ui.recordTime.textContent = `${minutes}:${remainder}`;
}

function startRecording() {
  if (!graph || !isCapturing || isRecording) return;
  const mimeType = [
    'audio/webm;codecs=opus',
    'audio/webm'
  ].find((type) => MediaRecorder.isTypeSupported(type));
  if (!mimeType) {
    setStatus('This browser does not expose a supported WebM audio recorder.', 'error');
    return;
  }

  recordedChunks = [];
  try {
    recorder = new MediaRecorder(graph.recordDestination.stream, {
      mimeType,
      audioBitsPerSecond: 192000
    });
  } catch (error) {
    setStatus(`Recorder could not start: ${error.message}`, 'error');
    return;
  }

  recorder.addEventListener('dataavailable', (event) => {
    if (event.data?.size) recordedChunks.push(event.data);
  });
  recorder.addEventListener('error', (event) => {
    setStatus(`Recording error: ${event.error?.message || 'Unknown recorder error'}`, 'error');
  });
  recorder.addEventListener('stop', handleRecordingStopped, { once: true });
  recorder.start(1000);
  isRecording = true;
  recordingStartedAt = Date.now();
  ui.recDot.style.background = 'var(--danger)';
  ui.recDot.style.boxShadow = '0 0 11px rgba(255,111,126,.65)';
  ui.recordState.textContent = 'Recording processed output';
  ui.recordButton.disabled = true;
  ui.stopRecording.disabled = false;
  ui.recordButton.textContent = '● Recording';
  ui.stopRecording.textContent = 'Stop & export';
  recordingTimer = setInterval(updateRecordTimer, 250);
  setStatus('Recording the signal after the effects rack.', 'success');
}

async function convertRecordingToWav(blob) {
  const bytes = await blob.arrayBuffer();
  const decoder = new AudioContext();
  try {
    const decoded = await decoder.decodeAudioData(bytes.slice(0));
    return TabAudioCore.encodeWav(decoded);
  } finally {
    await decoder.close();
  }
}

function downloadBlob(blob, extension) {
  const safeTitle = sourceTitle
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 70) || 'tab-audio';
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${safeTitle}-processed-${stamp}.${extension}`;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

async function handleRecordingStopped() {
  clearInterval(recordingTimer);
  isRecording = false;
  ui.recDot.style.background = '#54d8b8';
  ui.recDot.style.boxShadow = '0 0 11px rgba(84,216,184,.5)';
  ui.recordButton.disabled = !isCapturing;
  ui.stopRecording.disabled = true;
  ui.recordButton.textContent = '● Start recording';
  ui.recordState.textContent = 'Recording saved';

  const recorded = new Blob(recordedChunks, { type: recorder?.mimeType || 'audio/webm' });
  recordedChunks = [];
  if (!recorded.size) {
    setStatus('No audio data was recorded. Check that the tab is producing capturable audio.', 'error');
    ui.recordTime.textContent = '00:00';
    return;
  }

  try {
    setStatus('Preparing your download…');
    if (ui.format.value === 'wav') {
      const wav = await convertRecordingToWav(recorded);
      downloadBlob(wav, 'wav');
      setStatus(`WAV exported (${(wav.size / (1024 * 1024)).toFixed(2)} MB).`, 'success');
    } else {
      const webm = recorded.type.includes('webm') ? recorded : new Blob([recorded], { type: 'audio/webm' });
      downloadBlob(webm, 'webm');
      setStatus(`WebM/Opus exported (${(webm.size / (1024 * 1024)).toFixed(2)} MB).`, 'success');
    }
  } catch (error) {
    setStatus(`Export failed: ${error.message}`, 'error');
  } finally {
    recorder = null;
    ui.recordTime.textContent = '00:00';
    if (!isClosing) ui.recordState.textContent = 'Ready to record';
  }
}

function stopRecordingAndExport() {
  if (!recorder || recorder.state === 'inactive') return;
  ui.stopRecording.disabled = true;
  ui.recordState.textContent = 'Finalizing recording…';
  recorder.stop();
}

async function stopCapture() {
  if (!isCapturing) return;
  ui.stopCapture.disabled = true;
  if (isRecording) {
    stopRecordingAndExport();
    await new Promise((resolve) => {
      const wait = () => isRecording ? setTimeout(wait, 50) : resolve();
      wait();
    });
  }
  isCapturing = false;
  cancelAnimationFrame(meterFrame);
  await restoreSourceSpeed();
  await chrome.runtime.sendMessage({ type: 'UNREGISTER_STUDIO_CAPTURE' }).catch(() => {});
  mediaStream?.getTracks().forEach((track) => track.stop());
  mediaStream = null;
  if (audioContext && audioContext.state !== 'closed') await audioContext.close().catch(() => {});
  audioContext = null;
  graph = null;
  ui.recordButton.disabled = true;
  ui.stopRecording.disabled = true;
  ui.signalState.textContent = 'Capture stopped';
  ui.meterFill.style.width = '0%';
  ui.signalLevel.textContent = '−∞ dBFS';
  ui.stopCapture.disabled = true;
  setCaptureBadge('Stopped', 'pending');
  ui.recordState.textContent = 'Capture stopped';
  setStatus('Capture stopped. The source tab playback speed has been restored where possible.');
}

async function startCapture(session) {
  streamId = session.streamId;
  sourceTabId = session.sourceTabId;
  sourceTitle = session.sourceTitle || 'Current browser tab';
  sourceHost = session.sourceHost || '';
  displaySource();
  if (!streamId || !Number.isInteger(sourceTabId)) {
    setCaptureBadge('No capture session', 'error');
    setStatus('The capture session was incomplete. Close this tab and launch the Studio again from the source tab.', 'error');
    ui.signalState.textContent = 'Capture unavailable';
    return;
  }

  try {
    const constraints = TabAudioCore.buildTabCaptureConstraints(streamId);
    mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
    if (!mediaStream.getAudioTracks().length) throw new Error('The selected tab did not provide an audio track.');
    graph = buildAudioGraph(mediaStream);
    audioContext = graph.context;
    isCapturing = true;
    await audioContext.resume().catch(() => {});
    await updateSourceSpeed();
    await chrome.runtime.sendMessage({ type: 'REGISTER_STUDIO_CAPTURE', sourceTabId }).catch(() => {});
    setCaptureBadge('Capturing', 'active');
    ui.recordButton.disabled = false;
    ui.stopCapture.disabled = false;
    ui.recordState.textContent = 'Ready to record';
    setStatus('Live tab audio is routed through the effects rack. Adjust controls, then record the processed output.', 'success');
    startMeter();

    mediaStream.getAudioTracks()[0].addEventListener('ended', () => {
      if (isCapturing) stopCapture();
    }, { once: true });

    if (audioContext.state === 'suspended') {
      ui.resume.hidden = false;
      ui.resume.addEventListener('click', async () => {
        await audioContext?.resume();
        ui.resume.hidden = !audioContext || audioContext.state !== 'suspended';
      });
      setStatus('The browser paused audio playback. Select “Enable audio” to hear the processed tab.', 'error');
    }
  } catch (error) {
    setCaptureBadge('Capture failed', 'error');
    ui.signalState.textContent = 'No capturable audio';
    const errorName = error?.name || 'CaptureError';
    const errorMessage = error?.message || String(error);
    let captureState = 'not reported';
    try {
      const capturedTabs = await chrome.tabCapture.getCapturedTabs();
      captureState = capturedTabs.find((entry) => entry.tabId === sourceTabId)?.status || 'not listed';
    } catch {}
    console.error('Universal Tab Audio Studio: tab capture failed', {
      sourceTabId, errorName, errorMessage, captureState
    });
    setStatus(`Chrome capture failed (${errorName}; tab state: ${captureState}): ${errorMessage}. This alone does not establish that the source is DRM-protected.`, 'error');
    mediaStream?.getTracks().forEach((track) => track.stop());
    mediaStream = null;
  }
}

ui.recordButton.addEventListener('click', async () => {
  if (audioContext?.state === 'suspended') await audioContext.resume();
  if (audioContext?.state === 'running') ui.resume.hidden = true;
  startRecording();
});
ui.stopRecording.addEventListener('click', stopRecordingAndExport);
ui.stopCapture.addEventListener('click', stopCapture);

window.addEventListener('pagehide', () => {
  isClosing = true;
  clearInterval(recordingTimer);
  cancelAnimationFrame(meterFrame);
  if (recorder && recorder.state !== 'inactive') recorder.stop();
  mediaStream?.getTracks().forEach((track) => track.stop());
  restoreSourceSpeed();
  if (audioContext && audioContext.state !== 'closed') audioContext.close().catch(() => {});
});

bindControls();
syncInputs();
displaySource();

// Consume the short-lived stream ID from session storage. The background
// writes a tab-specific key only after this exact Studio tab has committed.
// This avoids a second navigation between ID creation and getUserMedia(),
// which could consume the browser's few-second stream-ID lifetime.
let captureSessionConsumed = false;

async function consumeCaptureSession() {
  if (captureSessionConsumed || !Number.isInteger(ownStudioTabId)) return;
  const key = `captureSession:${ownStudioTabId}`;
  const stored = await chrome.storage.session.get(key).catch(() => ({}));
  const session = stored[key];
  if (!session || captureSessionConsumed) return;
  captureSessionConsumed = true;
  await chrome.storage.session.remove(key).catch(() => {});
  sourceTabId = session.sourceTabId;
  sourceTitle = session.sourceTitle || 'Current browser tab';
  sourceHost = session.sourceHost || '';
  displaySource();

  if (session.error) {
    setCaptureBadge('Capture failed', 'error');
    ui.signalState.textContent = 'Capture unavailable';
    setStatus(`Capture setup failed: ${session.error}`, 'error');
    return;
  }
  startCapture(session);
}

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'session' || !Number.isInteger(ownStudioTabId)) return;
  if (changes[`captureSession:${ownStudioTabId}`]?.newValue) consumeCaptureSession();
});

chrome.tabs.getCurrent((tab) => {
  ownStudioTabId = tab?.id ?? null;
  if (Number.isInteger(ownStudioTabId)) consumeCaptureSession();
  else setStatus('Could not identify this Studio tab. Close it and relaunch from the source tab.', 'error');
});
