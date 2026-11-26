'use strict';

// Wait until the consumer tab has committed its extension URL. Chrome's
// tabCapture implementation derives the consumer origin from the tab's
// last-committed URL; calling getMediaStreamId immediately after tabs.create
// can race navigation and fail with "Caller tab.url is not a valid URL".
const STUDIO_LOAD_TIMEOUT_MS = 15000;
const CAPTURE_SESSION_PREFIX = 'captureSession:';

function captureSessionKey(tabId) {
  return `${CAPTURE_SESSION_PREFIX}${tabId}`;
}

function waitForTabCommit(tabId, expectedUrl) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timeout = setTimeout(() => finish(new Error('The Studio page did not finish loading.')), STUDIO_LOAD_TIMEOUT_MS);

    function finish(error) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      if (error) reject(error);
      else resolve();
    }

    function inspect(tab) {
      if (tab?.status === 'complete' && tab.url === expectedUrl) finish();
    }

    function onUpdated(updatedTabId, changeInfo, tab) {
      if (updatedTabId !== tabId || changeInfo.status !== 'complete') return;
      inspect(tab);
    }

    // Subscribe before checking the current state so a fast navigation cannot
    // complete between tabs.get() and listener registration.
    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.get(tabId).then(inspect).catch(finish);
  });
}

// The toolbar action is invoked on the source tab. Load the Studio consumer
// page first, then issue a stream ID and place it in session storage for that
// exact Studio tab. Do not navigate/reload the consumer after issuing the ID:
// Chrome documents stream IDs as single-use and short-lived.
chrome.action.onClicked.addListener(async (sourceTab) => {
  if (sourceTab?.id === undefined) return;

  const studioUrl = chrome.runtime.getURL('studio.html');
  const studioTab = await chrome.tabs.create({ url: studioUrl, active: false });
  const sessionKey = captureSessionKey(studioTab.id);

  let sourceHost = 'Browser tab';
  try {
    sourceHost = new URL(sourceTab.url || '').hostname || sourceHost;
  } catch {}

  const session = {
    studioTabId: studioTab.id,
    sourceTabId: sourceTab.id,
    sourceTitle: sourceTab.title || 'Browser tab',
    sourceHost
  };

  try {
    await waitForTabCommit(studioTab.id, studioUrl);

    const streamId = await chrome.tabCapture.getMediaStreamId({
      targetTabId: sourceTab.id,
      consumerTabId: studioTab.id
    });

    // The Studio document remains at the same committed extension origin and
    // consumes this one-use ID immediately after the storage change arrives.
    await chrome.storage.session.set({ [sessionKey]: { ...session, streamId } });
  } catch (error) {
    await chrome.storage.session.set({
      [sessionKey]: { ...session, error: error?.message || 'Tab audio capture could not start.' }
    }).catch(() => {});
  }

  await chrome.tabs.update(studioTab.id, { active: true });
});

// Keep the source-tab relationship in session storage so that closing the
// Studio page still restores the source player's original playback speed.
function restorePageMediaSpeedFromBackground() {
  const key = '__universalTabAudioStudioSpeed';
  const controller = window[key];
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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'REGISTER_STUDIO_CAPTURE' && sender.tab?.id !== undefined &&
      Number.isInteger(message.sourceTabId)) {
    chrome.storage.session.get({ studioSources: {} }).then(({ studioSources }) => {
      studioSources[sender.tab.id] = message.sourceTabId;
      return chrome.storage.session.set({ studioSources });
    }).then(() => sendResponse({ success: true })).catch((error) => {
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }

  if (message?.type === 'UNREGISTER_STUDIO_CAPTURE' && sender.tab?.id !== undefined) {
    chrome.storage.session.get({ studioSources: {} }).then(({ studioSources }) => {
      delete studioSources[sender.tab.id];
      return chrome.storage.session.set({ studioSources });
    }).then(() => sendResponse({ success: true })).catch((error) => {
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }
});

chrome.tabs.onRemoved.addListener(async (removedTabId) => {
  await chrome.storage.session.remove(captureSessionKey(removedTabId)).catch(() => {});
  const { studioSources = {} } = await chrome.storage.session.get({ studioSources: {} });
  const sourceTabId = studioSources[removedTabId];
  if (!Number.isInteger(sourceTabId)) return;
  delete studioSources[removedTabId];
  await chrome.storage.session.set({ studioSources });
  try {
    await chrome.scripting.executeScript({
      target: { tabId: sourceTabId },
      world: 'MAIN',
      func: restorePageMediaSpeedFromBackground
    });
  } catch {
    // The source tab may have closed or navigated away from its origin.
  }
});
