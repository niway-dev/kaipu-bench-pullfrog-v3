---
title: UI state catalog — on-demand screenshots of every desktop screen, area and state
description: "NIW2-625: one command runs the real built desktop app on the Mac mini through Playwright's Electron support, walks a typed UI map of screens → areas → states declared in src/shared/ui-map.ts, shoots the full window and a crop of every area per state as still PNGs, and publishes them with a generated README to a private repository. The map of what the app really looks like, recounted on demand and once per release. Not visual regression testing."
---

# UI state catalog — design

**Status: 🔵 Proposed · 2026-11-04, round 2. Design only; nothing is implemented.** Ticket
[NIW2-625](https://linear.app/niway/issue/NIW2-625/ui-state-catalog-on-demand-screenshots-of-every-desktop-screen-and).
ADRs: [0044](/architecture/decisions/0044-the-ui-state-catalog-runs-the-real-app-on-the-mac-mini/)
(driver), [0045](/architecture/decisions/0045-ui-catalog-images-live-in-a-separate-repository/)
(storage) and [0046](/architecture/decisions/0046-a-typed-ui-map-declares-every-screen-area-and-state/)
(the UI map).

## Round 2 changes

What changed since round 1 and why, so a reader of the PR's first round is not surprised:

1. **Driver: the real app on the Mac mini, not the browser harness.** On 2026-11-04 the owner
   rejected harness screenshots as not a real observation ("necesitamos una observación real")
   when a stacked PR's change was invisible in them. The mini already runs the real built app
   unattended through Playwright (`verify/`, `e2e/helpers/launch.ts`). ADR 0044 was rewritten
   and renamed; the harness moved to its "Alternatives rejected".
2. **A typed UI map in code** (`src/shared/ui-map.ts`, new ADR 0046). The owner wants every
   new feature annotated so the inventory stays under control: screens → areas → states, gates
   per area, `data-ui-area` on component roots, a coverage test, and a crop per area.
3. **Owner answers closing round-1 questions:** the catalog repository is private; the real
   version stays in every image; output is still PNGs only, with one generated countdown video
   as the fake recording input; local only, nothing in CI; English only.

## Summary (one minute)

The desktop UI changes every week and the design mocks drift from it, so there is no reliable
picture of what the app really looks like when a UI improvement is being planned. The **UI state
catalog** is one command, `bun run ui-catalog:remote`, run from the owner's machine. It builds
the app on the Mac mini at the current commit, launches the real Electron app there through
Playwright with an isolated profile and a neutral seeded workspace, and walks a **typed UI
map** declared in `apps/kaipu-record/src/shared/ui-map.ts`: every screen (a `ROUTES` entry or a
floating window), its named **areas** (`record.mic`, `record.modePicker`, …) and each area's
**states** (`on`, `off`, `panelOpen`). A catalog state says which profile the app launches
with, how to reach the state (navigate, click, call a preload method, show a hidden window) and
which map states it demonstrates. For every catalog state the run saves the full window and one
crop per declared area, as still PNGs, locating areas by `data-ui-area` and never by visible
text. Areas gated by a feature flag, a setting, a permission or the account are shot on both
sides of the gate; flags are forced with an env var that packaged builds ignore. The output is
copied back to the owner's machine, and a separate `publish` step commits it to the private
repository `niway-dev/kaipu-ui-catalog`, one commit per run named after version, date and SHA,
so GitHub's image diff shows what changed. A unit test in `bun run test` fails when a route, a
window kind or an area is missing from the map; a new feature adds its areas in the same PR.
It runs on demand and once per release, only on the mini; it asserts nothing about pixels and
gates nothing.

| #   | Decision                                                                                                                                                                                                                                 | Why                                                                                                                                                                                               | ADR                   |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| 1   | **(changed in round 2)** The driver is the real built app launched by Playwright's Electron support, reusing `e2e/helpers/launch.ts`, on the designated runner (the Mac mini).                                                           | The owner wants a real observation, not a rendering under a fake bridge; the mini already runs the real app unattended with the owner logged in. Electron still never runs on the owner's laptop. | 0044 (rewritten)      |
| 2   | `bun run ui-catalog` refuses to run on a host that is not in `ui-catalog/runners.json`; there is no override flag. The owner's machine runs `bun run ui-catalog:remote`, which builds, runs and copies back over `ssh macmini`.          | The owner rule is "never Electron on the laptop"; a guard without a bypass is the only one that holds at 2 a.m.                                                                                   | 0044                  |
| 3   | **(new)** `src/shared/ui-map.ts` is the typed inventory: screens → areas → states, `as const`, with derived `ScreenId`/`AreaId`/`StateId`; components mark their root with `data-ui-area`; the catalog locates areas by that id only.    | A misspelt or missing area is a compile error or a failing test, not a README gap; ids survive copy changes and translation, visible text does not.                                               | 0046 (new)            |
| 4   | **(new)** An area may be `gatedBy` a flag, an `AppSettings` key, a `RecordingSettings` key, a macOS permission or the account; the catalog shoots both sides of every gate and the README names the gate.                                | The owner wants to know what each area depends on; a gated area with one image hides the other half of the product.                                                                               | 0046                  |
| 5   | **(new)** Flags are forced per run with `KAIPU_FLAG_OVERRIDES` (JSON), read by main only when `app.isPackaged` is false, handed to renderers through `additionalArguments`, consulted before PostHog.                                    | Flags resolve in the renderer through PostHog with offline defaults; without an override the catalog could only ever show the default side. Same guard as `KAIPU_DISABLE_SCREEN_CAPTURE`.         | 0046                  |
| 6   | Catalog states are hand-written, one file per screen, each naming a profile, steps as data, and the `StateId`s it demonstrates.                                                                                                          | A list a person wrote is readable and reviewable; auto-discovery cannot name what it finds. The map says what exists; the catalog says how to get there.                                          | —                     |
| 7   | A coverage test in `bun run test` fails when a `ROUTES` entry or window kind has no screen, a screen has no area, an area has no state, or a `data-ui-area` literal is not an `AreaId`; the run fails when an area is found in no state. | A new screen or area must show up in the catalog's history; forgetting it is the most likely failure.                                                                                             | 0046                  |
| 8   | Output is still PNGs only: the full window per state and a crop per area present. No video output, ever.                                                                                                                                 | The owner analyses images with image recognition; a video is not an input to that.                                                                                                                | —                     |
| 9   | Fixture media is generated once by a script: one countdown video (big numbers 10→0 on a neutral background, `ffmpeg`) reused by every recording fixture, and neutral generated PNGs for screenshots.                                     | Recordings in the Library and the editor need a real file with real frames; one neutral video that reads as "a recording" is enough and leaks nothing.                                            | —                     |
| 10  | Images keep the app's real version in the status bar (`V0.16.0`), and the README header and the commit carry version, date and SHA.                                                                                                      | The owner wants every image to say which tagged version it came from; the per-release diff of the status bar is accepted.                                                                         | 0045                  |
| 11  | Images and the README live in the **private** repository `niway-dev/kaipu-ui-catalog`; each run overwrites the same paths and makes one commit.                                                                                          | Screenshots bloat a code repository; a separate one can have its history reset. Private by the owner's decision; fixtures stay neutral regardless.                                                | 0045                  |
| 12  | Capture reality only: no design source is compared against, no pixel assertion, no CI job of any kind. Local (mini) only.                                                                                                                | The catalog is a map for planning, not a regression suite; the owner wants nothing in CI for it.                                                                                                  | reuses 0027 (no gate) |
| 13  | Window sizes: the app's own (`main` 1040×760, `editor` 1440×900) plus the minimum variants (`main` 900×670, `editor` 1180×760) for Record and the video editor; floating windows at the size main gives them. Dark theme, English only.  | The window table in `src/shared/window-size.ts` is what users get; the minimums are where the layout is allowed to stop working, so they belong in the map.                                       | —                     |
| 14  | Fixtures are neutral generated data: no real workspace, person, file path, product or ticket names; a deny-list scan runs before publish.                                                                                                | The images leave the machine; a real name in a fixture becomes a leak.                                                                                                                            | —                     |
| 15  | Native macOS UI (the system screenshot selector, TCC dialogs, pickers, the tray menu, the traffic lights) is out of the images and listed in the README as "not capturable".                                                             | `page.screenshot` draws a window's web contents, not the compositor; the README must still say the flow exists.                                                                                   | reuses 0022           |
| 16  | Determinism without lies: fixture timestamps are seeded relative to the run's start, animations are settled before the shot (Playwright's `animations: "disabled"`, `caret: "hide"`), the pointer is parked; nothing is masked.          | The owner wants reality; a frozen renderer clock would disagree with main's, and a mask hides what the app shows. The diffs that remain (absolute dates) are known and listed in the manifest.    | 0044                  |
| 17  | Recount per release is a manual item in the release doc; `bun run ui-catalog:status` says whether the catalog is behind the latest tag. Nothing in Actions.                                                                              | A release must never wait on screenshots; a visible "behind" state keeps the recount from being forgotten.                                                                                        | —                     |
| 18  | The tool lives in `apps/kaipu-record/ui-catalog/`, next to `e2e/` and `verify/`; output on the mini and on the owner's machine goes to `.evidence/ui-catalog/<sha>/` (git-ignored).                                                      | It shares the launch helper and the `@shared` types with the suites beside it; the output is evidence until it is published.                                                                      | —                     |

## Open questions

1. **Are the recording-in-progress states reachable on the mini?** The control bar, the shade's
   countdown and border, and the Record page while recording need a real take, so Screen
   Recording (and for mic/camera states, Microphone and Camera) must be granted on the mini to
   the Electron binary that Playwright launches (`node_modules/electron/dist/Electron.app`),
   and the grant is per binary path, so an Electron bump needs a new grant. Step 1 of the
   implementation checks this; until it holds, those states are `notCapturable` with the
   reason in the README.
2. **Signed-in and Cloud states.** The session is `userData/auth.enc`, encrypted with
   `safeStorage` (the mini's keychain) and verified against the API at launch; the mini's build
   points at `http://localhost:3000`. Options: run the API on the mini with a catalog account
   (real `signed-in`), or seed only `signed-out` and the offline `unknown` state (last-known
   entitlements, no server). Recommendation: first catalog ships `signed-out` and `unknown`;
   `signed-in`/`cloud` wait for a decision on running the API there.
3. **The mini's display scale.** `page.screenshot` renders at the window's device scale factor.
   If the mini runs headless or on a 1x display, images are 1x; the manifest records the
   factor. To be confirmed in step 1; not a blocker.

## Out of scope

- Visual regression testing: `toHaveScreenshot`, pixel thresholds, a blocking diff, a CI gate.
- Comparing against Claude Design mocks or any design source.
- The browser harness as a catalog driver or as "before/after" proof (it stays the `verify`
  skill's labelled fallback for a quick layout check).
- Native UI inside the images (the system screenshot selector per ADR 0022, TCC permission
  dialogs, file pickers, the menu-bar tray itself, the Dock, the traffic lights). README entries
  only.
- Light theme, Windows or Linux builds, other locales.
- Video or animation output; every state is a still at rest.
- Mobile, web app and documentation site screenshots.
- Any job in `.github/workflows/`.

## Failures this must protect against

1. **Electron starts on the owner's laptop.** `bun run ui-catalog` checks `os.hostname()`
   against `ui-catalog/runners.json` before importing Playwright and exits 2 with the
   `ssh macmini` recipe; the `remote` wrapper is the only entry point documented for the laptop.
2. **A real name leaks into a published image.** A workspace, person, file path, customer or
   ticket name in a fixture (the owner's own screenshots show "Cricut Workspace"; that string
   must never appear). The seed, the catalog descriptions and the generated README are scanned
   against a deny-list before publish; the mini's own hostname and user name are on the list.
3. **A state shot before its data loads.** A `Loading…` status, an empty list that is really a
   pending promise, a `<video>` without a frame, a thumbnail still decoding. Every state waits
   for its declared `ready` condition (an area present, a `<video>` with `readyState >= 2`),
   then for no `[role="status"]` that says loading, then two animation frames.
4. **A frame caught mid-animation**: a drawer half open, a toast fading in, a caret blinking.
   Shots use Playwright's `animations: "disabled"` (CSS animations and transitions are driven
   to their end state for the shot, the app's code is untouched) and `caret: "hide"`.
5. **A route, window or area silently missing from the map.** The coverage test fails
   `bun run test`; the run fails when a declared area is in the DOM in no state of its screen.
6. **The wrong build.** The mini's `out/` is from another commit or a dirty tree. The remote
   wrapper checks out the requested SHA, refuses a dirty tree, builds, and the run writes the
   SHA and the build time into `manifest.json`; the image folder is named after the SHA.
7. **A run commits to the wrong repository**, or into the monorepo. The publish step clones the
   catalog repository into a temporary directory by its full URL, checks `origin`, and never
   runs `git` inside the monorepo.
8. **A flag override escapes the catalog.** `KAIPU_FLAG_OVERRIDES` is ignored when
   `app.isPackaged`; main logs the active overrides; the shell's DEV badge says "flags
   overridden"; the manifest records them.
9. **A state leaks into the next**: an open drawer, a hover, a route left behind, a recording
   still running. Every state of a profile starts with a navigation to its screen and
   `Escape`; a state that starts a take ends it; a profile ends with the launch helper's
   bounded quit (`closeOrReport`, NIW2-548), and a hung quit is reported with its `sample`
   stack, as the E2E suite does.
10. **Nondeterministic text makes fake diffs.** "2 hours ago" must read the same in every run:
    fixture `createdAt` values are the run's start minus fixed offsets. Absolute dates still
    change; the manifest lists the areas known to carry them, so a diff there is read as
    expected.
11. **A permission dialog blocks the run.** A profile that must not touch the screen launches
    with `KAIPU_DISABLE_SCREEN_CAPTURE=1` as the E2E suite does; the recording profile is the
    only one that does not, and it runs last, with a timeout that marks its states
    `notCapturable` instead of hanging the run.
12. **The catalog is green but the images are wrong**: a blank window, the error boundary, an
    image below a minimum size. The run fails a state whose page logged a `pageerror`, rendered
    `NotFound` or `RouteErrorBoundary` without asking for it, or whose PNG is smaller than the
    window's expected size.
13. **The published README and the images disagree** because one was regenerated and the other
    not. The README is generated from `manifest.json` in the same run, and publish refuses a
    directory whose manifest SHA does not match its folder name.
14. **A stale copy is published as a newer run.** Publish compares the manifest's SHA and date
    against the catalog repository's last commit and refuses to go backwards without `--force`.

## Acceptance criteria

- [ ] `apps/kaipu-record/src/shared/ui-map.ts` exists, `as const`, with `UI_MAP`,
      `WINDOW_KINDS`, and derived `ScreenId`, `AreaId`, `StateId`; `ui-map.test.ts` imports it
      and fails if the file takes a value import from a workspace package.
- [ ] `src/renderer/src/main.tsx` switches on `WINDOW_KINDS`; the comment-and-`if` chain is gone.
- [ ] Every screen component and every area root in the renderer spreads `uiArea("<AreaId>")`;
      `ui-catalog/coverage.test.ts` fails when a `ROUTES` entry or a `WINDOW_KINDS` entry has no
      screen (or `redirect`/`notCapturable`), a screen has no area, an area has an empty
      `states`, a catalog state names a `StateId` outside the map, or a `data-ui-area` literal
      in `src/renderer/` is not an `AreaId`. It runs inside `bun run test`.
- [ ] `KAIPU_FLAG_OVERRIDES='{"native-cursor-capture":true}'` flips `useFlag` in a dev build;
      the same variable is ignored by a packaged build (unit test on the parser; a `verify`
      scenario on the mini for the end-to-end claim).
- [ ] On the mini, `cd apps/kaipu-record && bun run ui-catalog` launches the built app, walks
      every catalog state and writes `.evidence/ui-catalog/<sha>/screens/<screen>/<state>.png`,
      `areas/<screen>/<area>/<state>.png`, `README.md`, `manifest.json` and `run.log`, exit 0.
- [ ] On any host not listed in `ui-catalog/runners.json`, `bun run ui-catalog` exits 2 before
      loading Playwright and prints the `ssh macmini` recipe. There is no flag to bypass it.
- [ ] From the owner's machine, `bun run ui-catalog:remote [--sha <sha>] [--only <glob>]`
      checks out, builds and runs on the mini and copies the output to the local
      `.evidence/ui-catalog/<sha>/`.
- [ ] `bun run ui-catalog --only 'record/*'` shoots only the Record states.
- [ ] Every area with `gatedBy` has at least one catalog state per side of each gate, and the
      README's area row names the gate (`flag native-cursor-capture`, `setting recordingMode`,
      `permission microphone`, `account signed-out`).
- [ ] Record and the video editor each have a state shot at their window minimum (900×670 and
      1180×760), named `<state>@min`.
- [ ] Floating windows are shot as their own windows at the size main gave them; the manifest
      records each window's bounds.
- [ ] The run reports (and exits non-zero on) any declared area not found in the DOM in any
      state of its screen, any `pageerror`, and any state marked `notCapturable` at runtime
      with its reason.
- [ ] `ui-catalog/fixtures/make-fixtures.ts` generates the countdown video and the PNGs with
      `ffmpeg`; the fixtures folder is git-ignored and `bun run setup` reports a missing `ffmpeg`.
- [ ] No image, fixture or README contains a string from the deny-list (`Cricut`, the owner's
      user name and home path, the mini's hostname, any `@gmail.com`); `bun run ui-catalog:lint`
      exits non-zero on a hit and `publish` runs it first.
- [ ] Two consecutive runs on the same commit produce byte-identical PNGs for every area crop
      that the manifest does not list as known-variable; `bun run ui-catalog --twice` reports
      the rest.
- [ ] The generated `README.md` has: a header with version, date, SHA, runner and scale factor;
      one section per screen with route or window query, one subsection per area with its gate
      and one row per state (image, crop, how reached); a final "Not capturable" section.
- [ ] `bun run ui-catalog:publish` clones `niway-dev/kaipu-ui-catalog` into a temporary
      directory, replaces `screens/`, `areas/`, `manifest.json` and `README.md`, and makes one
      commit `catalog: kaipu-record <version> <YYYY-MM-DD> @ <short sha>`; it pushes only with
      `--push` and refuses an older SHA/date without `--force`.
- [ ] `bun run ui-catalog:status` prints the catalog repository's last version, date and SHA and
      says `behind` when the latest `desktop-v*` tag is newer.
- [ ] The desktop release section of `deployment/ci-cd-pipelines.md` lists "Recount the UI
      catalog" after "Publish" as a manual step; no workflow in `.github/workflows/` mentions
      the catalog.
- [ ] The repository's CLAUDE.md has one line under the desktop rules: a UI PR adds its screens,
      areas and states to `ui-map.ts` with `data-ui-area` on the roots and a catalog state per
      area (implementation step, not this PR).
- [ ] The `verify` skill names `bun run ui-catalog:remote --only '<screen>/<state>'` as the way
      to get a real-app picture of one state, and keeps the harness as a labelled fallback only.
- [ ] The general-knowledge hub's `verification/README.md` has one line naming the published
      catalog exception (follow-up PR in that repository).

## Detail

### Where the tool lives

```
apps/kaipu-record/
  src/shared/ui-map.ts            # the typed inventory (ADR 0046); WINDOW_KINDS lives here too
  src/shared/ui-map.test.ts       # literals-only pin + shape sanity
  src/renderer/src/lib/ui-area.ts # uiArea(id: AreaId) → { "data-ui-area": id }
  ui-catalog/
    runners.json                  # allowed hostnames; the guard reads it first
    catalog/
      index.ts                    # exports every screen's states; the runner and the test read this
      record.ts                   # one file per screen …
      screenshots.ts
      editor.ts
      library.ts
      library-detail.ts
      export.ts
      shortcuts.ts
      settings.ts
      cloud.ts
      sign-in.ts
      onboarding.ts
      shell.ts                    # banners, gate, not-found, sidebar, workspace switcher
      windows/                    # capture-panel, control-bar, camera-bubble, capture-overlay,
                                  # capture-toast, recording-ready, recording-shade
      not-capturable.ts           # native flows with their README text
    profiles.ts                   # named launch profiles: settings, env, vault seed, session
    fixtures/
      make-fixtures.ts            # countdown video + neutral PNGs via ffmpeg (output git-ignored)
      seed-vault.ts               # builds the workspace folder from the fixtures + sidecars
    deny-list.txt
    run.ts                        # guard → profiles → launch → states → shots → manifest → README
    readme.ts                     # README generator (pure; unit-tested)
    publish.ts                    # clone the catalog repo, replace, commit, optionally push
    status.ts                     # catalog version vs latest desktop tag
    coverage.test.ts              # routes, window kinds, map, catalog and data-ui-area literals
  scripts/ui-catalog-remote.sh    # the owner-machine wrapper: ssh build + run + scp back
```

Why inside the app: the run imports `launchApp` from `e2e/helpers/launch.ts` and the types
from `src/shared/`; `e2e/` and `verify/` already sit there with the same shape, so a reader
looking for "how do I see the app" finds all three together. `ui-catalog/` is excluded from the
Electron build and from the preload bundle; its `*.ts` files are covered by the app's
`check-types`.

### The UI map

`src/shared/ui-map.ts` is the inventory the catalog walks (ADR 0046). Illustrative excerpt for
Record; the real file is written during implementation from the inventory at the end of this
document:

```ts
// apps/kaipu-record/src/shared/ui-map.ts — ILLUSTRATIVE, not the final file
import { ROUTES } from "./routes";
import type { FlagName } from "./analytics";

export const WINDOW_KINDS = [
  "capture-panel", "control-bar", "camera-bubble", "capture-overlay",
  "capture-toast", "recording-ready", "recording-shade",
] as const;

export const UI_MAP = {
  record: {
    kind: "route",
    route: ROUTES.record,
    areas: {
      modePicker: { states: ["frame", "window", "screen"], gatedBy: [{ setting: "recordingMode" }] },
      startButton: { states: ["idle", "recording", "paused", "pending"] },
      mic: {
        states: ["on", "off", "panelOpen", "denied"],
        gatedBy: [{ recordingSetting: "isMicrophoneEnabled" }, { permission: "microphone" }],
      },
      audio: { states: ["on", "off", "panelOpen"], gatedBy: [{ recordingSetting: "isSystemAudioEnabled" }] },
      camera: {
        states: ["off", "on", "panelOpen", "denied"],
        gatedBy: [{ recordingSetting: "isCameraEnabled" }, { permission: "camera" }],
      },
      sourcePicker: { states: ["closed", "open", "noScreenAccess"], gatedBy: [{ permission: "screen" }] },
      workspaceNotice: { states: ["hidden", "notConnected", "reconcile"] },
    },
  },
  prepare: { kind: "route", route: ROUTES.prepare, redirect: true },
  controlBar: {
    kind: "window",
    query: "window=control-bar",
    areas: {
      bar: { states: ["recording", "paused"] },
      mode: { states: ["screen", "window", "frame"] },
    },
  },
  // …
} as const;

export type ScreenId = keyof typeof UI_MAP;
export type AreaId = { [S in ScreenId]: (typeof UI_MAP)[S] extends { areas: infer A }
  ? `${S}.${keyof A & string}` : never }[ScreenId];
export type StateId = /* `${AreaId}:${state}` over each area's states tuple */ string;
```

Rules of the file:

- `as const`, no enums, derived types; the house idiom of `ROUTES` and `FLAG_NAMES`.
- Literals only. It imports from `./routes` and `./analytics` (same directory) and from nothing
  under `@kaipu/*`; `ui-map.test.ts` imports the module and pins that, as CLAUDE.md requires
  for `src/shared/**` (the preload bundle externalises workspace packages and would fail to
  load the file).
- `gatedBy` shapes: `{ flag: FlagName }`, `{ setting: keyof AppSettings }`,
  `{ recordingSetting: "isMicrophoneEnabled" | "isSystemAudioEnabled" | "isCameraEnabled" }`,
  `{ permission: "screen" | "microphone" | "camera" | "accessibility" }`,
  `{ account: "signed-out" | "signed-in" | "cloud" }`. Keys that exist today and are worth
  gating on: `recordingMode`, `screenshotMode`, `recordingCountdownSeconds`,
  `showBarInRecording`, `showBrandBadge`, `screenshotAfterCapture`, `screenshotCopy`,
  `uploadMode`, `exportQuality`, `showRecordingSavedCard`, `cameraBubble` (shape, size,
  cornerRadius, mirrored), `showInDock`. "Auto-zoom on clicks" is **not** a setting: it is the
  Accessibility permission row on Settings → Recording, so it is `{ permission: "accessibility" }`.
- A `redirect: true` screen (`prepare`, `prepareNew`, `screenshotEditor`, `videoEditor`) and a
  `notCapturable` screen (`settings/developer`, DEV-only) have no areas.

`uiArea()` in the renderer returns `{ "data-ui-area": id }` typed on `AreaId`; components spread
it on their root. It coexists with `data-testid`; the attribute is never used for styling.

### The catalog file format

One file per screen lists catalog states. A catalog state is **how to reach** a set of map
states in the real app; the map says **what exists**. Illustrative, for Record:

```ts
// apps/kaipu-record/ui-catalog/catalog/record.ts — ILLUSTRATIVE
import { catalog } from "../types";

export const record = catalog("record", {
  idle: {
    profile: "default",
    demonstrates: ["record.modePicker:screen", "record.startButton:idle", "record.mic:on",
                   "record.audio:off", "record.camera:off", "record.sourcePicker:closed"],
    ready: { area: "record.startButton" },
  },
  "mode-frame": {
    profile: "mode-frame", // settings.json: recordingMode "frame", recordingArea seeded
    demonstrates: ["record.modePicker:frame"],
  },
  "mic-panel-open": {
    profile: "default",
    steps: [{ click: { area: "record.mic", part: "settings" } }, { waitFor: { area: "record.micPanel" } }],
    demonstrates: ["record.mic:panelOpen"],
  },
  "camera-on": {
    profile: "default",
    steps: [{ call: "updateRecordingSettings", args: [{ isCameraEnabled: true }] }],
    demonstrates: ["record.camera:on"],
    gate: { recordingSetting: "isCameraEnabled", side: true },
  },
  "mic-denied": {
    profile: "no-media-permissions", // launched where microphone is not granted
    demonstrates: ["record.mic:denied"],
    notCapturableWhen: "microphone granted on the runner (the state cannot be produced)",
  },
  recording: {
    profile: "recording", // no KAIPU_DISABLE_SCREEN_CAPTURE; needs Screen Recording on the runner
    steps: [{ click: { area: "record.startButton" } }, { waitFor: { area: "record.startButton", state: "recording" } }],
    demonstrates: ["record.startButton:recording"],
    after: [{ click: { area: "record.startButton", part: "stop" } }],
  },
  "idle@min": { profile: "default", window: "main-min", demonstrates: ["record.startButton:idle"] },
});
```

The pieces:

- **`profile`.** A named entry of `profiles.ts`: the `settings.json` patch, the vault seed
  (which fixtures and sidecars), an optional session (`auth.enc` written by the app itself in a
  bootstrap launch, open question 2), and env (`KAIPU_DISABLE_SCREEN_CAPTURE`,
  `KAIPU_FLAG_OVERRIDES`). The runner groups states by profile and launches once per profile;
  profile order puts `recording` last.
- **`steps`.** Data, so the README can say how a state is reached: `navigate` (hash route),
  `click`/`hover`/`press`/`fill` with an `area` locator (plus an optional `part` sub-locator
  inside the area, by role), `waitFor` an area or a `<video>` frame, `call` a named preload
  method with JSON args (`page.evaluate(() => window.electronAPI[name](...args))`), `show` a
  hidden window (`electronApp.evaluate` → `BrowserWindow.showInactive()`), `window` to resize
  the main window to a named size. Arbitrary functions are allowed but discouraged.
- **`demonstrates`.** The `StateId`s this shot is evidence of. Typed; the coverage test also
  checks that every map state is demonstrated by at least one catalog state.
- **`ready`.** An area that must be present, or a `<video>` with `readyState >= 2`; always
  followed by "no loading status" and two animation frames.
- **`gate`.** Which gate and which side this state is on, so the README can pair the two sides.
- **`after`.** Steps that undo what this state did (stop a take, close a dialog) before the
  next state of the profile.
- **`notCapturableWhen`.** The condition under which the runner must declare the state
  uncapturable at runtime instead of failing, with the reason that goes into the README.
- **`window`.** `main` (1040×760), `main-min` (900×670), `editor` (1440×900),
  `editor-min` (1180×760); floating windows are never resized.

State ids are `<screen>/<state>` and become file paths: `screens/record/mic-panel-open.png`
for the window and `areas/record/mic/mic-panel-open.png` for each area present.

### How a state is reached in the real app

1. **Guard.** `run.ts` reads `ui-catalog/runners.json` and compares `os.hostname()`; on a
   mismatch it prints the recipe and exits 2 before importing `@playwright/test`.
2. **Profile.** `seed-vault.ts` builds a fresh workspace folder from the generated fixtures:
   six recordings (all the same countdown video, different titles, durations trimmed with
   `ffmpeg`, `createdAt` = run start minus 2 h, 1 d, 3 d, …), three screenshots (generated
   PNGs), tags, an edit session for one recording, sidecars in `.kaipu/`. `launchApp` is
   extended with `{ userDataDir, vaultDir, env, settings }` so a profile is a throwaway
   `--user-data-dir` with its own `preferences.json` and `settings.json`, exactly as the E2E
   suite isolates itself; the dev/prod userData split (`kaipu-record-dev`) is untouched.
3. **Launch.** One `electron.launch` per profile, with the suite's instrumentation (stderr tail,
   window-close reporting, bounded quit with a `sample` stack on a hang).
4. **Navigate and act.** For a route screen: `location.hash = route`, then the steps. For a
   floating window: find it by URL query in `electronApp.windows()`, or `waitForEvent("window")`
   after the step that creates it; show a prewarmed hidden one with `showInactive()`.
5. **Shoot.** `page.screenshot({ animations: "disabled", caret: "hide" })` for the window, then
   `page.locator('[data-ui-area="<id>"]').screenshot(...)` for each area present. The manifest
   records the window bounds, the scale factor, the areas found and the areas declared-but-absent
   in this state.
6. **Undo.** The state's `after` steps, `Escape`, and a navigation back to the screen's route.
7. **Quit.** The profile's `teardown()`; a quit that needed the shutdown deadline is reported,
   as in the E2E suite.

### Floating windows

| Window          | Query                     | How it exists                                                       | How the catalog reaches it                                                                                                                     | Capturable                                                                                                     |
| --------------- | ------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Capture panel   | `?mode=capture`           | Prewarmed hidden once the main window paints                        | `electronApp.windows().find(url includes "mode=capture")` + `showInactive()` through `electronApp.evaluate` (as `capture-panel-height.e2e.ts`) | Yes                                                                                                            |
| Recording shade | `?window=recording-shade` | Prewarmed hidden; shown for the countdown and the border of a take  | Countdown and border: a real take in the `recording` profile; the neutral prewarmed window can be shown but paints nothing                     | Countdown/border only if open question 1 holds; else `notCapturable`                                           |
| Control bar     | `?window=control-bar`     | Created and shown when a take starts; main hides the main window    | A real take; `waitForEvent("window")`; the main window is re-shown for the Record-while-recording state                                        | Same as above                                                                                                  |
| Camera bubble   | `?window=camera-bubble`   | Created when `isCameraEnabled` turns on                             | `call updateRecordingSettings({ isCameraEnabled: true })`; shape/size/corner variants through `settings.cameraBubble`                          | Yes if Camera is granted on the mini (a synthetic feed is not an option in the real app); else `notCapturable` |
| Capture overlay | `?window=capture-overlay` | Opened by `captureScreenshot(mode, intent)` for Frame/Window/Screen | `call captureScreenshot("frame")` in a profile with Screen Recording; the overlay precedes the native selector (ADR 0022)                      | Overlay yes (with the grant); the native selector no                                                           |
| Capture toast   | `?window=capture-toast`   | Created after a quiet capture                                       | A real quiet capture (`screenshotAfterCapture: "copy"` profile) with the grant; otherwise `notCapturable`                                      | Conditional                                                                                                    |
| Recording ready | `?window=recording-ready` | Created by `showRecordingReady(payload)` after a take               | `call showRecordingReady` from the main page with a fixture payload for the seeded recording; no take needed                                   | Yes                                                                                                            |

Window states that need a real take are grouped in the `recording` profile, which runs last and
has a per-state timeout; a timeout marks the state `notCapturable` with "runner has no Screen
Recording grant (or the take did not start)" instead of failing the run.

### Gates and flag overrides

- **Flags.** Main parses `KAIPU_FLAG_OVERRIDES` at startup when `app.isPackaged` is false,
  validates keys against `FLAG_NAMES`, logs `[flags] overrides active: …`, and adds
  `--kaipu-flag-overrides=<json>` to every window's `webPreferences.additionalArguments`. The
  preload reads it from `process.argv` and exposes `window.electronAPI.flagOverrides`;
  `isFlagEnabled` in `analytics-client.ts` returns the override before asking PostHog. The
  shell's DEV env badge appends "flags overridden". Today's flags: `bypass-login` (default on)
  and `native-cursor-capture` (default off); the catalog shoots the Record and editor cursor
  areas on both sides of the latter.
- **Settings.** A profile's `settings.json` patch; the same key the app persists.
- **Recording settings.** In-memory in main; a `call updateRecordingSettings(patch)` step.
- **Permissions.** Decided by the runner's TCC grants, which the catalog cannot change. A
  profile declares `requires: { screen: true }` or `requires: { microphone: false }`; the run
  calls `window.electronAPI.checkPermissions()` after launch and marks the profile's states `notCapturable` when
  the runner cannot produce them. Both sides of a permission gate therefore need the mini to be
  in one grant state per run; the README says which side the run could show.
- **Account.** `signed-out`: no `auth.enc`. `unknown`: the app's own stored session with the
  API unreachable. `signed-in`/`cloud`: open question 2.

### Fixtures

`make-fixtures.ts` (needs `ffmpeg`, reported by `bun run setup`) generates once:

- **`countdown.mp4`**: 12 s, 1920×1080, 30 fps, a neutral dark background with the numbers
  10→0 in large type, one per second, and a thin progress line; H.264 + silent AAC so every
  decoder and the editor's audio lane behave as with a real recording. Every recording fixture
  is this file, trimmed to its sidecar's duration, so a frame at a known playhead is the same
  frame in every run.
- **`screen-a.png` … `screen-d.png`**: 2880×1800 neutral "application window" drawings (grey
  blocks, no text), for screenshots and for recording thumbnails.
- **Webcam track**: one recording's sidecar references a second short render (the same
  countdown at 640×480) as its webcam track, so the editor's camera lane has content.

All names, titles, tags and workspaces are neutral (`Walkthrough 1`, `Team notes`, `Demo
workspace`); paths are under the throwaway vault; the account email, when any, is
`ana@example.com`. No video is ever an output.

### Determinism

- **Time.** The run records `startedAt`; every fixture `createdAt` is `startedAt − offset`, so
  "2 hours ago" is the same text in every run. Absolute dates and the status bar's version
  change between runs; the manifest lists the areas that carry them (`library.itemMeta`,
  `libraryDetail.header`, `shell.statusBar`, …) as known-variable, and `--twice` excludes them
  from its report. `page.clock` is not used: the renderer's clock would disagree with main's,
  and the recording timer and IPC timeouts read both.
- **Motion.** Playwright's screenshot options `animations: "disabled"` and `caret: "hide"`;
  the app's CSS is untouched.
- **Pointer.** `page.mouse.move(width − 1, height − 1)` before every shot that is not a hover
  state.
- **Same machine, same build.** The mini, its fonts, its display scale; the build at the SHA in
  the folder name.
- **Checked, not assumed.** `--twice` runs every state twice in one invocation and reports any
  crop whose bytes differ outside the known-variable list.

### The coverage check and the runtime check

`ui-catalog/coverage.test.ts` is a normal Vitest file in the app's suite. It imports `ROUTES`,
`WINDOW_KINDS`, `UI_MAP` and the catalog, and scans `src/renderer/**/*.tsx` for
`data-ui-area` and `uiArea(` literals. It fails with names when: a route or window kind has no
screen (or `redirect`/`notCapturable`); a screen has no area; an area has no state; a map state
is demonstrated by no catalog state; a catalog state demonstrates a `StateId` outside the map;
a literal in the renderer is not an `AreaId`; or a settings child route (from the router's
settings children) has no screen.

At runtime the run keeps, per screen, the union of areas found across its states and compares
it with the areas declared; an area found nowhere fails the run with the screen and the area
named. An area absent from one state is normal (a panel that is closed) and is recorded in the
manifest.

Because `bun run test` runs in the release-candidate tier (ADR 0027) and the pre-push hook does
not run tests, the coverage failure is loud but late. That is acceptable: the point is that the
catalog cannot drift past a release.

### The run commands

In `apps/kaipu-record/package.json` unless noted:

| Command                                                | Where           | What it does                                                                                                                                                                                                                                                          |
| ------------------------------------------------------ | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun run ui-catalog:remote [--sha] [--only] [--twice]` | owner's machine | `scripts/ui-catalog-remote.sh`: `ssh macmini` with the PATH export, `git fetch && git checkout <sha>` (refuses dirty), `electron-vite build` with the two `MAIN_VITE_*` URLs, `bun run ui-catalog …`, `scp -r` the output to the local `.evidence/ui-catalog/<sha>/`. |
| `bun run ui-catalog`                                   | mini only       | Guard, fixtures if missing, profiles, launch, walk, write `.evidence/ui-catalog/<short sha>/` with `screens/`, `areas/`, `README.md`, `manifest.json`, `run.log`.                                                                                                     |
| `bun run ui-catalog --only <glob>`                     | mini only       | Only the matching state ids (`record/*`, `windows/capture-toast/*`, `editor/video@min`).                                                                                                                                                                              |
| `bun run ui-catalog --twice`                           | mini only       | Every state twice; reports nondeterministic crops outside the known-variable list.                                                                                                                                                                                    |
| `bun run ui-catalog:lint`                              | either          | Deny-list scan of fixtures, catalog descriptions and the generated README. Also run by `publish`.                                                                                                                                                                     |
| `bun run ui-catalog:publish [--push] [--force]`        | owner's machine | Clones `git@github-niway:niway-dev/kaipu-ui-catalog.git` into a temp dir, verifies `origin`, replaces `screens/`, `areas/`, `manifest.json`, `README.md`, commits `catalog: kaipu-record <version> <date> @ <sha>`.                                                   |
| `bun run ui-catalog:status`                            | either          | Reads the catalog repository's `manifest.json` from `main` and compares with the latest `desktop-v*` tag; prints `current` or `behind <tag>`.                                                                                                                         |

The run is a Playwright test project after all, unlike round 1: `_electron.launch` and the
quit watchdog are built for `@playwright/test`, `verify/` already runs that way on the mini
(`node node_modules/@playwright/test/cli.js test -c ui-catalog/playwright.config.ts`), and the
reporter gives the per-state log for free. Nothing uses `toHaveScreenshot` or `-snapshots`
folders.

The SSH alias follows `~/GITHUB_ACCOUNTS.md`; publish refuses a remote whose owner is not
`niway-dev`, a non-empty clone directory, or a manifest older than the repository's last commit
(without `--force`). It never touches the monorepo's git state.

### The generated README

`readme.ts` renders `manifest.json` into Markdown, so the README is a function of the catalog
and the run, never hand-edited. Illustrative:

```markdown
# Kaipu Record — UI state catalog

Generated 2026-11-12 from kaipu-record 0.17.0 @ 1ecd65c5 (desktop-v0.17.0), on macmini
(macOS 26.1, scale 2x). Dark, English. Fixtures are neutral generated data. Flag overrides
used: native-cursor-capture=true for the states that say so. Not a design source: this is what
the app renders.

## Contents
Record · Screenshots · Editor · Library · Library detail · Export · Shortcuts · Settings ·
Cloud · Sign in · Onboarding · Shell · Floating windows · Not capturable

## Record
Route `#/`. Window 1040×760.

### record.mic — gated by recording setting `isMicrophoneEnabled`, permission `microphone`
| State | How reached | Window | Crop |
| --- | --- | --- | --- |
| `on` | Open the app (default profile). | ![](screens/record/idle.png) | ![](areas/record/mic/idle.png) |
| `off` | Call `updateRecordingSettings({ isMicrophoneEnabled: false })`. | … | … |
| `panelOpen` | Click the Mic tile's settings half. | … | … |
| `denied` | Not captured this run: microphone is granted on the runner. | — | — |

…

## Not capturable
These flows exist and have no image, because macOS draws them, not the app's windows:
- **Screenshot selector (Frame, Window, Screen)** — the system `screencapture` selector (ADR 0022).
- **Permission dialogs** — TCC prompts for screen, microphone, camera, accessibility.
- **Folder and file pickers** — add a workspace, import a video, export destination.
- **Menu-bar tray menu** — native; the panel it opens is under Floating windows.
- **Traffic lights and window chrome** — composited by macOS over the hidden title bar.
- **Settings → Developer** — DEV-only page, absent from a production build.
```

### The per-release recount

The release flow (`release-please.yml` → `release-desktop.yml` on the `desktop-v*` tag) is not
touched. The recount is a manual step after a release lands:

1. The desktop release section of `deployment/ci-cd-pipelines.md` gains a last item: "Recount
   the UI catalog: `bun run ui-catalog:remote --sha desktop-v<version> && cd apps/kaipu-record && bun run ui-catalog:publish --push`."
2. `bun run ui-catalog:status` is the reminder: `behind desktop-v0.18.0` when the catalog's
   last manifest names an older version; `bun run setup` prints that line too.
3. The publish commit carries version, date and SHA, so the catalog repository's history reads
   as a release log, with GitHub's image diff between any two.

A recount between releases uses the same commands on any commit; the commit message then names a
branch SHA rather than a tag.

### Starting inventory, as the UI map

Derived from reading the router, the pages, the features and the floating-window roots on
2026-11-04. **This is a starting inventory, not the map**: the implementation writes
`ui-map.ts` from it, and the first run will add, merge and rename areas and states as the
pages reveal what is actually distinct. Format: `screen` → `area`: states (gate).

**record** (`#/`): `modePicker`: frame · window · screen (setting `recordingMode`) ·
`startButton`: idle · pending · recording · paused · `mic`: on · off · panelOpen · denied
(recordingSetting `isMicrophoneEnabled`, permission `microphone`) · `audio`: on · off ·
panelOpen (recordingSetting `isSystemAudioEnabled`) · `camera`: off · on · panelOpen · denied
(recordingSetting `isCameraEnabled`, permission `camera`) · `sourcePicker`: closed · open ·
noScreenAccess (permission `screen`) · `workspaceNotice`: hidden · notConnected · reconcile ·
`countdown`: hidden · running (setting `recordingCountdownSeconds`) · plus `idle@min`.

**screenshots** (`#/screenshots`): `modeChips`: frame · window · screen (setting
`screenshotMode`) · `captureButton`: idle · busyWhileRecording · `recent`: list · empty.

**editor** (`#/editor`, `#/editor/new`, `#/editor/video/:id`, `#/editor/image/:id`,
`#/editor/capture`): `home`: videos · images · emptyVideos · emptyImages · `newPaste`: waiting ·
`videoPreview`: playing-frame · zoomSelected · overlaySelected · `toolRail`: default ·
annotateFlyout · audioFlyout · toolVariant · `inspector`: hidden · overlay · zoom · `timeline`:
default · cameraLane · mutedRange · `cursor`: hidden · editable (flag `native-cursor-capture`) ·
`exportSheet`: closed · open · busyToast · `restoredToast`: shown · `imageCanvas`: default ·
crop · annotate · `captureFresh`: shown · plus `video@min`.

**library** (`#/library`): `grid`: items · empty · error · `viewToggle`: grid · list ·
`filters`: all · recordings · cloud · tag · `selection`: none · active · `moveMenu`: open ·
`tagDrawer`: item · all · `sortMenu`: open · `vaultBanner`: shown.

**libraryDetail** (`#/library/:assetId`): `header`: recording · screenshot · gif · `preview`:
video · image · cloudOnly · `actions`: editedNotExported · stale · exported · `savedNotice`:
shown · `deleteButton`: rest · hover · `page`: loading.

**export** (`#/export`, `#/export/:assetId`): `dropZone`: empty · `plan`: ready ·
destinationPreselected · `error`: probe · `page`: loading (setting `exportQuality`).

**shortcuts** (`#/shortcuts`): `list`: default · `rebind`: recording.

**settings** (`#/settings/*`): `general` · `permissions`: allGranted · missing · `recording`:
default · clickZoom (permission `accessibility`) · `quality` · `screenshots`: preview · copy
(setting `screenshotAfterCapture`) · `workspaces`: list · dialogAdd · dialogEdit · `app` ·
`scopeBar`: default · overridden (setting `uploadMode`) · `developer`: notCapturable.

**cloud** (`#/cloud`): `account`: signedOut · unknown · signedIn · sessionExpired (account) ·
`usage`: shown (account `cloud`) · `page`: loading · error · notAvailable · betaUnavailable.

**signIn** (`#/sign-in`): `flow`: waitingForBrowser · codeEntry · errorInvalidCode ·
errorNetwork.

**onboarding** (overlay over `#/`): `step`: welcome · permissionsNone · permissionsAll · done.

**shell** (any route): `sidebar`: rest · hover · exportBadge · `workspaceSwitcher`: closed ·
open · `banner`: hidden · update · versionGateSoft · `gate`: hard · `page`: notFound ·
routeError · `reconcileDialog`: open · `statusBar`: default (known-variable: version).

**Floating windows:** `capturePanel`: `mode`: record · screenshot · `busy`: whileRecording ·
`controlBar`: `bar`: recording · paused · `mode`: screen · window · frame · `cameraBubble`:
`shape`: circle · square · portrait (setting `cameraBubble`) · `captureOverlay`: `intent`:
screenshot · record · `mode`: frame · window · screen · `displays`: one · chooser ·
`captureToast`: `card`: rest · hover · copied · failed · `recordingReady`: `card`: default ·
hover · cannotEdit · `recordingShade`: `countdown`: running · `border`: area · fullDisplay.

**Not capturable** (README entries): system screenshot selector (ADR 0022) · permission
dialogs · folder and file pickers · tray menu · traffic lights and window chrome · Settings →
Developer.

Roughly 140 full-window images and 250–300 area crops in the first catalog, 20–30 MB at 2x. A
full run on the mini is estimated at 8–12 minutes: one launch per profile (about ten profiles
at ~10 s each), ~3 s per state, plus the `recording` profile's real take.

### Relation to the `verify` skill and the harness

- **Same launcher, two uses.** `verify/` scenarios and the catalog both go through
  `launchApp`; a `verify` proof of one state is `bun run ui-catalog:remote --only '<screen>/<state>'`
  on the branch, with the PNG attached as the skill says. A before/after is the same command on
  two SHAs. A state that only exists on a branch is added to the map and the catalog on that
  branch, which is how the catalog grows with the UI.
- **Different artefact.** `verify` evidence proves a PR's claim and stays git-ignored (hub
  rule). The catalog is a published product artefact (ADR 0045). The same PNG can be both.
- **The harness is a fallback, not a source.** `.evidence/harness/` stays on the owner's
  machine for a quick layout check of a renderer component, always labelled as such; it never
  produces a catalog image or a before/after. The `verify` skill text is updated to say so.

### Implementation steps (for the plan, not this spec)

1. On the mini: confirm Screen Recording, Camera and Microphone grants for the Electron binary
   under Playwright, the display scale factor, and that `verify/launch` still passes; record
   the hostname in `ui-catalog/runners.json`. Owner creates the private
   `niway-dev/kaipu-ui-catalog` with an empty `main` and a two-line README.
2. `src/shared/ui-map.ts` + `ui-map.test.ts` from the inventory; `WINDOW_KINDS` extracted and
   `main.tsx` switched on it; `uiArea()` helper; `data-ui-area` on every screen and area root.
3. `KAIPU_FLAG_OVERRIDES` in main, preload and `analytics-client.ts`, with unit tests and the
   packaged-build guard.
4. `launchApp` extended with a profile; `profiles.ts`, `fixtures/make-fixtures.ts`,
   `seed-vault.ts`, `deny-list.txt`, the runner guard.
5. `catalog/*.ts`, `run.ts`, `readme.ts` (unit-tested), `coverage.test.ts`,
   `scripts/ui-catalog-remote.sh`.
6. First full run on the mini; review every image for leaks and for states that are not
   distinct; fix the map and the catalog, not the images.
7. `publish.ts`, `status.ts`, the release-doc item, the `setup` reminder, the CLAUDE.md line,
   the `verify` skill update, the one-line hub PR.

### References

- Owner decisions for NIW2-625, rounds 1 and 2, 2026-11-04 (this spec's decisions table).
- Real-app driving on the Mac mini: `apps/kaipu-record/e2e/helpers/launch.ts` (`launchApp`,
  isolated userData and vault, bounded quit), `apps/kaipu-record/verify/` (`helpers.ts`,
  `playwright.config.ts`, `*.verify.ts`), `e2e/capture-panel-height.e2e.ts` (showing a hidden
  window through `electronApp.evaluate`).
- Existing env hooks in main: `KAIPU_DISABLE_SCREEN_CAPTURE` (`src/main/permissions.ts`,
  `src/main/recording-sources.ts`).
- Flags: `src/shared/analytics.ts` (`FLAG_NAMES`, `FLAG_DEFAULTS`),
  `src/renderer/src/features/analytics/analytics-client.ts` and `use-flag.ts`.
- Settings and recording settings: `src/shared/types/ipc.ts` (`AppSettings`,
  `RecordingSettings`, `RecordingActivity`), `src/main/recording/recording-hub.ts`.
- Session storage: `src/main/infrastructure/auth-store.ts` (`auth.enc`, `safeStorage`).
- [ADR 0006](/architecture/decisions/0006-desktop-e2e-in-the-candidate-tier/)
  and [ADR 0027](/architecture/decisions/0027-verify-release-candidates-only/):
  the desktop E2E runs only in the release-candidate tier.
- [ADR 0022](/architecture/decisions/0022-screenshot-capture-native-where-the-os-has-it/):
  the native screenshot selector the catalog cannot draw.
- `src/shared/routes.ts`, `src/shared/window-size.ts` (presets and minimums),
  `src/renderer/src/main.tsx` (the eight render targets), `src/renderer/src/app/router.tsx`.
- `.claude/skills/verify/SKILL.md` and the general-knowledge hub,
  `verification/README.md` ("Captures go to a git-ignored `.evidence/` and are never committed").
- State of the art, read 2026-11-04:
  - Playwright `toHaveScreenshot` commits baselines next to the tests;
    Argos keeps them in the cloud and diffs in CI:
    [argos-ci.com/compare/playwright](https://argos-ci.com/compare/playwright),
    [Playwright visual regression testing in CI](https://argos-ci.com/blog/playwright-visual-regression-testing-ci).
  - Lost Pixel reportedly sunsetting: [Lost Pixel alternatives](https://argos-ci.com/blog/lost-pixel-alternatives).
  - Screenshots in the code repository: about 5 GB over 100 commits in one account,
    [Your screenshot automation is bloating your git repo](https://dev.to/omachala/your-screenshot-automation-is-bloating-your-git-repo-3lgc).
  - A separate snapshot repository, as discussed for swift-snapshot-testing:
    [pointfreeco/swift-snapshot-testing#504](https://github.com/pointfreeco/swift-snapshot-testing/discussions/504).
- Alternatives rejected, with the reasons, in ADRs 0044, 0045 and 0046.
