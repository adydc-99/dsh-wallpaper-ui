# dsh-wallpaper

A native standalone Cordis bundle that adds persistent image, GIF, and video wallpapers to the DeepSeek Harness Web UI.

## Requirements

- Node.js `^22.19.0 || >=24.0.0`
- A Web profile (the client contribution is browser-only)

| dsh-wallpaper | DeepSeek Harness |
|---|---|
| `0.1.x` | `0.1.0-rc.6` |

## Install from this checkout

```sh
pnpm install
pnpm build
cd ..
dsh plugin --profile web add ./dsh-wallpaper
dsh --profile web --dump-config
dsh --profile web
```

Run the `dsh plugin` command from the directory containing the checkout; the local package spec must point to the checkout rather than the profile directory.

To update a local checkout, pull the new version, rerun `pnpm install` and `pnpm build`, then restart DSH. For a registry-installed release, run:

```sh
dsh plugin --profile web update dsh-wallpaper
```

Open **Settings → Wallpaper**. Local uploads accept JPG, PNG, WebP, GIF, MP4, and WebM up to 100 MiB. Network entries accept only HTTP(S) URLs and are loaded directly by the browser; the Host does not download them.

Remove the bundle with:

```sh
dsh plugin --profile web remove dsh-wallpaper
```

Removing the plugin unregisters its routes, tools, settings entry, theme overrides, stylesheet, and document layer. The private wallpaper library remains under `$DSH_HOME/plugins/dsh-wallpaper/v1` unless the user deletes it manually.

Back up `$DSH_HOME/plugins/dsh-wallpaper/v1` to preserve the library and presentation settings.

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
- Mutating HTTP routes require a loopback connection and a same-origin `Origin` header.
- The model can call only `wallpaper_list` and `wallpaper_apply`. It cannot upload, add URLs, or delete entries.
- URL sources must use HTTP(S), cannot contain credentials, and are never downloaded by the Host.
- A failed video wallpaper resets presentation settings without affecting chat.

The remote wallpaper host sees normal browser request metadata, including the user's network address and referrer-policy-dependent headers. Browsers may block an `http://` wallpaper when DSH itself is served over HTTPS.

## Development

```sh
pnpm test
pnpm typecheck
pnpm build
pnpm pack --dry-run
```

See [README.zh.md](./README.zh.md) for Chinese documentation.
