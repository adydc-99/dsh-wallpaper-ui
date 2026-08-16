# DSH Wallpaper Plugin Work Plan

## Goal
Build the approved native Cordis standalone `dsh-wallpaper` plugin, including secure wallpaper management, persistent configuration, Web UI controls, constrained AI tools, and automated tests.

## Phases
- [x] Phase 1 — Recover context, inspect the approved spec, and map the DSH/Cordis plugin conventions.
- [x] Phase 2 — Write the detailed implementation plan under `docs/superpowers/plans/`.
- [x] Phase 3 — Prepare an isolated plugin workspace and verify the baseline.
- [ ] Phase 4 — Implement backend persistence, validation, routes, and AI tool permissions with TDD. *(in progress)*
- [ ] Phase 5 — Implement and integrate the wallpaper settings UI and global background layer with TDD.
- [ ] Phase 6 — Run security, switching, persistence, build, uninstall-safety, and UI verification.
- [ ] Phase 7 — Review the completed branch and present integration options.

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
