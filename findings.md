# DSH Wallpaper Plugin Findings

## Confirmed Requirements
- Native standalone Cordis plugin with a DSH settings/plugin page named “壁纸”.
- Library cards support upload, URL addition, activation, and deletion.
- Media: JPG, PNG, WebP, GIF, MP4, WebM.
- Display modes: cover, contain, stretch, center, tile.
- Controls: opacity, brightness, blur, mask color, video mute and playback speed, plus panel transparency.
- Plugin-private persistence across refresh/restart.
- Local uploads: 100 MB default limit and MIME plus magic-byte validation.
- URLs: HTTP(S) only and client-loaded by default.
- Failed videos fall back safely without affecting chat.
- AI may list/enable existing wallpapers and adjust parameters; upload, URL addition, and deletion are manual-only.

## Repository Discoveries
- Current workspace is a new Git repository on `master` with no commits and only the three planning files.
- The approved specification is external at `C:\Users\34845\smartdoc\docs\superpowers\specs\2026-08-16-dsh-wallpaper-plugin-design.md` (8,815 bytes).
- The spec targets the official `deepseek-ai/deepseek-harness` developer preview and requires confirming manifest/registry conventions against a pinned Harness version.
- The official repository is live at `https://github.com/deepseek-ai/deepseek-harness`, uses TypeScript/pnpm, is on `master`, and describes itself as “Everything is a Plugin.”
- Official README run path: `npx @deepseek-ai/dsh web`; source path: `pnpm install`, `pnpm run build`, `pnpm dsh web`.
- The repository is explicitly a developer preview with compatibility-breaking changes; latest GitHub page metadata seen on 2026-08-16 says it was updated 2026-08-13.
- Official discovery convention is the `dsh-plugin` GitHub topic.
- Pinned reference checkout: commit `47f943859bef60e4160492346772ded9b24f765a` (`0.1.0-rc.5`, 2026-08-13).
- Compatibility floor from the pinned root package: Node `^22.19.0 || >=24.0.0`, pnpm `11.7.0`, ESM, strict TypeScript.
- Standalone packages install through `dsh plugin --profile <name> add <package-or-git-spec>` and contribute a declared `cordis.patch.yml` layer; the older `.dsh-plugin` repository manifest format was removed on 2026-08-09.
- A package without `dsh.bundle` installs only as a dependency and activates no layer.
- UI plugins declare `dsh.client`, export `./client`, and self-register features into typed client slots; settings pages use `settings.section`.
- Harness ships an internal `cordis-plugin-development` authoring skill that documents host/client/tool patterns; it is the next authoritative source to read.
- A plugin is an ESM module exporting `apply(ctx, config?)`; required services are declared through `inject`.
- Cordis owns cleanup for context lifecycle registrations; other resources must use `ctx.effect()` and return a disposer.
- Host↔client package-private JSON RPC uses `harness.handle(method, handler)` and `host.call(method, args)`; no public Remote Service is needed for private UI calls.
- Client UI composes through typed slots; use `slots.inject('settings.section', ...)` before `slots.register(...)` because apply order is unconstrained.
- `settings.section` is a root-scoped list slot with `{ id, order, label }` registration metadata and only a `close()` owner prop.
- Frame-wide overlays target `shell.overlay`; its exact ordering and pointer-event contract still needs source inspection.
- UI source uses CSS Modules, semantic `--dsw-*` variables, visible keyboard focus, reduced-motion handling, Chinese product copy, and English code comments.
- Model tools use `defineTool` from `@deepseek-ai/dsh-tools`; canonical values are rendered separately to model-facing content.
- Git installs require an allowlisted `prepare` build; npm or tarball distribution can ship prebuilt artifacts.
- The official `webServer` service accepts exact/prefix `WebRoute` entries and owns the full Node `IncomingMessage`/`ServerResponse` lifecycle; direct streaming upload/media routes are feasible without buffering 100 MB in JSON RPC.
- The Harness home resolver is public as `@deepseek-ai/dsh-home-paths`; the single user-data root is explicit config, `$DSH_HOME`, then `~/.dsh`.
- Existing per-domain storage conventions use subdirectories under the Harness home (for example `attachments/v1`), so the plugin can default to `plugins/dsh-wallpaper/v1` while allowing `dshHome` configuration.
- `shell.overlay` is an additive frame-wide list slot, but its parent is a `z-index: 20` click-through overlay above all columns; it is unsuitable for a true bottom wallpaper without an additional behind-root placement technique.
- The theme service can override base/layer/sidebar tokens with required light/dark pairs, allowing the plugin to make DSH surfaces translucent without hardcoded product DOM selectors.
- A UI-mounted entry can explicitly keep `pointer-events: none`; the shell overlay otherwise opts each direct child back into pointer events.
- Pinned source package version is `0.1.0-rc.5`, while queried npm packages currently report `0.0.1-rc.1` (home-paths `0.0.1-rc.3`); published compatibility must be checked before choosing dependency ranges.
- Published app is `@deepseek-ai/dsh@0.1.0-rc.6`; DSH plugin APIs expose `0.1.0-rc.6` on their `next` tags even when their `latest` tags still point at early `0.0.1` prereleases.
- The official GitHub `master` remains commit `47f9438` with source version `0.1.0-rc.5`; npm `rc.6` is ahead of the public source version marker, so the package will pin exact `0.1.0-rc.6` runtime interfaces and document the reference commit separately.
- UI/UX search reinforced keyboard access, visible focus, reduced motion, controlled forms, accessible Testing Library queries, and 375/768/1024/1440 responsive checks.
- The generated generic design-system style/palette is not suitable for a feature inside DSH. Existing DSH layout, typography, semantic tokens, and icon conventions take precedence; only the accessibility/density guidance is retained.
- Browser plugin artifacts are not ordinary ESM: they must register a CommonJS factory with `window.__ModuleLoader__.load({ id, factory })` and resolve shared platform modules from the loader table.
- Shared browser externals include React/ReactDOM, Cordis, UI slots, Web React binding, UI primitives, attachments, and schema form; `@deepseek-ai/dsh-client-runtime/client` is also external.
- CSS Modules in official packages are compiled with Lightning CSS and auto-injected as plugin-owned `<style>` tags; the standalone build must reproduce that behavior or provide equally safe teardown.
- The bottom-layer plan will mount through additive `shell.overlay` only for lifecycle, portal/render the media at document level, and use theme-token overrides for translucent Harness surfaces. Automated browser verification must prove z-order and click-through behavior.
- Host/client communication will use same-origin HTTP plus SSE because compiled standalone packages do not receive the dynamic-package-only `host.call`/`harness.handle` facade and uploads must stream rather than base64-buffer 100 MB.
- `defineTool` supports strict enum/boolean/array/object schemas and separate canonical JSON output rendering, sufficient for the two narrow model tools.
- Local Node is `22.16.0`, below both DSH's `22.19.0` floor and tsdown's native-TypeScript threshold. On this host tsdown selects its optional `unrun` config loader; a self-contained git `prepare` therefore needs `unrun` explicitly in dev dependencies even though supported DSH hosts can use native loading.

## Architecture From Approved Spec
- One Cordis package: manifest/bootstrap, wallpaper service, settings UI, and global renderer.
- Service owns validation, metadata, persistence, file operations, and event publication.
- Model surface is exactly `wallpaper_list` and `wallpaper_apply`; no MCP server.
- Atomic versioned JSON, generated upload paths, corruption fallback, and active-wallpaper-safe deletion are required.

## Errors
- A targeted read assumed `ui-settings-models/src/client/apply.ts`; that file does not exist. Enumerate package files before future targeted reads.
- The official publishing guide links `deepseek-harness/turtle-ui` as a standalone reference, but Git clone reset and direct GitHub/raw URLs returned 404 on 2026-08-16. The plan must rely on the in-tree package/bundle contracts unless the example reappears.
