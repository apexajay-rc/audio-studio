# Audio Studio — Architecture Notes

## Current scope

The application supports local MP3/WAV import, browser decoding, waveform display, playback, seeking, playback-rate changes, non-destructive trim selection, selection preview, live effects, offline rendering, and WAV/MP3 export.

## Architectural style

- Functional core: validation, trim/time calculations, effect configuration normalization, WAV encoding, and export checks are pure functions.
- Imperative shell: `BrowserAudioEngine` owns `AudioContext`, decoded `AudioBuffer`, live source nodes, and the real-time graph.
- Data-oriented audio handling: decoded samples remain in `AudioBuffer` channel arrays; waveform drawing uses a compact peak envelope; MP3 encoding transfers bounded PCM chunks to a worker.
- Selective OOP: the engine and exporter encapsulate lifecycle-managed browser resources.
- Dependency inversion: React depends on `AudioEnginePort`; export depends on `AudioExporterPort`.

## Audio graph

`createAudioEffectsGraph` builds the shared signal path used by both preview and offline render:

`source -> bass low-shelf -> 5-band EQ -> dry / reverb / echo parallel paths -> dynamics compressor -> output`

The echo path uses a `DelayNode` and a low-pass-filtered feedback loop. Feedback is clamped to 0..0.65. Reverb uses a deterministic generated impulse response in a `ConvolverNode`. User controls update live `AudioParam` targets with a short smoothing time to reduce zipper noise.

The exact same graph factory is used with `AudioContext` for preview and `OfflineAudioContext` for export. The source buffer is not modified.

## Rendering and export

1. Validate the selected time range and playback rate.
2. Create an `OfflineAudioContext` at the desired output sample rate/channel count.
3. Connect a buffer source through the shared effects graph.
4. Set playback rate and schedule only the selected source interval.
5. Render in memory. Add a bounded tail when reverb or echo is enabled.
6. Validate rendered sample rate, channel count, duration, and finite samples.
7. Encode as WAV or MP3.
8. Validate the WAV RIFF/data-length contract or MPEG Layer III frame-header fields before providing a download.

WAV is encoded as 16-bit little-endian PCM. MP3 input is converted from Float32 to clamped signed 16-bit PCM and sent in bounded chunks to a dedicated module worker. The encoder is not loaded on the main application path until the worker is constructed for an MP3 export.

## Dependency and licensing decision

MP3 export uses `@breezystack/lamejs` 1.2.7. The package is a pure-JavaScript LAME port with zero runtime dependencies, but its published release is old and its licence is LGPL-3.0. It is kept unmodified in a separate worker module, and the project includes a third-party notice. Before distributing a proprietary or commercial build, review the LGPL obligations for that specific distribution model. Re-evaluate the encoder if maintenance, security, compatibility, or licence requirements change.

## Resource lifecycle

- `BrowserAudioEngine` lazily creates `AudioContext` and the real-time effect graph.
- Replaced source nodes are stopped and disconnected.
- The live graph is disconnected and the context is closed on disposal.
- Offline graphs are disconnected after rendering.
- MP3 worker is terminated on completion or failure.
- Download object URLs are revoked after a short delay.

## Input and output constraints

- MVP import accepts `.mp3` and `.wav` (20 MiB maximum).
- Browser codec support varies; successful decoding is authoritative.
- Playback-rate controls currently change pitch as well as duration.
- WAV export uses 16-bit PCM and supports 1..8 channels.
- MP3 export supports mono/stereo and 32, 44.1, or 48 kHz; rendering chooses the closest supported rate so the full selected bitrate menu remains valid.
- Export selection is limited to 30 minutes before effect tails.
- A final dynamics compressor is used to reduce excessive peaks, and the PCM encoder clamps samples to [-1, 1]. This is not a substitute for a mastering/limiter system.
- Reverb and echo render tails are finite by design; reverb uses a 2.4-second impulse and echo estimates its decay from delay/feedback, capped at 7.5 seconds.

## Known limitations

- Reverb is a generated algorithmic impulse, not a library of measured room responses.
- The five-band EQ and bass boost use biquad filters; this is not a parametric EQ UI.
- The output validator checks the WAV header/data-length contract or MP3 frame sync. It does not fully decode the exported file to prove perceptual correctness; manual round-trip browser testing remains required.
- Offline rendering and encoding can still require significant memory for long selections. Mobile-device limits need real-device testing.
- MP3 worker and full browser export workflows require verification on the developer machine after dependencies are installed.
