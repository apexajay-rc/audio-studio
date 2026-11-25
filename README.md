# Audio Studio

A browser-first, casual audio editing studio. Audio is decoded, previewed, rendered, and exported locally in the browser; the application does not upload source audio to a server.

## Requirements

- Node.js `>=22.12.0` (the included `.nvmrc` selects Node `26.13.1`)
- npm 10 or newer
- A modern browser with Web Audio API, OfflineAudioContext, and Web Worker support

## Setup

```bash
npm install
npm run dev
```

Open the local URL printed by Vite.

## Verification

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm audit
```

Run `npm run test:watch` while developing domain logic.

## Current functionality

- Import a local MP3 or WAV file (20 MiB maximum).
- Decode audio in the browser and draw a waveform from its samples.
- Play, pause, seek, and change playback rate from 0.5x to 2x.
- Select a non-destructive trim region with sample-aligned start/end controls.
- Preview only the selected region without changing the original audio.
- Apply live bass boost, a five-band equalizer, algorithmic reverb, and echo.
- Render the selected region with the chosen speed and effect settings.
- Export 16-bit PCM WAV or MP3 at 128, 192, 256, or 320 kbps.
- Run MP3 encoding in a dedicated Web Worker so encoding does not monopolize the UI thread.
- Validate WAV container headers, MP3 frame sync, and rendered audio metadata before download.

## Processing model

The real-time preview and offline export use the same `createAudioEffectsGraph` implementation. `AudioContext` drives interactive playback; `OfflineAudioContext` renders the selected range into an `AudioBuffer` for encoding. The original decoded source remains unchanged. Playback-rate changes are currently resampling-style changes that also change pitch; pitch-preserving time stretch is not implemented yet.

Effects are intentionally conservative: bass boost is a low-shelf filter, the EQ is a five-band set of biquad filters, reverb uses a generated convolution impulse response, and echo uses a bounded-feedback delay loop. A final dynamics compressor helps manage level peaks; exported PCM samples are also clipped to the representable range.

## Export details

- WAV output: 16-bit little-endian PCM with a standard 44-byte RIFF/WAVE header.
- MP3 output: LAME-based CBR encoding in a dedicated worker. MP3 uses a standard MPEG-1 sample rate (32, 44.1, or 48 kHz); the audio is resampled during offline rendering when needed.
- Reverb/echo tails are included in the rendered output. Therefore, an export with time-based effects may be slightly longer than the selected region.
- MP3 encoding uses `@breezystack/lamejs` 1.2.7 under LGPL-3.0. See [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) before redistribution or commercial use.

## Not implemented yet

- URL/source integrations
- Pitch-preserving time stretching
- Split editing and multiple tracks
- Preset management and project persistence
- Cloud accounts or server-side processing

## Engineering approach

See [`docs/architecture.md`](docs/architecture.md). We use a functional domain core, a stateful browser audio adapter, typed contracts, data-oriented audio buffers, shared real-time/offline effect graphs, strict TypeScript, unit tests, and explicit resource cleanup.

## Dependency policy

Direct dependencies are pinned to exact versions in `package.json`. Run `npm install` after dependency changes and commit the generated `package-lock.json`; use `npm ci` for repeatable installs and CI. Review dependency changes, licences, and the resolved dependency tree before merging updates.

## Privacy and source rights

Local audio is processed in the browser. Only import audio that you own or are authorized to edit. Future online integrations must use permitted access paths; the application will not bypass DRM, access controls, or CORS restrictions.
