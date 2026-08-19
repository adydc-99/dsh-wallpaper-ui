# Changelog

## 0.1.2 — 2026-08-18

- "Restore defaults" now keeps the current wallpaper selection and only resets display settings, instead of disabling the wallpaper.
- Lowered the default panel opacity from 0.86 to 0.4 so wallpapers are clearly visible out of the box.
- Broadened panel background token overrides for newer Harness theme variants.
- Explicitly apply video mute and start playback to avoid browser autoplay gate races.

## 0.1.1 — 2026-08-18

- Fixed the browser client failing to initialize because the native `fetch` function lost its required Window receiver.
- Added a regression test for the native browser fetch invocation contract.

## 0.1.0 — 2026-08-16

- Added the standalone Cordis Host and Web client bundle.
- Added persistent upload and HTTP(S) wallpaper libraries for six media formats.
- Added five fit modes and image/video presentation controls.
- Added same-origin streaming routes, MIME/signature validation, and a 100 MiB limit.
- Added the constrained `wallpaper_list` and `wallpaper_apply` model tools.
- Added clean client/Host lifecycle disposal and automated coverage for persistence, security, switching, and uninstall behavior.
