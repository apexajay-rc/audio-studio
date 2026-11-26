'use strict';

(() => {
  function encodeWav(audioBuffer) {
    if (!audioBuffer || !Number.isInteger(audioBuffer.numberOfChannels) ||
        !Number.isInteger(audioBuffer.length) || !Number.isFinite(audioBuffer.sampleRate)) {
      throw new TypeError('A valid AudioBuffer is required.');
    }
    const channels = Math.min(2, audioBuffer.numberOfChannels);
    const sampleRate = audioBuffer.sampleRate;
    const frameCount = audioBuffer.length;
    const bytesPerSample = 2;
    const blockAlign = channels * bytesPerSample;
    const dataBytes = frameCount * blockAlign;
    const buffer = new ArrayBuffer(44 + dataBytes);
    const view = new DataView(buffer);
    const writeString = (offset, text) => {
      for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
    };
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + dataBytes, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, channels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, dataBytes, true);

    const channelData = Array.from({ length: channels }, (_, channel) => audioBuffer.getChannelData(channel));
    let offset = 44;
    for (let frame = 0; frame < frameCount; frame++) {
      for (let channel = 0; channel < channels; channel++) {
        const sample = Math.max(-1, Math.min(1, channelData[channel][frame]));
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
        offset += 2;
      }
    }
    return new Blob([buffer], { type: 'audio/wav' });
  }

  function buildTabCaptureConstraints(streamId) {
    if (typeof streamId !== 'string' || streamId.length === 0) {
      throw new TypeError('A non-empty tab capture stream ID is required.');
    }
    return {
      audio: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: streamId
        }
      },
      video: false
    };
  }

  globalThis.TabAudioCore = Object.freeze({ encodeWav, buildTabCaptureConstraints });
})();
