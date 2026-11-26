'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));

test('manifest declares the required source-independent tab-capture permissions', () => {
  for (const permission of ['activeTab', 'scripting', 'tabCapture', 'storage']) {
    assert.ok(manifest.permissions.includes(permission), `missing ${permission}`);
  }
  assert.equal(manifest.manifest_version, 3);
  assert.ok(Number(manifest.minimum_chrome_version) >= 116);
  assert.equal(manifest.background.service_worker, 'background.js');
  assert.equal(manifest.action.default_popup, undefined);
  assert.equal(manifest.version, '1.0.2');
});

test('capture flow uses a consumer-tab-scoped stream ID', () => {
  const background = fs.readFileSync(path.join(root, 'background.js'), 'utf8');
  assert.match(background, /chrome\.action\.onClicked/);
  assert.match(background, /targetTabId:\s*sourceTab\.id/);
  assert.match(background, /consumerTabId:\s*studioTab\.id/);
  assert.match(background, /chrome\.tabs\.onRemoved/);
  assert.match(background, /restorePageMediaSpeedFromBackground/);
  assert.match(background, /active:\s*false/);
  assert.match(background, /chrome\.tabCapture\.getMediaStreamId/);
  assert.match(background, /function waitForTabCommit/);
  assert.match(background, /await waitForTabCommit\(studioTab\.id, studioUrl\)/);
  assert.ok(
    background.indexOf('await waitForTabCommit(studioTab.id, studioUrl)') <
      background.indexOf('chrome.tabCapture.getMediaStreamId'),
    'the consumer tab must commit before Chrome creates the capture stream ID'
  );
});


test('capture stream ID is delivered without navigating the consumer document', () => {
  const background = fs.readFileSync(path.join(root, 'background.js'), 'utf8');
  const studio = fs.readFileSync(path.join(root, 'studio.js'), 'utf8');
  assert.match(background, /chrome\.storage\.session\.set\(\{ \[sessionKey\]: \{ \.\.\.session, streamId \} \}\)/);
  assert.match(studio, /chrome\.storage\.onChanged\.addListener/);
  assert.match(studio, /chrome\.storage\.session\.get\(key\)/);
  assert.match(studio, /startCapture\(session\)/);
  assert.doesNotMatch(background, /tabs\.update\(studioTab\.id, \{ url:/);
  assert.doesNotMatch(studio, /new URLSearchParams\(location\.search\)/);
});

test('capture failures retain the underlying browser error name and capture state', () => {
  const source = fs.readFileSync(path.join(root, 'studio.js'), 'utf8');
  assert.match(source, /error\?\.name \|\| 'CaptureError'/);
  assert.match(source, /chrome\.tabCapture\.getCapturedTabs\(\)/);
  assert.match(source, /tab state: \$\{captureState\}/);
});

test('studio records the post-effects MediaStreamDestination and exposes both exports', () => {
  const source = fs.readFileSync(path.join(root, 'studio.js'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'studio.html'), 'utf8');
  assert.match(source, /createMediaStreamDestination/);
  assert.match(source, /new MediaRecorder\(graph\.recordDestination\.stream/);
  assert.match(source, /TabAudioCore\.encodeWav/);
  assert.match(source, /downloadBlob\(webm, 'webm'\)/);
  assert.match(html, /value="webm"/);
  assert.match(html, /value="wav"/);
});

test('source-page speed controller restores original media playback state', () => {
  const source = fs.readFileSync(path.join(root, 'studio.js'), 'utf8');
  assert.match(source, /function setPagePlaybackSpeed/);
  assert.match(source, /controller\.observer\?\.disconnect\(\)/);
  assert.match(source, /media\.playbackRate = state\.rate/);
});
