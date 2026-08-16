# DSH Wallpaper Plugin Work Plan

## Goal
Build the approved native Cordis standalone `dsh-wallpaper` plugin, including secure wallpaper management, persistent configuration, Web UI controls, constrained AI tools, and automated tests.

## Phases
- [x] Phase 1 — Recover context, inspect the approved spec, and map the DSH/Cordis plugin conventions.
- [x] Phase 2 — Write the detailed implementation plan under `docs/superpowers/plans/`.
- [x] Phase 3 — Prepare an isolated plugin workspace and verify the baseline.
- [x] Phase 4 — Implement backend persistence, validation, routes, and AI tool permissions with TDD.
- [x] Phase 5 — Implement and integrate the wallpaper settings UI and global background layer with TDD.
- [x] Phase 6 — Run security, switching, persistence, build, uninstall-safety, and UI verification.
- [ ] Phase 7 — Review the completed branch and present integration options. *(in progress)*

## Decisions
- The approved design is authoritative; no online store, scraping, schedules, or Agent-state switching in v1.
- Use inline execution in this session because the user asked to begin and no subagent workflow was requested.

## Errors Encountered
| Error | Attempt | Resolution |
|---|---:|---|
| Bundled `rg.exe` could not start on this Windows installation (`Access denied` / stderr encoding error). | 1 | Switched to Git-native file listing/search and targeted PowerShell reads. |
| Targeted source read used a guessed `ui-settings-models/src/client/apply.ts` path. | 1 | Recorded the miss and will enumerate tracked package files before reading implementation paths. |
| First findings patch used a section-order assumption and did not apply. | 1 | Re-read the planning files and applied a context-accurate patch. |
| Guide-linked `deepseek-harness/turtle-ui` standalone example could not be cloned and returned 404. | 1 | Treat pinned Harness source/docs as authoritative and build a minimal standalone package from those contracts. |
| `tsdown` could not import optional config loader `unrun` on local Node 22.16.0. | 1 | Root cause: local Node predates the plugin/DSH floor (22.19), so tsdown cannot use native TS config loading and selects its optional `unrun` peer. Add `unrun` as an explicit development dependency; keep the DSH engine floor unchanged. |
| Service tests passed but strict typecheck could not find declarations for `write-file-atomic`. | 1 | The runtime package ships no `types`; add maintained `@types/write-file-atomic@4.0.3` as a development-only declaration dependency. |
| Tool definitions failed because DSH output object schemas require explicit `additionalProperties`. | 1 | Close both canonical output objects with `additionalProperties: false`, matching the official schema compiler contract. |
| Tool parameter DSL rejected raw JSON Schema `minimum`/`maximum`/`pattern` keys. | 1 | Keep bounds in model descriptions and enforce them at the existing `validateDisplayPatch` execution boundary; the DSH parameter DSL intentionally exposes a smaller key set. |
| Official `dsh plugin add` split the workspace path at its space and installed `deepseek` plus `harness` as separate specs. | 1 | Repeated the isolated smoke test through a verified no-space temporary junction; installation, boot, API, client-module discovery, and removal then passed. |
| PowerShell removal of isolated smoke directories/junction was blocked by the execution safety policy after path verification. | 2 | Left the three explicitly named items under the OS temp directory; no workspace or user project data was touched. |
