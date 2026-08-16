# dsh-wallpaper

A native standalone Cordis bundle that adds persistent image, GIF, and video wallpapers to the DeepSeek Harness Web UI.

## Requirements

- DeepSeek Harness `0.1.0-rc.6`
- Node.js `^22.19.0 || >=24.0.0`
- A Web profile (the client contribution is browser-only)

## Install from this checkout

```sh
pnpm install
pnpm build
dsh plugin --profile web add .
dsh --profile web --dump-config
dsh --profile web
```

Open **Settings → Wallpaper**. Local uploads accept JPG, PNG, WebP, GIF, MP4, and WebM up to 100 MiB. Network entries accept only HTTP(S) URLs and are loaded directly by the browser; the Host does not download them.

Remove the bundle with:

```sh
dsh plugin --profile web remove dsh-wallpaper
```

Removing the plugin unregisters its routes, tools, settings entry, theme overrides, stylesheet, and document layer. The private wallpaper library remains under `$DSH_HOME/plugins/dsh-wallpaper/v1` unless the user deletes it manually.

## Security model

- Uploads are streamed into a plugin-private temporary directory and admitted only when extension, declared MIME type, and detected file signature agree.
- Mutating HTTP routes require a loopback connection and a same-origin `Origin` header.
- The model can call only `wallpaper_list` and `wallpaper_apply`. It cannot upload, add URLs, or delete entries.
- URL sources must use HTTP(S), cannot contain credentials, and are never downloaded by the Host.
- A failed video wallpaper resets presentation settings without affecting chat.

## Development

```sh
pnpm test
pnpm typecheck
pnpm build
pnpm pack --dry-run
```

See [README.zh.md](./README.zh.md) for Chinese documentation.

