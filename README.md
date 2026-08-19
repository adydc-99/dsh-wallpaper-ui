# dsh-wallpaper-ui

[![npm version](https://img.shields.io/npm/v/dsh-wallpaper-ui)](https://www.npmjs.com/package/dsh-wallpaper-ui)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Persistent **image, GIF, and video wallpapers** for the **DeepSeek Harness** Web UI — a native standalone Cordis plugin.

Out of the box: upload a picture or video, select it, and the wallpaper is immediately visible — the default panel opacity is tuned so you never have to fiddle with sliders.

## Features

- Image / GIF / video wallpapers (JPG, PNG, WebP, GIF, MP4, WebM)
- Five fit modes: cover, contain, stretch, center, tile
- Local upload **and** HTTP(S) URL sources
- Display controls: wallpaper opacity, brightness, blur, overlay color, panel opacity
- Works with DeepSeek Harness `0.1.0-rc.6` and `0.1.0-rc.7`

## Install

From the npm registry (recommended):

```sh
dsh plugin add dsh-wallpaper-ui
```

From GitHub:

```sh
dsh plugin add https://github.com/adydc-99/dsh-wallpaper.git
```

From this checkout (development):

```sh
pnpm install
pnpm build
cd ..
dsh plugin --profile web add ./dsh-wallpaper
dsh --profile web
```

Update a registry-installed release:

```sh
dsh plugin --profile web update dsh-wallpaper-ui
```

Remove:

```sh
dsh plugin --profile web remove dsh-wallpaper-ui
```

## Screenshots

<!-- TODO: add screenshots of the wallpaper in action and the settings panel -->

## Usage

1. Open **Settings → Wallpaper**.
2. Upload an image / GIF / video, or add an HTTP(S) URL.
3. Select the wallpaper entry — it becomes active immediately.
4. Adjust display settings as you like (wallpaper opacity, panel opacity, fit mode, etc.).

Local uploads accept JPG, PNG, WebP, GIF, MP4, and WebM up to 100 MiB.

## Compatibility

| Plugin | DeepSeek Harness |
|---|---|
| `0.1.x` | `0.1.0-rc.6` / `0.1.0-rc.7` |

## Manual and AI permissions

| Operation | User in Settings | AI tools |
|---|:---:|:---:|
| List existing wallpapers | Yes | Yes |
| Enable an existing wallpaper | Yes | Yes |
| Adjust display settings | Yes | Yes |
| Upload a file | Yes | No |
| Add a URL | Yes | No |
| Delete a wallpaper | Yes | No |

## Security model

- Uploads are streamed into a plugin-private temporary directory and admitted only when extension, declared MIME type, and detected file signature agree.
- Every plugin route accepts only a literal loopback Host over a loopback connection; mutating routes additionally require a matching same-origin `Origin` header. Access DSH through `localhost`, `127.0.0.1`, or `[::1]` when this plugin is enabled.
- The model can call only `wallpaper_list` and `wallpaper_apply`. It cannot upload, add URLs, or delete entries.
- URL sources must use HTTP(S), cannot contain credentials, and are never downloaded by the Host.
- A failed video wallpaper resets display settings without affecting chat.

The remote wallpaper host sees normal browser request metadata, including the user's network address and referrer-policy-dependent headers. Browsers may block an `http://` wallpaper when DSH itself is served over HTTPS.

## Development

```sh
pnpm test
pnpm typecheck
pnpm build
pnpm pack --dry-run
```

See [README.zh.md](./README.zh.md) for Chinese documentation.
