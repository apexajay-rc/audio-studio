# Audio Studio

A browser-first, casual audio editing studio. This repository starts with a verified vertical slice: local MP3/WAV import, browser decoding, waveform display, playback, seeking, and playback-rate control.

## Requirements

- Node.js `>=22.12.0` (the included `.nvmrc` selects Node `26.13.1`)
- npm 10 or newer
- A modern browser with Web Audio API support

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
```

Run `npm run test:watch` while developing domain logic.

## Current functionality

- Import a local MP3 or WAV file (20 MiB maximum).
- Decode audio in the browser.
- Draw a waveform from the decoded samples.
- Play, pause, seek, and change playback rate from 0.5x to 2x.
- Select a non-destructive trim region with sample-aligned start/end controls.
- Preview only the selected region without changing the original audio.
- Keep the source audio in the browser; no account or upload server is involved.

## Not implemented yet

- URL/source integrations
- Exporting the selected trim region as a new audio file
- Split editing
- Pitch-preserving time stretch
- Bass/EQ/reverb/echo effects
- Export/encoding
- Project persistence

## Engineering approach

See [`docs/architecture.md`](docs/architecture.md). We use a functional domain core, a stateful browser audio adapter, typed contracts, explicit resource cleanup, unit tests for pure logic, and strict TypeScript settings.

## Dependency policy

Direct dependencies are pinned to exact versions in `package.json`. Generate and commit `package-lock.json` with `npm install` on the project machine, then use `npm ci` for repeatable installs and CI. Review dependency changes and audit the resolved tree before merging updates.

## Privacy and source rights

Local audio is processed in the browser in this milestone. Only import audio that you own or are authorized to edit. Future online integrations must use permitted access paths; the application will not bypass DRM, access controls, or CORS restrictions.
