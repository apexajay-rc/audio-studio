# Changelog

## 1.0.2 — 2026-11-26
- Hardened capture handoff by waiting for the Studio consumer tab to commit before creating the stream ID.
- Delivered the short-lived stream ID through Chrome session storage without a second Studio navigation.
- Improved capture diagnostics to retain the browser error name and current capture state.

## 1.0.1
- Waited for the Studio consumer tab URL to commit before requesting the tab-capture stream ID.

## 1.0.0
- Initial complete tab audio capture, real-time effects, and local export package.
