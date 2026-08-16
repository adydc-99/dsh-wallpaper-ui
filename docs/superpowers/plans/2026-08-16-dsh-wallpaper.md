# DSH Wallpaper Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an independently installable Cordis bundle that adds a secure, persistent wallpaper library, DSH-native settings page, global image/GIF/video renderer, and two constrained model tools to DeepSeek Harness Web UI.

**Architecture:** One `dsh-wallpaper` npm package exposes a Host entry and a DSH Client factory bundle. The Host owns versioned storage, streamed upload validation, same-origin HTTP/SSE routes, media serving, and tools; the Client owns one shared controller, a `settings.section` contribution, and a lifecycle-mounted document-level renderer whose DSH surface transparency is applied through theme token overrides.

**Tech Stack:** TypeScript 6, Node `^22.19.0 || >=24`, pnpm 11, Cordis 4, DSH `0.1.0-rc.6`, React 18, CSS Modules/Lightning CSS, Vitest, Testing Library, Busboy, `file-type`, and `write-file-atomic`.

## Global Constraints

- Pin compatibility to `@deepseek-ai/dsh@0.1.0-rc.6`; document official source reference `47f943859bef60e4160492346772ded9b24f765a`.
- Support JPG, PNG, WebP, GIF, MP4, and WebM; local file size defaults to 100 MiB.
- Validate local extension, declared MIME, and magic bytes together; never derive storage paths from uploaded filenames.
- Accept remote sources only through `http:` or `https:` and never download them on the Host.
- Model tools are exactly `wallpaper_list` and `wallpaper_apply`; upload, URL creation, and deletion remain manual HTTP/UI operations.
- Preserve chat/navigation interaction on every media failure and on plugin unload.
- Exclude stores, scraping, schedules, playlists, and Agent-state wallpaper changes from v1.
- UI follows existing DSH semantic tokens, Chinese product copy, keyboard/focus accessibility, and reduced-motion behavior.

---

## File Structure

- `package.json`, `pnpm-lock.yaml`, `tsconfig.json`, `tsdown.config.ts`, `cordis.patch.yml` — standalone bundle/build/install contract.
- `src/contracts.ts` — JSON-safe records, presentation settings, defaults, bounds, and API payload types shared by Host and Client builds.
- `src/validation.ts` — durable schema parsing, URL validation, display-patch validation, and magic-byte admission.
- `src/service.ts` — serialized wallpaper state, atomic persistence, upload commit/delete/apply operations, and subscriptions.
- `src/http.ts` — loopback mutation fence, JSON/body helpers, Busboy streaming upload, static media, and SSE routes.
- `src/tools.ts` — only `wallpaper_list` and `wallpaper_apply` registrations.
- `src/index.ts` — Cordis config, private directory resolution, lifecycle assembly, and public Host exports.
- `src/client/controller.ts` — same-origin HTTP/SSE controller with stable snapshots.
- `src/client/WallpaperRenderer.tsx` — document-level image/GIF/video layer, fallback, reduced motion, and playback controls.
- `src/client/WallpaperSection.tsx` — library, upload, URL dialog, controls, confirmation, and feedback.
- `src/client/index.ts` — locale/theme/slot registration and shared controller wiring.
- `src/client/*.module.css`, `src/css-modules.d.ts` — DSH-native component styling.
- `tests/*.spec.ts(x)` — Host, component, build, and assembled smoke coverage.
- `README.md`, `README.zh.md`, `CHANGELOG.md`, `LICENSE` — install/update/uninstall/privacy/compatibility documentation.

### Task 1: Standalone Cordis/Client Bundle Skeleton

**Files:**
- Create: `package.json`, `tsconfig.json`, `tsdown.config.ts`, `cordis.patch.yml`, `src/index.ts`, `src/client/index.ts`, `src/css-modules.d.ts`
- Test: `tests/package-contract.spec.ts`

**Interfaces:**
- Produces Host export `apply(ctx: Context, config: Config): Promise<void>` and browser export `apply(ctx: ClientContext): void`.
- Produces `lib/index.js`, `lib/client.js`, and `lib/types/**` with `dsh.bundle` and `dsh.client` manifests.

- [ ] **Step 1: Write the failing package-contract test**

```ts
import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('package contract', () => {
  it('declares one bundle layer and one web client entry', async () => {
    const pkg = JSON.parse(await readFile('package.json', 'utf8'))
    expect(pkg.dsh).toEqual({
      bundle: { patch: './cordis.patch.yml' },
      client: expect.objectContaining({ platform: 'web' }),
    })
    expect(pkg.exports['./client'].default).toBe('./lib/client.js')
  })
})
```

- [ ] **Step 2: Run it and verify RED**

Run: `pnpm vitest run tests/package-contract.spec.ts`
Expected: FAIL because `package.json` does not yet contain the bundle/client contract.

- [ ] **Step 3: Add the minimal package/build contract**

```json
{
  "name": "dsh-wallpaper",
  "version": "0.1.0",
  "type": "module",
  "main": "lib/index.js",
  "exports": {
    ".": { "types": "./lib/types/index.d.ts", "default": "./lib/index.js" },
    "./client": { "types": "./lib/types/client/index.d.ts", "default": "./lib/client.js" },
    "./package.json": "./package.json"
  },
  "files": ["lib", "cordis.patch.yml", "README.md", "README.zh.md", "LICENSE", "CHANGELOG.md"],
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" },
    "client": {
      "platform": "web",
      "inject": ["@deepseek-ai/dsh-client-runtime", "@deepseek-ai/dsh-client-ui-settings", "@deepseek-ai/dsh-client-ui-layout", "@deepseek-ai/dsh-client-ui-theme"]
    }
  }
}
```

`cordis.patch.yml`:

```yaml
- insert:
    - id: dsh-wallpaper
      name: dsh-wallpaper
```

The client build must wrap its CJS output with:

```ts
banner: 'window.__ModuleLoader__.load({ id: "dsh-wallpaper", factory: (require) => {',
footer: 'return module.exports; } });',
intro: 'var module = { exports: {} }; var exports = module.exports;',
```

- [ ] **Step 4: Install, build, and verify GREEN**

Run: `pnpm install && pnpm run build && pnpm vitest run tests/package-contract.spec.ts`
Expected: PASS; `lib/index.js`, `lib/client.js`, and declarations exist.

- [ ] **Step 5: Commit**

```sh
git add package.json pnpm-lock.yaml tsconfig.json tsdown.config.ts cordis.patch.yml src tests/package-contract.spec.ts
git commit -m "build: scaffold standalone dsh wallpaper bundle"
```

### Task 2: State Contracts and Boundary Validation

**Files:**
- Create: `src/contracts.ts`, `src/validation.ts`
- Test: `tests/validation.spec.ts`

**Interfaces:**
- Produces `WallpaperRecord`, `PresentationSettings`, `WallpaperState`, `DisplayPatch`, `DEFAULT_PRESENTATION`, `parseState`, `validateDisplayPatch`, `validateRemoteUrl`, and `validateUploadHeader`.
- Consumed by Tasks 3–7.

- [ ] **Step 1: Write failing validation tests**

```ts
it.each([
  ['photo.jpg', 'image/jpeg', jpegHeader, 'image/jpeg'],
  ['loop.gif', 'image/gif', gifHeader, 'image/gif'],
  ['clip.webm', 'video/webm', webmHeader, 'video/webm'],
])('admits matching extension, MIME, and signature', async (name, mime, bytes, expected) => {
  await expect(validateUploadHeader({ name, declaredMime: mime, bytes })).resolves.toEqual(expect.objectContaining({ mime: expected }))
})

it('rejects a PNG renamed to JavaScript', async () => {
  await expect(validateUploadHeader({ name: 'payload.js', declaredMime: 'image/png', bytes: pngHeader })).rejects.toThrow(/extension/i)
})

it.each(['file:///tmp/a.png', 'javascript:alert(1)', 'data:image/png;base64,x'])('rejects non-http URLs', (value) => {
  expect(() => validateRemoteUrl(value)).toThrow(/http/i)
})

it('rejects an out-of-range tool patch without partial mutation', () => {
  expect(() => validateDisplayPatch({ opacity: 1.1 })).toThrow(/opacity/i)
})
```

- [ ] **Step 2: Run and verify RED**

Run: `pnpm vitest run tests/validation.spec.ts`
Expected: FAIL because validation exports do not exist.

- [ ] **Step 3: Implement strict contracts and defaults**

```ts
export const DEFAULT_PRESENTATION = Object.freeze({
  enabled: false,
  selectedId: null,
  fit: 'cover',
  opacity: 0.72,
  brightness: 1,
  blurPx: 0,
  overlayColor: '#000000',
  overlayOpacity: 0.18,
  panelOpacity: 0.86,
  muted: true,
  playbackRate: 1,
}) satisfies PresentationSettings
```

Use `fileTypeFromBuffer()` and require the detected MIME to match both the extension table and declared MIME. Bound opacity/brightness/overlay/panel to `[0,1]`, blur to `[0,40]`, playback rate to `[0.25,2]`, and fit to `cover|contain|stretch|center|tile`.

- [ ] **Step 4: Run and verify GREEN**

Run: `pnpm vitest run tests/validation.spec.ts`
Expected: PASS with every supported format and mismatch case covered.

- [ ] **Step 5: Commit**

```sh
git add src/contracts.ts src/validation.ts tests/validation.spec.ts
git commit -m "feat: validate wallpaper state and media boundaries"
```

### Task 3: Persistent Wallpaper Service

**Files:**
- Create: `src/service.ts`
- Test: `tests/service.spec.ts`

**Interfaces:**
- Produces class `WallpaperService` with `init()`, `snapshot()`, `subscribe(listener)`, `commitUpload(input)`, `addRemote(input)`, `delete(id)`, `applyExisting(id, patch)`, `updatePresentation(patch)`, `resetPresentation()`, `resolveMedia(id)`, and `dispose()`.
- Writes `<root>/config.json` and `<root>/media/<generated-id>.<fixed-ext>`.

- [ ] **Step 1: Write failing persistence/deletion tests**

```ts
it('persists an added URL across a new service instance', async () => {
  const first = await makeService(root)
  const added = await first.addRemote({ name: '远程背景', url: 'https://example.test/a.webp', mediaType: 'image/webp' })
  await first.dispose()
  const second = await makeService(root)
  expect(second.snapshot().wallpapers.map(item => item.id)).toContain(added.id)
})

it('disables before deleting the active wallpaper', async () => {
  const service = await makeService(root)
  const item = await seedUpload(service)
  await service.applyExisting(item.id, { enabled: true })
  await service.delete(item.id)
  expect(service.snapshot().presentation).toMatchObject({ enabled: false, selectedId: null })
})
```

- [ ] **Step 2: Run and verify RED**

Run: `pnpm vitest run tests/service.spec.ts`
Expected: FAIL because `WallpaperService` is missing.

- [ ] **Step 3: Implement serialized atomic state changes**

Use a promise queue so each mutation computes one next immutable state, writes with `write-file-atomic`, then publishes. Parse startup JSON with `parseState`; corrupt JSON logs a warning and activates defaults without deleting media. Generate IDs with `randomUUID()` and only resolve paths from owned records.

- [ ] **Step 4: Run and verify GREEN**

Run: `pnpm vitest run tests/service.spec.ts`
Expected: PASS for restart, corruption fallback, write failure preservation, containment, delete, and subscriptions.

- [ ] **Step 5: Commit**

```sh
git add src/service.ts tests/service.spec.ts
git commit -m "feat: persist wallpaper library atomically"
```

### Task 4: Streamed HTTP, Media, and SSE Surface

**Files:**
- Create: `src/http.ts`
- Test: `tests/http.spec.ts`

**Interfaces:**
- Produces `registerWallpaperRoutes(ctx, service, options): () => void` at prefix `/dsh-wallpaper`.
- Routes: `GET /api/state`, `PATCH /api/presentation`, `POST /api/reset`, `POST /api/urls`, `POST /api/uploads`, `POST /api/wallpapers/:id/activate`, `DELETE /api/wallpapers/:id`, `GET /media/:id`, `GET /events`.

- [ ] **Step 1: Write failing HTTP/security tests**

```ts
it('rejects a declared image whose streamed signature is JavaScript', async () => {
  const response = await upload(server, { name: 'fake.png', mime: 'image/png', body: Buffer.from('<script>') })
  expect(response.status).toBe(415)
  expect((await serviceFiles(root)).media).toEqual([])
})

it('rejects mutation requests with a foreign Origin', async () => {
  const response = await request(server, '/dsh-wallpaper/api/urls', { method: 'POST', origin: 'https://evil.test' })
  expect(response.status).toBe(403)
})

it('emits the same state revision to SSE after a service change', async () => {
  const event = nextEvent('/dsh-wallpaper/events')
  await service.updatePresentation({ opacity: 0.5 })
  expect(await event).toMatchObject({ presentation: { opacity: 0.5 } })
})
```

- [ ] **Step 2: Run and verify RED**

Run: `pnpm vitest run tests/http.spec.ts`
Expected: FAIL because routes are missing.

- [ ] **Step 3: Implement the smallest complete HTTP surface**

Use Busboy with `files: 1` and `fileSize: uploadLimitBytes`, stream to a generated `.uploading` file, retain only the header bytes needed by `file-type`, validate before `commitUpload`, and remove the temporary file on every failure/abort. Mutations require loopback plus same-origin; state/media/SSE remain readable by the served Web client. Return localized JSON errors and `Cache-Control: no-store` for state.

- [ ] **Step 4: Run and verify GREEN**

Run: `pnpm vitest run tests/http.spec.ts`
Expected: PASS for size limits, early disconnect cleanup, all signatures, URL schemes, static media headers, SSE teardown, and method/path errors.

- [ ] **Step 5: Commit**

```sh
git add src/http.ts tests/http.spec.ts
git commit -m "feat: expose secure wallpaper web routes"
```

### Task 5: Cordis Bootstrap and Constrained Model Tools

**Files:**
- Create: `src/tools.ts`
- Modify: `src/index.ts`
- Test: `tests/tools.spec.ts`, `tests/plugin.spec.ts`

**Interfaces:**
- `registerWallpaperTools(ctx, service): () => void` registers only `wallpaper_list` and `wallpaper_apply`.
- Cordis config fields: `dshHome?: string`, `uploadLimitBytes: number` default `104857600`.

- [ ] **Step 1: Write failing tool permission tests**

```ts
it('registers only list and apply tools', async () => {
  const names = await mountedToolNames()
  expect(names.filter(name => name.startsWith('wallpaper_'))).toEqual(['wallpaper_apply', 'wallpaper_list'])
})

it('applies an existing id and rejects an unknown id atomically', async () => {
  await expect(callApply({ wallpaperId: 'missing', opacity: 0.4 })).rejects.toThrow(/unknown/i)
  expect(service.snapshot()).toEqual(before)
})
```

- [ ] **Step 2: Run and verify RED**

Run: `pnpm vitest run tests/tools.spec.ts tests/plugin.spec.ts`
Expected: FAIL because tools/bootstrap are not assembled.

- [ ] **Step 3: Register the narrow tool schemas**

```ts
ctx.tools.register(defineTool({
  name: 'wallpaper_list',
  description: 'List existing wallpapers without exposing local file paths.',
  parameters: {},
  output: { schema: { type: 'array', items: PUBLIC_WALLPAPER_SCHEMA }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
  async execute() { return service.listPublic() },
}))
```

`wallpaper_apply` accepts an optional existing ID plus bounded optional presentation fields. It never accepts a URL, path, file, delete flag, or upload data.

- [ ] **Step 4: Run and verify GREEN**

Run: `pnpm vitest run tests/tools.spec.ts tests/plugin.spec.ts`
Expected: PASS, including unload disposal and missing-service failure.

- [ ] **Step 5: Commit**

```sh
git add src/index.ts src/tools.ts tests/tools.spec.ts tests/plugin.spec.ts
git commit -m "feat: register safe wallpaper model tools"
```

### Task 6: Shared Client Controller and Global Renderer

**Files:**
- Create: `src/client/controller.ts`, `src/client/WallpaperRenderer.tsx`, `src/client/WallpaperRenderer.module.css`
- Modify: `src/client/index.ts`
- Test: `tests/controller.client.spec.ts`, `tests/renderer.client.spec.tsx`

**Interfaces:**
- `WallpaperController` exposes stable `getSnapshot()`, `subscribe()`, `load()`, mutation methods, and `dispose()`.
- Renderer receives `useWallpaper`, `theme`, and `reportFailure`; it never intercepts pointer input.

- [ ] **Step 1: Write failing renderer/controller tests**

```tsx
it('falls back after video error without covering app interaction', () => {
  render(<WallpaperRenderer {...propsFor(videoState)} />)
  fireEvent.error(screen.getByTestId('wallpaper-video'))
  expect(screen.queryByTestId('wallpaper-video')).not.toBeInTheDocument()
  expect(screen.getByRole('status')).toHaveTextContent('视频背景加载失败')
})

it('pauses animated media when reduced motion is requested', () => {
  matchMediaMock.matches = true
  render(<WallpaperRenderer {...propsFor(videoState)} />)
  expect(screen.getByTestId('wallpaper-video')).toHaveAttribute('data-reduced-motion', 'true')
})
```

- [ ] **Step 2: Run and verify RED**

Run: `pnpm vitest run tests/controller.client.spec.ts tests/renderer.client.spec.tsx`
Expected: FAIL because client controller/renderer are missing.

- [ ] **Step 3: Implement renderer lifecycle and transparency**

Mount the renderer from an additive `shell.overlay` entry, portal the fixed media host to `document.body`, give it `pointer-events: none`, and ensure DSH root content stays above it. Apply and dispose theme override layers for `--dsw-alias-bg-base`, `--dsw-alias-bg-layer-1`, `--dsw-alias-bg-layer-2`, and `--dsw-specific-sidebar-fill` using the current `panelOpacity`. Images/GIFs use `<img>`; videos are looped, inline, muted according to state, and update `playbackRate` in an effect.

- [ ] **Step 4: Run and verify GREEN**

Run: `pnpm vitest run tests/controller.client.spec.ts tests/renderer.client.spec.tsx`
Expected: PASS for image/GIF/video switching, fit modes, SSE updates, error fallback, reduced motion, click-through, and disposal restoration.

- [ ] **Step 5: Commit**

```sh
git add src/client tests/controller.client.spec.ts tests/renderer.client.spec.tsx
git commit -m "feat: render persistent global wallpapers"
```

### Task 7: DSH-Native Wallpaper Settings Page

**Files:**
- Create: `src/client/WallpaperSection.tsx`, `src/client/WallpaperSection.module.css`, `src/client/locales.ts`
- Modify: `src/client/index.ts`
- Test: `tests/settings.client.spec.tsx`, `tests/accessibility.client.spec.tsx`

**Interfaces:**
- Registers `settings.section` with `{ id: 'wallpaper', order: 20, label: () => '壁纸' }`.
- Uses only controller methods for manual mutations; model-tool permissions remain unchanged.

- [ ] **Step 1: Write failing user-flow tests**

```tsx
it('warns about remote privacy before adding an HTTP URL', async () => {
  render(<WallpaperSection {...props} />)
  await user.click(screen.getByRole('button', { name: '添加 URL' }))
  expect(screen.getByText(/IP 地址和浏览器信息/)).toBeVisible()
  await user.type(screen.getByLabelText('壁纸 URL'), 'https://example.test/bg.webp')
  await user.click(screen.getByRole('button', { name: '保存 URL' }))
  expect(controller.addRemote).toHaveBeenCalledWith(expect.objectContaining({ url: 'https://example.test/bg.webp' }))
})

it('requires confirmation before manual deletion', async () => {
  render(<WallpaperSection {...propsWithOneWallpaper} />)
  await user.click(screen.getByRole('button', { name: '删除 海边' }))
  expect(controller.delete).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: '确认删除' }))
  expect(controller.delete).toHaveBeenCalledWith('wallpaper-1')
})
```

- [ ] **Step 2: Run and verify RED**

Run: `pnpm vitest run tests/settings.client.spec.tsx tests/accessibility.client.spec.tsx`
Expected: FAIL because the settings section is missing.

- [ ] **Step 3: Implement the page from the page override**

Build the responsive card grid, native file input, URL dialog, enable/select/delete actions, labelled sliders/selects/color input, video-only controls, reset action, pending feedback, and selected-state text. Use inline error messages and accessible SVG icons; reserve 16:9 preview space and avoid external fonts/components.

- [ ] **Step 4: Run and verify GREEN**

Run: `pnpm vitest run tests/settings.client.spec.tsx tests/accessibility.client.spec.tsx`
Expected: PASS for empty/loading/error states, keyboard use, labels, selected state, reset, video-only controls, URL warning, and delete confirmation.

- [ ] **Step 5: Commit**

```sh
git add src/client tests/settings.client.spec.tsx tests/accessibility.client.spec.tsx
git commit -m "feat: add wallpaper settings experience"
```

### Task 8: Documentation, Pack, and Compatibility Smoke

**Files:**
- Create: `README.md`, `README.zh.md`, `CHANGELOG.md`, `LICENSE`, `tests/packed-install.spec.ts`
- Modify: `package.json`

**Interfaces:**
- Documents `dsh plugin --profile web add <package-or-tarball>`, update/remove, 100 MiB limit, remote privacy, AI permissions, and DSH compatibility.

- [ ] **Step 1: Write the failing packed-install test**

```ts
it('packs every runtime artifact and no private source/config data', async () => {
  const files = await packFileList()
  expect(files).toEqual(expect.arrayContaining(['package/lib/index.js', 'package/lib/client.js', 'package/cordis.patch.yml', 'package/README.md', 'package/README.zh.md']))
  expect(files.some(file => file.includes('config.json') || file.includes('/media/'))).toBe(false)
})
```

- [ ] **Step 2: Run and verify RED**

Run: `pnpm vitest run tests/packed-install.spec.ts`
Expected: FAIL until docs/license/pack metadata exist.

- [ ] **Step 3: Write bilingual operational documentation**

Include exact compatibility table `dsh-wallpaper 0.1.x ↔ DSH 0.1.0-rc.6`, install/update/uninstall commands, local/URL threat model, remote host disclosure warning, backup path label (`$DSH_HOME/plugins/dsh-wallpaper/v1`), and manual-vs-AI permission table.

- [ ] **Step 4: Pack and verify GREEN**

Run: `pnpm run build && pnpm pack --pack-destination .artifacts && pnpm vitest run tests/packed-install.spec.ts`
Expected: PASS and one installable `.tgz` under `.artifacts/`.

- [ ] **Step 5: Commit**

```sh
git add README.md README.zh.md CHANGELOG.md LICENSE package.json tests/packed-install.spec.ts
git commit -m "docs: document wallpaper plugin distribution"
```

### Task 9: Full Verification and Uninstall Safety

**Files:**
- Create: `tests/fixtures/*` only when the smoke harness needs deterministic media.
- Modify: code/tests only for failures reproduced by a new failing test.

**Interfaces:**
- Produces release evidence and no new runtime API.

- [ ] **Step 1: Run static and unit gates**

Run: `pnpm run typecheck && pnpm run lint && pnpm vitest run --coverage && pnpm run build`
Expected: exit 0; no TypeScript/lint errors; coverage gate satisfied for owned source.

- [ ] **Step 2: Run package and profile smoke**

Run: install the packed tarball into a temporary DSH `0.1.0-rc.6` profile, `dsh --profile <temp> --dump-config`, start `dsh web`, and verify Host/plugin/client activation.
Expected: bundle layer and `dsh-wallpaper` row appear, settings section loads, and no client loader diagnostic occurs.

- [ ] **Step 3: Run browser acceptance paths**

Verify at 375/768/1024/1440 px: upload each supported format, add URL, switch image→GIF→MP4→WebM, change every display setting, reload, restart, call both tools, force media error, and confirm underlying chat controls remain clickable.
Expected: persisted state, live tool synchronization, reduced-motion fallback, safe default on decode error, no horizontal scroll, and no blocked pointer input.

- [ ] **Step 4: Verify uninstall safety**

Run: `dsh plugin --profile <temp> remove dsh-wallpaper`, dump config, restart Web UI, and open chat/settings.
Expected: no wallpaper row/client module/route remains; DSH Web UI works normally; plugin-private data remains user-removable and is not read.

- [ ] **Step 5: Commit final test-only corrections**

```sh
git add .
git commit -m "test: verify dsh wallpaper release paths"
```

## Self-Review

- Spec coverage: library, formats, five fit modes, all adjustments, persistence, secure local validation, HTTP(S)-only remote sources, non-blocking fallback, AI permissions, switching, restart, and uninstall are each assigned to a task.
- Deferred v1 exclusions remain absent.
- Shared names are consistent: `WallpaperService`, `WallpaperController`, `PresentationSettings`, `DisplayPatch`, `wallpaper_list`, `wallpaper_apply`, `/dsh-wallpaper`.
- No upload/delete/add-URL parameter is present in `wallpaper_apply`.
