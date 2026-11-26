# v1.0.2 release checklist

## Before publishing
- [ ] Confirm project name and ownership/maintainer identity.
- [ ] Choose a source-code licence and replace `LICENSE.template` with a final `LICENSE`.
- [ ] Replace the privacy policy's support placeholder with a monitored email or the actual GitHub Issues URL.
- [ ] Create the public GitHub repository and enable GitHub Pages from `/docs`.
- [ ] Confirm the hosted privacy policy URL loads without authentication.
- [ ] Review the manifest permissions and match each justification to the actual code.
- [ ] Complete Chrome Web Store Privacy practices using the true local-processing behavior; do not claim that the extension never accesses tab data.
- [ ] Create current, genuine screenshots at 1280 x 800 or 640 x 400. Do not use screenshots showing capture failures or stale UI.
- [ ] Re-test on a fresh Chrome profile and a normal Chrome installation.

## Manual release test matrix
- [ ] Toolbar click on a normal HTML audio/video tab opens Studio and captures that tab only.
- [ ] Source audio remains audible through the effects graph while capture is active.
- [ ] Reverb, echo, EQ, saturation, pan, stereo width, and speed controls are audible/behave as described.
- [ ] WebM/Opus export opens and plays in a separate media player.
- [ ] WAV export opens and plays; duration and sample rate are sensible.
- [ ] Exported audio contains the applied effects, not the dry source.
- [ ] Stop capture, close Studio, close source tab, and uninstall/reload paths clean up capture and restore supported playback speed.
- [ ] Unsupported/protected pages display an accurate error and do not claim to be recording.
- [ ] Confirm no audio or tab metadata is sent over the network (for example, inspect DevTools Network while using the extension).
- [ ] Test at least two current Chromium browsers if claiming support for both; otherwise list Chrome only.

## Chrome Web Store upload
- [ ] Register a developer account and complete the one-time registration fee.
- [ ] Upload `chrome-web-store/universal-tab-audio-studio-1.0.2-cws.zip` (manifest.json is at ZIP root).
- [ ] Complete Store listing fields from `STORE_LISTING.md`.
- [ ] Complete Privacy practices and permission justifications accurately.
- [ ] Add the real privacy policy URL and a real support contact.
- [ ] Set distribution visibility and regions.
- [ ] Submit for review. Do not claim approval or set a release date before Google approves it.

## After publication
- [ ] Publish the source repository and tag `v1.0.2`.
- [ ] Link the Chrome Web Store listing from the GitHub README.
- [ ] Enable Issues and use issue templates or a clear bug-report format.
- [ ] Monitor review notices, user reports, and security issues.
- [ ] For every code update, increment the manifest version and upload a new ZIP.
