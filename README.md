# Universal Tab Audio Studio 1.0.2

A source-independent Chromium Manifest V3 extension that captures the audio output of the browser tab where the user invokes the toolbar action, applies live audio effects, routes the processed signal back to the speakers, and records that processed output for download.

## Install

1. Download and extract `universal-tab-audio-studio.zip`.
2. Open `chrome://extensions` in Chrome, Edge or Brave.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select the extracted `universal-tab-audio-studio` folder.
6. Open a tab that is playing audio and click the extension's toolbar icon.
7. The Studio opens in a new tab and starts capturing the tab you launched it from.

The toolbar click is the user invocation required by Chrome's `tabCapture` API. Chrome 116 or later is required because the extension uses a consumer-tab-scoped stream ID.

## Included

- Capture audio from the invoked browser tab without a site-specific integration.
- Automatic audio-level detection and live signal meter.
- Real-time playback through the effects graph.
- Slowed + Reverb and Nightcore presets.
- Playback speed control for ordinary HTML `<audio>` and `<video>` players, with optional pitch preservation.
- Reverb, echo, three-band EQ, stereo width, pan and saturation.
- Record the output **after** the effects chain.
- Export processed audio as WebM/Opus or WAV/16-bit PCM.
- Local processing; no network requests, analytics or remote code.

## Important compatibility limits

"Any source" means any browser tab whose audio Chrome makes available through `chrome.tabCapture`. It does not mean every page or protected stream is guaranteed to be capturable. Browser-internal pages, some DRM/protected media, muted tabs, and some unusual player architectures can provide no usable audio. The extension does not defeat DRM or other access controls.

The speed control adjusts HTML audio/video elements in the source tab. Audio produced entirely through a Web Audio graph, a remote app surface, or a player that does not expose a media element may not have controllable playback speed. The other effects and recording operate on the captured tab signal when Chrome provides it.

Track identification is not implemented. The Studio displays the source tab title and host and detects whether audio energy is present; it does not claim to recognise the song or artist. Sites may expose their own title in the tab title, but this is not guaranteed.

Tab capture changes the tab's direct audio output. The extension routes the captured signal through the effects graph to the speakers and recorder. If the Studio is closed, the capture ends and the source tab's playback speed is restored where the source tab is still reachable.

## Export formats

- **WebM / Opus:** recommended for faster export and smaller files.
- **WAV / 16-bit PCM:** the recorded WebM data is decoded locally and converted to uncompressed PCM. This uses more memory and produces larger files.

MP3 is not included because browsers do not provide a native MP3 encoder through `MediaRecorder`.

## Technical architecture

```text
User clicks toolbar icon on source tab
                |
                v
       chrome.tabCapture
                |
                v
       captured MediaStream
                |
                v
          AudioContext
                |
       +--------+---------+
       |                  |
       v                  v
  AnalyserNode       Effects graph
  (signal meter)     EQ / Reverb / Echo
                     Saturation / Width
                           |
                           v
                    Pan / Compressor
                           |
                           v
                      Master Gain
                       /       \
                      v         v
                 Speakers   MediaStreamDestination
                                  |
                                  v
                             MediaRecorder
                                  |
                                  v
                         WebM/Opus or WAV
```

Playback speed is applied to ordinary HTML media elements in the captured source tab using `chrome.scripting` with the `activeTab` grant. It is deliberately separate from the captured-signal DSP graph.

## Validation

Run:

```sh
node --check background.js
node --check studio.js
node --test tests/*.test.js
```

The included tests validate the manifest, source-independent capture setup, the page-speed controller and the WAV encoder's header/layout contract. A real end-to-end capture test still needs to be run in a desktop Chrome session with a live audio source because browser media capture is not faithfully simulated by Node mocks.

## Legal and platform note

The extension provides a general browser tab audio capture mechanism. The browser API's availability is not permission from a streaming service or a copyright holder to record or export its content. Users are responsible for ensuring their recording and use comply with applicable law, rights-holder permissions and service terms. The extension does not bypass DRM or other source-side protections.

### Capture handoff hardening (1.0.2)

The background service worker waits until `studio.html` has committed in its
consumer tab before calling `chrome.tabCapture.getMediaStreamId()`. It then
places the one-use stream ID in `chrome.storage.session` for that Studio tab.
The Studio page consumes the ID without navigating or reloading after the ID
is created. This avoids wasting the stream ID's short lifetime on a second
page navigation. The wait for the initial commit is bounded by 15 seconds.

If `getUserMedia()` still fails, the Studio now displays the DOMException name
and the browser's tab-capture status when available. The message explicitly
does not assume that every capture failure is caused by DRM.

