'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
require('../audio-core.js');

const { encodeWav, buildTabCaptureConstraints } = globalThis.TabAudioCore;

test('builds a tab-capture constraint set for a stream ID', () => {
  assert.deepEqual(buildTabCaptureConstraints('capture-id'), {
    audio: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: 'capture-id' } },
    video: false
  });
});

test('rejects missing tab capture stream IDs', () => {
  assert.throws(() => buildTabCaptureConstraints(''), /stream ID/);
  assert.throws(() => buildTabCaptureConstraints(null), /stream ID/);
});

test('encodes stereo float samples as a valid 16-bit PCM WAV', async () => {
  const left = new Float32Array([-1, -0.5, 0, 0.5, 1]);
  const right = new Float32Array([1, 0.5, 0, -0.5, -1]);
  const mock = {
    numberOfChannels: 2,
    length: left.length,
    sampleRate: 48000,
    getChannelData: (channel) => channel === 0 ? left : right
  };
  const blob = encodeWav(mock);
  assert.equal(blob.type, 'audio/wav');
  assert.equal(blob.size, 44 + 5 * 2 * 2);
  const bytes = new DataView(await blob.arrayBuffer());
  const readTag = (offset, length) => String.fromCharCode(...Array.from({ length }, (_, i) => bytes.getUint8(offset + i)));
  assert.equal(readTag(0, 4), 'RIFF');
  assert.equal(readTag(8, 4), 'WAVE');
  assert.equal(readTag(12, 4), 'fmt ');
  assert.equal(readTag(36, 4), 'data');
  assert.equal(bytes.getUint16(20, true), 1);
  assert.equal(bytes.getUint16(22, true), 2);
  assert.equal(bytes.getUint32(24, true), 48000);
  assert.equal(bytes.getUint16(34, true), 16);
  assert.equal(bytes.getUint32(40, true), 20);
  assert.equal(bytes.getInt16(44, true), -32768);
  assert.equal(bytes.getInt16(46, true), 32767);
});

test('rejects an invalid audio buffer before encoding', () => {
  assert.throws(() => encodeWav(null), /AudioBuffer/);
  assert.throws(() => encodeWav({ numberOfChannels: 1 }), /AudioBuffer/);
});
