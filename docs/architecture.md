# Audio Studio — Architecture Notes

## First milestone scope

The first vertical slice supports local MP3/WAV import, browser decoding, waveform display, playback, seeking, and playback-rate changes. It does not yet implement trimming, effects, URL import, or export.

## Architectural style

- Functional core: domain validation, time calculations, and waveform peak extraction are pure functions.
- Imperative shell: `BrowserAudioEngine` owns the browser's `AudioContext`, decoded `AudioBuffer`, and playback nodes.
- Data-oriented audio handling: decoded samples stay in `AudioBuffer` channel arrays; the waveform is a compact peak envelope.
- Selective OOP: a single engine class manages stateful browser resources and their lifecycle.
- Dependency inversion: the React application depends on `AudioEnginePort`, not directly on browser audio implementation details.

## Dependency flow

`Presentation -> Application Port -> Browser Infrastructure`

Domain modules do not import React, Vite, or browser audio APIs. The browser engine is an adapter that implements the application-facing audio engine port.

## Waveform rendering decision

The initial milestone uses a small Canvas renderer rather than WaveSurfer.js. It receives peak data extracted from the same decoded `AudioBuffer` used for playback. This avoids maintaining a second decoder/player state and limits early dependencies. A dedicated waveform package can be reconsidered when zoom, region editing, or advanced timeline features justify it.

## Resource lifecycle

- `BrowserAudioEngine` lazily creates `AudioContext` after a file is selected.
- Playback is resumed from the user's play action to respect browser autoplay policies.
- Replaced source nodes are stopped and disconnected.
- The React component disposes the engine on unmount.
- The original decoded buffer is retained while editing; editing operations must not overwrite it.

## Input constraints

- MVP accepts `.mp3` and `.wav` extensions only.
- Maximum compressed file size is 20 MiB.
- MIME type is checked when provided, but actual codec validity is determined by browser decoding.
- Import is local-only in this milestone. URL import will be designed separately with strict CORS and SSRF constraints if server-side retrieval is introduced.

## Known limitations in this milestone

- Playback-rate changes alter pitch. Pitch-preserving time stretching is a later DSP feature.
- Trim start/end are stored as seconds snapped to the nearest decoded sample boundary. The original AudioBuffer is retained. Selection preview uses AudioBufferSourceNode.start(when, offset, duration) and does not mutate samples. A rendered/exported trimmed file is not yet implemented.
- Browser codec support varies. Unsupported/corrupt inputs produce a user-facing error.
- The UI uses a custom canvas waveform and has not yet been benchmarked on low-memory mobile devices.
