---
title: UI state catalog — implementation plan
description: "Working plan for NIW2-625 (stack NIW2-628 → NIW2-629 → NIW2-630): the typed UI map and data-ui-area annotations, the catalog runner on the Mac mini, then publish, status and the release recount. Deleted by the stack's last PR."
---

# UI state catalog — implementation plan

**Status: 🟡 In progress · 2026-11-04.** Working document; the stack's last PR deletes it.
Contract: [the spec](/specs/2026-11-04-ui-state-catalog-design/) (decisions, failures,
acceptance criteria) and ADRs 0044, 0045 and 0046. Parent ticket
[NIW2-625](https://linear.app/niway/issue/NIW2-625/ui-state-catalog-on-demand-screenshots-of-every-desktop-screen-and).

## Why a stack

The spec touches every page of the renderer (one `data-ui-area` per area root), adds a
Playwright runner with fixtures and a remote wrapper, and a publish tool. One PR with all of
it is not reviewable. Three PRs, merged bottom-up, one Linear sub-issue each:

| PR  | Sub-issue | Scope                                                                                                                                                                          |
| --- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | NIW2-628  | `ui-map.ts` + `WINDOW_KINDS` in `main.tsx`, `uiArea()`, `data-ui-area` on the roots, the map half of `coverage.test.ts`, `KAIPU_FLAG_OVERRIDES`, CLAUDE.md line                |
| 2   | NIW2-629  | `launchApp` profiles, fixtures, seed, `catalog/*.ts`, `run.ts`, `readme.ts`, the guard, `ui-catalog-remote.sh` (launchd), the catalog half of the coverage test, the first run |
| 3   | NIW2-630  | Deny-list lint, `publish.ts`, `status.ts`, release-doc item, `setup` reminder, `verify` skill, spec open-question fix, hub follow-up, this plan's deletion                     |

## PR 1 — the map

1. `src/shared/ui-map.ts`: `WINDOW_KINDS`, `UI_MAP`, `ScreenId`/`AreaId`/`StateId`, `Gate`.
   Literals only; imports `./routes` and `./analytics` and nothing under `@kaipu/*`.
2. `src/shared/ui-map.test.ts`: the module loads in node (the preload rule), every area has a
   non-empty `states`, route screens point at a `ROUTES` value.
3. `src/renderer/src/lib/ui-area.ts`: `uiArea(id: AreaId)` → `{ "data-ui-area": id }`.
4. `main.tsx` picks the render target from a `Record<WindowKind, …>` instead of the `if` chain.
5. Every screen root and area root spreads `uiArea(...)`. The map is written from what the
   pages render, starting from the spec's inventory; areas that do not exist in the DOM are
   dropped or merged, not invented.
6. `ui-catalog/coverage.test.ts` (map half), included in the Vitest `main` project.
7. `KAIPU_FLAG_OVERRIDES`: parser in `src/shared/flag-overrides.ts` (pure, unit-tested; ignored
   when packaged), main logs and forwards it through `additionalArguments`, preload exposes
   `flagOverrides`, `isFlagEnabled` reads it first, the DEV env badge says "flags overridden".

## PR 2 — the runner

1. `launchApp` gains `{ settings, env, seed, userDataDir }`; defaults keep the E2E suite as is.
2. `fixtures/make-fixtures.ts` (ffmpeg; output git-ignored), `fixtures/seed-vault.ts`.
3. `profiles.ts`, `catalog/*.ts` (one file per screen), `types.ts`, `run.ts` as a Playwright
   project (`ui-catalog/playwright.config.ts`), `readme.ts` (pure, unit-tested), `runners.json`.
4. `scripts/ui-catalog-remote.sh`: ssh, refuse a dirty tree, checkout, build, `launchctl submit`,
   poll, `launchctl remove`, `scp` back.
5. First full run on the mini; review every image; fix the map and catalog, not the images.

## PR 3 — publish

`deny-list.txt` + `lint.ts`, `publish.ts` (tested on a local bare repo until the owner confirms
`niway-dev/kaipu-ui-catalog`), `status.ts`, docs and skill edits, this plan removed.

## Rules for every PR

- Electron never runs on the owner's laptop; every real-app run is on the mini as a launchd job.
- Stage explicit paths; pinned `oxfmt` from the main checkout.
- PR bodies end with "How to test it yourself" and `## Decisions`.
