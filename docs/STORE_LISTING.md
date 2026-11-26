# Chrome Web Store listing draft

## Name
Universal Tab Audio Studio

## Short description (132 characters maximum)
Apply live audio effects to the browser tab you choose, then record and export the processed audio locally.

## Detailed description
Universal Tab Audio Studio lets you shape audio from the browser tab you explicitly choose.

**What it does**
- Captures audio from the selected browser tab when you click the extension button.
- Applies live speed, pitch, reverb, echo, bass/mid/treble EQ, stereo width, pan, and saturation controls.
- Routes the processed sound back to your speakers so you can hear the result.
- Records the output after the effects chain and exports it locally as WebM/Opus or WAV.
- Processes audio in your browser. No account, analytics, advertising trackers, or audio uploads are used by the extension.

**How to use it**
1. Play audio in a browser tab.
2. Click the Universal Tab Audio Studio toolbar button on that tab.
3. Adjust effects in the Studio page.
4. Start recording, then choose Stop & Export when finished.

**Compatibility and limitations**
The extension works with audio that Chrome exposes through its tab-capture API. Some browser pages, protected media, muted tabs, or unusual player implementations may not expose usable audio. Playback-speed control applies to supported HTML audio/video players; some Web Audio-only players may not expose a controllable speed. The extension does not bypass DRM or other access controls.

The extension records the audio output of the selected tab, which may include music, speech, video sound, or other tab audio. Export capability does not itself grant permission to record or redistribute copyrighted material. Users are responsible for applicable laws, rights-holder permissions, and source-service terms.

## Single-purpose description for Privacy practices
Capture and process audio from the browser tab explicitly selected by the user, apply real-time sound effects, and optionally record and export the processed result locally.

## Permission justifications
- `activeTab`: Access the tab the user explicitly selected by clicking the extension action; read its title and hostname to label the source and identify the capture target.
- `scripting`: Apply and restore playback-rate and pitch settings on supported HTML audio/video elements in the selected tab, only after user invocation.
- `tabCapture`: Obtain the selected tab's audio stream so the extension can process it and record the post-effects output.
- `storage`: Temporarily hand the one-use capture stream ID and source-tab session metadata from the service worker to the Studio page; session-scoped data only.

## Data-use disclosure notes for the dashboard
The extension accesses the selected tab's title, hostname, and audio stream after the user invokes it. This data is processed locally and is not transmitted to the developer or third parties. The extension does not maintain browsing history, analytics, or server-side recordings. Do not select a blanket "no data accessed" or equivalent declaration if the dashboard's wording includes locally accessed tab metadata or audio; answer each current dashboard question accurately and consistently with the privacy policy.

## Category
Choose the closest available category for audio tools/productivity in the dashboard. Do not choose a category that implies a video/audio downloader if the available categories do not fit; describe the real tab-audio processing and recording functionality in the listing.

## Support URL
Use the GitHub Issues page after the public repository has been created, or a monitored support email address.

## Privacy policy URL
After enabling GitHub Pages from the repository's `/docs` folder, use:
`https://apexajay-rc.github.io/universal-tab-audio-studio/privacy-policy.html`

This URL is a proposed URL and will not work until the repository exists and GitHub Pages is enabled.
