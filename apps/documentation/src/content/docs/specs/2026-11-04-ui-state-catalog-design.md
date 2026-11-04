---
title: UI state catalog — on-demand screenshots of every desktop screen and state
description: "NIW2-625: one command renders the real desktop renderer in system Chrome with a fake preload bridge, walks a hand-written catalog of screens and named UI states, shoots one image per state, and publishes images plus a generated README to a separate repository. The map of what the app really looks like, recounted on demand and once per release. Not visual regression testing."
---

# UI state catalog — design

**Status: 🔵 Proposed · 2026-11-04. Design only; nothing is implemented.** Ticket
[NIW2-625](https://linear.app/niway/issue/NIW2-625/ui-state-catalog-on-demand-screenshots-of-every-desktop-screen-and).
ADRs: [0044](/architecture/decisions/0044-the-ui-state-catalog-runs-on-the-browser-harness-not-electron/)
(driver) and [0045](/architecture/decisions/0045-ui-catalog-images-live-in-a-separate-repository/)
(storage). The driver already exists as a git-ignored prototype (`.evidence/harness/` on the
owner's machine, proven on NIW2-606, NIW2-619 and the Kaipu Black stack); this spec promotes
it into the repository and puts a catalog on top of it.

## Summary (one minute)

The desktop UI changes every week and the design mocks drift from it, so there is no reliable
picture of what the app really looks like when a UI improvement is being planned. The **UI state
catalog** is one command, `bun run ui-catalog`, that builds the real renderer of
`apps/kaipu-record` (the same code, the same StyleX CSS) for plain Chrome with a fake
`window.electronAPI`, then walks a **hand-written catalog**: one file per screen, each listing
named states such as `record/idle`, `record/mode-frame`, `record/mic-panel-open`. A state is a
route or floating-window query, the fake bridge's initial data, and a few interaction steps. The
run takes one 1440×900 @2x screenshot per state (plus the minimum window size for Record and the
Editor), with a frozen clock, fixed neutral fixtures and no motion, and writes a README that
describes every screen, its states and how each is reached, with a "not capturable" list for
native macOS UI. A separate `publish` step copies the output into its own repository,
`niway-dev/kaipu-ui-catalog`, overwriting the same paths and making one commit named after the
monorepo SHA and version, so GitHub's image diff shows what changed between two runs. A coverage
test fails when a router route or a window query has no catalog entry. It runs on demand and
once per release; it asserts nothing about pixels and gates nothing.

| #   | Decision                                                                                                                                                            | Why                                                                                                                                                                                      | ADR                   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| 1   | The driver is the existing browser harness, promoted into the repository: the real renderer built by Vite for system Chrome with a fake `window.electronAPI`.       | No Electron on the owner's machine (owner rule, ADR 0006/0027 keep the desktop E2E in the release tier). The harness is already proven on four tickets and renders the real CSS.         | 0044 (new)            |
| 2   | States are a hand-written catalog, one file per screen, each state named and declared as route or window + seed + steps.                                            | A list of states a person wrote is readable, reviewable in a PR and stable; auto-discovery by clicking everything produces noise and cannot name what it found.                          | —                     |
| 3   | A coverage test fails when a `ROUTES` entry or a renderer window kind has no state in the catalog (legacy redirects are declared as such).                          | A new screen must show up in the catalog's history; forgetting it is the most likely failure.                                                                                            | —                     |
| 4   | Images and the generated README live in a separate repository, `niway-dev/kaipu-ui-catalog`; each run overwrites the same paths and makes one commit.               | Screenshots bloat a code repository (the catalog is ~18 MB per run); a separate repository can have its history reset without touching the monorepo. Explicit exception to the hub rule. | 0045 (new)            |
| 5   | Capture reality only. No design source is compared against, no pixel assertion, no CI gate.                                                                         | The catalog is a map for planning, not a regression suite. The mocks it would compare against are the thing that drifts.                                                                 | reuses 0027 (no gate) |
| 6   | Viewport 1440×900 @2x, dark theme, English, plus the `main` minimum (900×670) for Record and the `editor` minimum (1180×760) for the video editor.                  | 1440×900 is the editor preset and the owner's window; the minimums are where the layout is allowed to stop working, so they belong in the map.                                           | —                     |
| 7   | Fixtures are neutral generated data: no real workspace, person, file path, product or ticket names.                                                                 | The images are published; a real name in a fixture becomes a leak.                                                                                                                       | —                     |
| 8   | Native macOS UI (the system screenshot selector, permission dialogs, pickers, the tray) is out of the images and listed in the README as "not capturable".          | Chrome cannot draw it; the README must still say the flow exists, or the map has a hole nobody sees.                                                                                     | reuses 0022           |
| 9   | Recount per release: the publish step is a manual item in the release doc, not a release job. A `status` command says whether the catalog is behind the latest tag. | A release must never wait on screenshots; a visible "behind" state keeps the recount from being forgotten.                                                                               | —                     |
| 10  | The tool lives in `apps/kaipu-record/ui-catalog/`, next to `e2e/` and `verify/`; local output goes to `.evidence/ui-catalog/` (git-ignored).                        | The build must run with cwd `apps/kaipu-record` and import `@shared` types; the output is evidence until it is published.                                                                | —                     |

## Open questions

1. **Repository visibility.** `niway-dev/kaipu-ui-catalog` private (recommended until the
   fixtures have been reviewed in a first run) or public from the start, since the monorepo is
   public? Creating the repository is an implementation step that needs the owner.
2. **The version in the status bar.** The shell shows `v<version>` from `getAppVersion`. A real
   version makes every release's recount diff every image by one pixel row; a placeholder
   (`v0.0.0`) is a lie inside a picture that is supposed to be true. Recommendation: fixed
   placeholder, with the real version in the commit message and the README header.
3. **Fixture media: generate or commit.** The four "screen" PNGs and the 48 s MP4 are generated
   by `make-fixtures` (needs `ffmpeg`) into a git-ignored folder, as today. Committing them
   (~2 MB) would remove the `ffmpeg` dependency and make the run reproducible on a machine
   without it. Recommendation: generate, and record the `ffmpeg` requirement in `bun run setup`.
4. **A CI recount.** A Linux runner could run the catalog with Playwright's Chromium, but its
   fonts and rendering differ from the owner's macOS Chrome, so the images would diff against
   every local run. Recommendation: local only for now; revisit if the manual recount gets
   skipped twice.
5. **Spanish.** English only by decision; the harness already supports `kb.locale=es`. A second
   locale doubles the images and the README. Not now.

## Out of scope

- Visual regression testing: `toHaveScreenshot`, pixel thresholds, a "blocking" diff, a CI gate.
- Comparing against Claude Design mocks or any design source.
- Electron screenshots of any kind; the `verify/` Electron scenarios stay as they are.
- Native UI inside the images (the system screenshot selector per ADR 0022, TCC permission
  dialogs, file pickers, the menu-bar tray itself, the Dock). They get README entries only.
- Light theme, Windows or Linux rendering, other locales.
- Video or animation capture; every state is a still at rest.
- Mobile, web app and documentation site screenshots.

## Failures this must protect against

1. **A real name leaks into a published image.** A workspace, person, file path, customer or
   ticket name in a fixture (the owner's own screenshots show "Cricut Workspace"; that string
   must never appear). A scan of every fixture string against a deny-list runs before publish.
2. **A state shot before its data loads.** A `Loading…` status, an empty list that is really a
   pending promise, a `<video>` without a frame, a thumbnail still decoding. Every state waits
   for a declared `ready` condition, then for no `[role="status"]` that says loading, then a
   short settle.
3. **A frame caught mid-animation**: a drawer half open, a toast fading in, a caret blinking.
   Animations and transitions are forced to zero and `prefers-reduced-motion` is set.
4. **A route or window silently missing from the catalog.** A new sidebar page or floating window
   ships and the map never shows it. The coverage test fails `bun run test`.
5. **A run commits to the wrong repository**, or into the monorepo. The publish step clones the
   catalog repository into a temporary directory by its full URL, checks `origin` before
   committing, and never runs `git` inside the monorepo.
6. **Secrets or user paths in images.** A real home directory in a workspace path, an email that
   is not `@example.com`, a token in a dev-only panel. Fixtures use `/Users/demo/...`-style
   paths and `example.com`; the production build hides the developer settings page.
7. **Nondeterministic text makes fake diffs.** "Saved 2 minutes ago", "Verified just now", a
   countdown, the elapsed-time counter, a random seed in a sketched annotation. The clock is
   frozen at one instant for both the fake bridge and the page; fixtures carry fixed timestamps
   relative to that instant; the pointer is parked off any hover target before every shot.
8. **Hover state leaks from one shot to the next**, or router/in-memory state leaks between
   states. Every state is a full page load from `about:blank` (a hash-only change would be a
   same-document navigation).
9. **The harness renders the wrong tree.** A stale build directory from another worktree, or
   `DEV` true showing the env badge and developer settings. One build per worktree, keyed by
   path; `mode: "production"`.
10. **A new preload member crashes the renderer** because the fake bridge does not model it. The
    Proxy fallback keeps a no-op default, and the run logs every unmodelled member so the gap is
    visible in the output, not hidden.
11. **The catalog is green but the images are wrong**: an image of a blank page, a 404, or the
    error boundary. The run fails a state whose page logged a `pageerror`, rendered `NotFound`
    or `RouteErrorBoundary` without being the state that asks for it, or produced an image
    below a minimum size.
12. **The published README and the images disagree** because one was regenerated and the other
    not. The README is generated from the same catalog objects in the same run, and publish
    refuses a partial output directory.

## Acceptance criteria

- [ ] `cd apps/kaipu-record && bun run ui-catalog` builds the renderer, walks every catalog
      state and writes `.evidence/ui-catalog/<sha>/screens/<screen>/<state>.png`, a
      `README.md`, a `manifest.json` and a `console.log`, with exit code 0.
- [ ] `bun run ui-catalog --only 'record/*'` shoots only the Record states.
- [ ] Every `ROUTES` entry in `apps/kaipu-record/src/shared/routes.ts` and every renderer
      window kind (`?mode=capture`, `?window=control-bar|camera-bubble|capture-overlay|capture-toast|recording-ready|recording-shade`)
      has at least one catalog state or an explicit `redirect`/`notCapturable` declaration;
      `ui-catalog/coverage.test.ts` fails when one does not, and it runs inside `bun run test`.
- [ ] Record and the video editor each have a state shot at their window minimum (900×670 and
      1180×760), named `<state>@min`.
- [ ] No image or README contains a string from the fixture deny-list (`Cricut`, the owner's
      user name and home path, any `@gmail.com`); `bun run ui-catalog:lint` checks the fixtures
      and the generated README and exits non-zero on a hit.
- [ ] Two consecutive runs on the same commit produce byte-identical PNGs for every state
      (determinism), checked by `bun run ui-catalog --twice`.
- [ ] The generated `README.md` has one section per screen with: route or window, one line per
      state with the image, a one-line description and "how reached", and a final
      "Not capturable" section listing the native flows.
- [ ] `bun run ui-catalog:publish` clones `niway-dev/kaipu-ui-catalog` into a temporary
      directory, replaces `screens/` and `README.md`, and makes one commit
      `catalog: kaipu-record <version> @ <short sha>`; it pushes only with `--push`.
- [ ] `bun run ui-catalog:status` prints the catalog repository's last recorded version and SHA
      and says `behind` when the latest `desktop-v*` tag is newer.
- [ ] The desktop release section of `deployment/ci-cd-pipelines.md` lists "Recount the UI catalog" after "Publish" as a manual step; no
      workflow in `.github/workflows/` depends on the catalog.
- [ ] The `verify` skill's "Renderer component in a harness" section points to
      `apps/kaipu-record/ui-catalog/` as the harness to reuse, and `.evidence/harness/` is deleted
      from the owner's machine once the in-repo copy produces the same images.
- [ ] The general-knowledge hub's `verification/README.md` has one line naming this exception
      (follow-up PR in that repository).

## Detail

### Where the tool lives

```
apps/kaipu-record/ui-catalog/
  harness/
    index.html              # the one HTML entry; same root element as the app
    entry.tsx               # installs the fake bridge, then imports the real App or window
    fake-electron-api.ts    # the fake preload bridge; seeds come from the state
    media-url.ts            # replaces src/renderer/src/lib/media-url.ts (kaipu-media:// → fixtures)
    vite.config.ts          # harness build; StyleX plugin with the app's include globs
    make-fixtures.ts        # generated placeholder media (four "screens" + one MP4)
  fixtures/                 # generated, git-ignored; make-fixtures writes it
  catalog/
    index.ts                # exports every screen; the coverage test and the runner read this
    record.ts               # one file per screen …
    screenshots.ts
    editor.ts               # /editor, /editor/new, /editor/video/:id, /editor/image/:id, /editor/capture
    library.ts
    library-detail.ts
    export.ts
    shortcuts.ts
    settings.ts
    cloud.ts
    auth.ts
    onboarding.ts
    shell.ts                # banners, gate, not-found, sidebar hover, workspace switcher
    windows/
      capture-panel.ts      # ?mode=capture
      control-bar.ts        # ?window=control-bar
      camera-bubble.ts
      capture-overlay.ts
      capture-toast.ts
      recording-ready.ts
      recording-shade.ts
    not-capturable.ts       # native flows, with the README text for each
  deny-list.txt             # strings that must never appear in fixtures or the README
  run.ts                    # build + preview + shoot + README + manifest
  publish.ts                # clone the catalog repo, replace, commit, optionally push
  status.ts                 # catalog version vs latest desktop tag
  coverage.test.ts          # routes and window kinds vs catalog
  readme.ts                 # README generator (pure; unit-tested)
```

Why inside the app and not `tools/` or `packages/`:

- The Vite build must run with cwd `apps/kaipu-record`: the StyleX PostCSS scanner resolves its
  include globs and `babel.config.cjs` from cwd (the prototype learned this the hard way).
- The fake bridge imports `@shared/types/electron-api` and the shared constants, so it type-checks
  against the real preload contract and a renamed IPC member is a compile error in the fake.
- It uses the app's own `vite`, `@vitejs/plugin-react` and `@stylexjs/*` versions; a second
  package would pin them twice.
- `e2e/` and `verify/` already sit there with the same shape (a folder of scenarios plus helpers),
  so a reader looking for "how do I see the app" finds all three together.

`ui-catalog/` is excluded from the Electron build (`electron.vite.config.ts` does not include it)
and from the preload bundle. Its `*.ts` files are covered by the app's `check-types` through a
`tsconfig` reference, so the catalog cannot rot silently.

### The catalog file format

One file per screen exports a `Screen`. Illustrative, for the Record page:

```ts
// apps/kaipu-record/ui-catalog/catalog/record.ts
import { ROUTES } from "@shared/routes";
import { screen, type Screen } from "../types";

export const record: Screen = screen({
  id: "record",
  title: "Record",
  route: ROUTES.record,
  description: "Start a recording in the last used mode; sound and camera inputs below.",
  states: {
    idle: {
      description: "Default page, Screen mode, mic and system audio on, camera off.",
      ready: { text: "Start recording" },
    },
    "mode-frame": {
      description: "Last mode was Frame: the Start button names it and shows the saved area.",
      seed: { settings: { recordingMode: "frame", recordingArea: { x: 120, y: 80, width: 1280, height: 720 } } },
      ready: { text: "Start recording" },
    },
    "mode-window": { seed: { settings: { recordingMode: "window" } }, ready: { text: "Start recording" } },
    "mode-screen": { seed: { settings: { recordingMode: "screen" } }, ready: { text: "Start recording" } },
    "mic-off": {
      description: "Microphone toggled off.",
      seed: { recordingSettings: { isMicrophoneEnabled: false } },
      ready: { text: "Start recording" },
    },
    "mic-panel-open": {
      description: "The Mic tile's drawer: device list and input level.",
      ready: { text: "Start recording" },
      steps: [{ click: { role: "button", name: /microphone settings/i } }, { waitFor: { role: "listbox" } }],
    },
    "audio-panel-open": {
      description: "The system audio drawer: volume and duck-while-talking.",
      steps: [{ click: { role: "button", name: /system audio settings/i } }],
    },
    "camera-on": { seed: { recordingSettings: { isCameraEnabled: true } } },
    "camera-panel-open": {
      seed: { recordingSettings: { isCameraEnabled: true } },
      steps: [{ click: { role: "button", name: /camera settings/i } }],
    },
    "mic-denied": {
      description: "Mic on but macOS access off: the permission notice under the tiles.",
      seed: { permissions: { microphone: false } },
    },
    "source-picker-open": {
      description: "The in-app source picker (Change source), two screens and three windows.",
      steps: [{ click: { role: "button", name: /change/i } }, { waitFor: { role: "dialog" } }],
    },
    recording: {
      description: "A take in progress: red indicator, elapsed 00:42, Pause and Stop.",
      seed: { recordingState: { active: true, status: "recording", elapsedSeconds: 42 } },
      ready: { text: "Stop recording" },
    },
    "recording-paused": {
      seed: { recordingState: { active: true, status: "paused", elapsedSeconds: 42 } },
    },
    "idle@min": { viewport: "main-min", description: "Idle at the main window's minimum, 900×670." },
  },
});
```

The pieces:

- **`route` or `window`.** A screen is either a hash route (`#/library/asset-…`) or a floating
  window query (`?window=capture-toast`, `?mode=capture`, `?window=capture-overlay&ui=frame&…`).
  A window screen also declares its **window size** (the size main gives it: the toast is
  280 + 32 DIP wide, the bubble is `cameraBubble.size`, the overlays are display-sized), so it is
  shot at the size a user sees.
- **`seed`.** A JSON patch over the fake bridge's base fixtures: settings, auth status, library
  items, recording settings and state, permissions, storage usage, workspaces, update status,
  version gate. Only data, never functions, so a state file is declarative and the runner can
  serialize it into the page (see next section).
- **`emit`.** For windows that receive their state by push (`on…` subscriptions) rather than by
  a getter: a list of `[channel, payload]` the fake bridge delivers after mount. The capture
  toast's `{ saved, copied, presentation }`, the recording-ready card's payload, the shade's
  `{ rect }`, the control bar's tick.
- **`ready`.** What must be on screen before the shot: a text, a role, a `<video>` with
  `readyState >= 2`, or a function of the page. Always followed by the "no loading status"
  check and a short settle.
- **`steps`.** Interaction steps as data: `click`, `hover`, `press`, `fill`, `waitFor`,
  `seek` (the editor's playhead), each with a Playwright-style locator (`role` + `name`,
  `text`, `testId`). Arbitrary functions are allowed (`run: async (page) => …`) but discouraged,
  because a function cannot be rendered into the README's "how reached" line.
- **`viewport`.** `default` (1440×900), `main-min` (900×670), `editor-min` (1180×760), or a
  window size name. The scale factor is always 2.
- **`localStorage`.** Keys to set before load: `kaipu.onboarding.completed` (unset for the
  onboarding states), `kb.locale`.
- **`notCapturable`.** A state with no image and a README line instead:
  `{ notCapturable: "macOS screencapture selector (ADR 0022); native, not drawn by the renderer." }`.
- **`redirect`.** For `ROUTES.prepare`, `prepareNew`, `screenshotEditor`, `videoEditor` and
  `/settings/files`: declared so coverage counts them without shooting them.

State ids are `<screen>/<state>` and become file paths, `screens/record/mic-panel-open.png`.
The `@min` suffix marks the minimum-size variant.

### How the fake electronAPI gets per-state initial state

The prototype's fake bridge has one hard-coded seed. The catalog needs a different seed per
state without rebuilding or restarting the preview server between states. The runner does this
with Playwright's init script:

1. Before each navigation, the runner calls `context.addInitScript` with
   `window.__KAIPU_CATALOG__ = { seed, emit, localStorage }` (all JSON).
2. `harness/entry.tsx` runs first in the page, reads that object, builds the fake bridge with
   `createFakeElectronAPI(seed)` — base fixtures deep-merged with the patch — and installs it on
   `window.electronAPI` before importing the real app (some renderer modules read the bridge at
   module load; the prototype already orders this correctly).
3. For `emit`, the fake bridge keeps the handlers registered through `on…` and, once the window's
   React tree has mounted (`notifyReady` or the first `requestAnimationFrame`), delivers each
   payload to the matching handler in order.
4. Every state is a fresh page load, so there is one bridge per state and nothing to reset.

The base fixtures are the prototype's: nine library items (six recordings, three screenshots)
with fixed ages relative to the frozen instant, four tags, two workspaces, a signed-in Pro
account `ana@example.com`, five capture sources, an edit session for the walkthrough recording
with cuts, three annotations, two zooms, a blur, a cover and one muted range. Any member the
bridge does not model falls back through a Proxy to a no-op that logs `unmodelled: <name>`;
the run's `console.log` lists them so the next person sees what to add.

### Determinism

- **Frozen clock.** The fake bridge's `NOW` is a constant (2026-11-03 15:30 UTC), and the runner
  installs Playwright's `page.clock` at the same instant so `Date.now()`, `new Date()` and timers
  in the page agree with the fixtures. "2 hours ago", "Verified just now", "Updated today" are
  then the same text in every run.
- **Fixed fixtures.** All ids, sizes, durations and timestamps are literals. The placeholder
  "screens" are drawn from HTML with a seeded line generator; the MP4 is a fixed-length
  render of one of them with a cursor box whose position is a function of `t`, so a frame at
  a frozen playhead is the same frame every time. Annotation sketches that take a seed get a
  literal seed in the session fixture.
- **No motion.** A style tag forces `animation-duration`, `animation-delay`,
  `transition-duration` and `transition-delay` to `0s` and hides the caret; the context is
  created with `reducedMotion: "reduce"`.
- **Pointer parked.** `page.mouse.move(width - 1, height - 1)` before every shot that is not a
  hover state.
- **Same browser, same fonts.** System Google Chrome on the owner's machine, `deviceScaleFactor: 2`,
  `colorScheme: "dark"`, `--hide-scrollbars`, `--use-fake-device-for-media-stream` so camera
  states render a synthetic feed instead of a permission prompt.
- **Same build.** One Vite build per worktree in `production` mode, keyed by the worktree path,
  so an image is never produced from another branch's bundle.
- **Checked, not assumed.** `--twice` runs the catalog two times in one process and reports any
  state whose PNG bytes differ. That report is the first thing to look at when a run is noisy.

### The coverage check

`ui-catalog/coverage.test.ts` is a normal Vitest file in the app's suite:

1. Import `ROUTES` from `@shared/routes` and the list of window kinds. Today that list is a
   comment and a chain of `if`s in `src/renderer/src/main.tsx`; the implementation extracts it
   into `src/shared/window-kinds.ts` (`["capture-panel", "control-bar", "camera-bubble",
"capture-overlay", "capture-toast", "recording-ready", "recording-shade"]`) and `main.tsx`
   switches on it, so the test and the app read one list.
2. Build the set of catalog targets: every screen's `route` (parameterised routes match by
   pattern, `/library/:assetId` covers `/library/asset-…`) and every `window`, plus every
   `redirect` and `notCapturable` declaration.
3. Fail with the name of each route or window kind that has no target, and each catalog target
   that names a route or window the app no longer has.
4. Also fail when a settings child route (`general`, `permissions`, …, read from the router's
   settings children) has no state; `developer` is DEV-only and declared `notCapturable`.

Because it runs in `bun run test`, a PR that adds a route without a catalog entry fails the
release-candidate verification (ADR 0027), which is the only place tests run in Actions, and
the pre-push hook does not run tests (ADR 0027 decision 5), so the failure is loud but late.
That is acceptable: the point is that the catalog cannot drift past a release.

### The run commands

All in `apps/kaipu-record/package.json`:

| Command                            | What it does                                                                                                                                                                                                                                          |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun run ui-catalog`               | Generates fixtures if missing, builds the harness, serves it, walks the catalog, writes `.evidence/ui-catalog/<short sha>/` with `screens/`, `README.md`, `manifest.json`, `console.log`.                                                             |
| `bun run ui-catalog --only <glob>` | Only the matching state ids (`record/*`, `windows/capture-toast/*`, `editor/video@min`).                                                                                                                                                              |
| `bun run ui-catalog --twice`       | Runs every state twice and lists nondeterministic ones.                                                                                                                                                                                               |
| `bun run ui-catalog:lint`          | Deny-list scan of the fixtures, the catalog descriptions and the generated README. Also run by `publish`.                                                                                                                                             |
| `bun run ui-catalog:publish`       | Clones `git@github-niway:niway-dev/kaipu-ui-catalog.git` into a temp dir, verifies `origin`, replaces `screens/` and `README.md`, commits `catalog: kaipu-record <version> @ <sha>`. Prints the commit and the clone path. Pushes only with `--push`. |
| `bun run ui-catalog:status`        | Reads the catalog repository's `manifest.json` from `main` and compares with the latest `desktop-v*` tag; prints `current` or `behind <tag>`.                                                                                                         |

The SSH alias follows `~/GITHUB_ACCOUNTS.md`; publish refuses to run when the remote's owner is
not `niway-dev` or the working tree it clones into is not empty. It never touches the monorepo's
git state.

The run is a Bun/Node script (`run.ts`), not a Playwright test project: there are no assertions
to report, and the Playwright test runner's own screenshot pipeline (`toHaveScreenshot`,
`-snapshots` folders, `--update-snapshots`) is the regression workflow this is not.

### The generated README

`readme.ts` renders `manifest.json` into Markdown, so the README is a function of the catalog
and the run, never hand-edited:

```markdown
# Kaipu Record — UI state catalog

Generated 2026-11-04 from kaipu-record 0.17.0 @ 1ecd65c5 (main). 1440×900 @2x, dark, English.
Fixtures are neutral generated data. Not a design source: this is what the app renders.

## Contents
Record · Screenshots · Editor · Library · Library detail · Export · Shortcuts · Settings ·
Cloud · Sign in · Onboarding · Shell · Floating windows · Not capturable

## Record
Route `#/`. Start a recording in the last used mode; sound and camera inputs below.

| State | How reached | Image |
| --- | --- | --- |
| `idle` | Open the app. Screen mode, mic and audio on. | ![](screens/record/idle.png) |
| `mode-frame` | Last mode was Frame. | ![](screens/record/mode-frame.png) |
| `mic-panel-open` | Click the Mic tile's settings half. | ![](screens/record/mic-panel-open.png) |
| `idle@min` | Idle at the main window's minimum, 900×670. | ![](screens/record/idle@min.png) |

…

## Not capturable
These flows exist and have no image, because macOS draws them, not the renderer:
- **Screenshot selector (Frame, Window, Screen)** — the system `screencapture` selector (ADR 0022).
  The in-app overlay that precedes it is under Floating windows → capture-overlay.
- **Permission dialogs** — TCC prompts for screen, microphone, camera, accessibility.
- **Folder and file pickers** — add a workspace, import a video, export destination.
- **Menu-bar tray menu** — native menu; the panel it opens is Floating windows → capture-panel.
- **Settings → Developer** — DEV-only page, absent from a production build.
```

One table row per state, in catalog order. The "How reached" column is rendered from the
state's `seed` and `steps` (a function step renders as "custom step"); a `description` replaces
it when present. Screen sections appear in the order of `catalog/index.ts`, which follows the
sidebar.

### The per-release recount

The release flow (`release-please.yml` → `release-desktop.yml` on the `desktop-v*` tag) is not
touched. The recount is a manual step after a release lands:

1. The desktop release section of `deployment/ci-cd-pipelines.md` gains a last item: "Recount the UI catalog:
   `git checkout desktop-v<version> && cd apps/kaipu-record && bun run ui-catalog && bun run ui-catalog:publish --push`."
2. `bun run ui-catalog:status` is the reminder: it says `behind desktop-v0.18.0` when the catalog's
   last manifest names an older version. `bun run setup` (the tool-doctor script) prints that
   line too, so the owner sees it the next time they set up or check the machine. Neither blocks
   anything.
3. The publish commit message carries the version and the SHA, so the catalog repository's
   history reads as a release log: one commit per recount, with GitHub's image diff between any
   two.

A recount on demand between releases uses the same commands on any commit; the commit message
then names a branch SHA rather than a tag.

### Starting state inventory

Derived from reading the router, the pages, the features and the floating-window roots on
2026-11-04. **This is a starting inventory, not the catalog**: the implementation writes the real
files, and the first run will add, merge and rename states as the pages reveal what is actually
distinct. Counts are per section.

**Record** (`#/`, 20): idle · mode-frame · mode-window · mode-screen · mic-off · mic-panel-open ·
audio-off · audio-panel-open · camera-on · camera-panel-open · mic-denied · camera-denied ·
source-picker-open · source-picker-no-screen-access · recording · recording-paused ·
countdown · workspace-not-connected · reconcile-banner · idle@min.

**Screenshots** (`#/screenshots`, 3): default (Capture + Frame/Window/Screen chips, recent
screenshots) · recent-empty · while-recording (the stop control replaces Capture).

**Editor** (`#/editor`, `#/editor/new`, `#/editor/video/:id`, `#/editor/image/:id`,
`#/editor/capture`, 20): home-videos · home-images · home-empty-videos · home-empty-images ·
new-waiting-for-paste · video-default (playhead at 0:03, box, text and blur visible) ·
video-annotate-flyout · video-audio-flyout · video-tool-variant · video-overlay-selected
(inspector) · video-zoom-selected · video-camera-lane (session with a webcam track) ·
video-export-sheet · video-export-busy-toast · video-restored-session-toast · video@min
(1180×760) · image-default · image-crop · image-annotate · capture-fresh (image in router state).

**Library** (`#/library`, 13): grid · list · empty · error · filter-recordings · filter-cloud ·
filter-tag · selection-active · move-menu-open · tag-drawer-item · tag-drawer-all ·
sort-menu-open · vault-banner.

**Library detail** (`#/library/:assetId`, 10): recording · recording-edited-not-exported ·
recording-stale · recording-exported · screenshot · gif · cloud-only (no local copy) ·
saved-notice · delete-hover · loading.

**Export** (`#/export`, `#/export/:assetId`, 5): new-empty (drop or pick) · recording-ready
(plan and destinations) · destination-preselected (`?to=youtube`) · probe-error · loading.

**Shortcuts** (`#/shortcuts`, 2): default · recording-a-new-key (if the page edits inline;
otherwise one state).

**Settings** (`#/settings/*`, 10): general · permissions-granted · permissions-missing ·
recording-quality · recording · screenshots · workspaces · workspaces-dialog-add ·
workspaces-dialog-edit · app · developer (notCapturable, DEV-only). Plus the scope bar's
override state on one page (`cloud/override`, below).

**Cloud** (`#/cloud`, 8): signed-in-usage · signed-out · loading · error · session-expired ·
not-available · beta-unavailable · upload-mode-overridden (ADR 0034 scope bar).

**Sign in** (`#/sign-in`, 4): waiting-for-browser · code-entry · error-invalid-code ·
error-network (the other `errorCopyKey` variants share the layout; one each only if the text
length changes the layout).

**Onboarding** (overlay over `#/`, 4): welcome · permissions-none-granted ·
permissions-all-granted · done.

**Shell** (any route, 9): sidebar-hover · export-badge · workspace-switcher-open ·
update-banner · version-gate-soft-banner · version-gate-hard-overlay · not-found ·
route-error-boundary · reconcile-dialog.

**Floating windows** (26):

- `capture-panel` (`?mode=capture`, 3): record-mode · screenshot-mode · busy-while-recording.
- `control-bar` (2): recording · paused.
- `camera-bubble` (3): circle · square · portrait-with-corner-radius.
- `capture-overlay` (8): frame-screenshot · window-screenshot · screen-screenshot ·
  frame-record (size readout in device pixels) · window-record · screen-record ·
  two-displays-chooser · spare-before-state (blank by design; shot to prove it paints nothing).
- `capture-toast` (4): saved-and-copied-rest · hover · copied-confirmation · save-failed.
- `recording-ready` (3): default · hover · cannot-edit.
- `recording-shade` (3): countdown · area-border-with-rec-tag · full-display-border.

**Not capturable** (5 README entries): system screenshot selector (ADR 0022) · permission
dialogs · folder and file pickers · tray menu · Settings → Developer.

Roughly 135 images in the first catalog, around 18–20 MB at 2x. A full run is estimated at three
to five minutes on the owner's machine (the prototype shoots eighteen states in under a minute
after a 40 s build).

### Relation to the `verify` skill and the `.evidence` harness

- **Same driver, two uses.** The harness under `ui-catalog/harness/` is the in-repo successor of
  `.evidence/harness/` and of the throwaway `harness-tmp/` the `verify` skill describes for
  "Renderer component in a harness". After this lands, the skill's section points here: to shoot
  one state as PR evidence, run `bun run ui-catalog --only '<screen>/<state>'` and attach the
  PNG from `.evidence/ui-catalog/<sha>/` as the skill says. A before/after is the same command on
  two worktrees. A state that only exists on a branch is added to the catalog on that branch,
  which is how the catalog grows with the UI.
- **Different artefact.** `verify` evidence proves a PR's claim and stays git-ignored
  (hub rule). The catalog is a published product artefact (ADR 0045). The same PNG can be both:
  evidence on the PR today, a catalog image after the next recount.
- **Not a scenario.** The Electron scenarios in `verify/` (`launch`, `library`, `export`) stay the
  only source of pictures of the real Electron window and of native behaviour; the catalog never
  claims to show main's behaviour, only what the renderer draws for a given bridge state.
- **Retire the prototype.** Once `bun run ui-catalog --only 'editor/*'` reproduces the
  prototype's editor shots, delete `.evidence/harness/` on the owner's machine; its `.build/`
  cache is the only thing of size there.

### Implementation steps (for the plan, not this spec)

1. Owner creates `niway-dev/kaipu-ui-catalog` (visibility per open question 1) with an empty
   `main` and a two-line README.
2. Promote the harness: move the six prototype files into `ui-catalog/harness/`, convert
   `run.sh`/`shoot.mjs` into `run.ts`, add the `__KAIPU_CATALOG__` seed path and `emit`.
3. Extract `src/shared/window-kinds.ts`; make `main.tsx` switch on it.
4. Write `types.ts`, `catalog/*.ts` from the inventory above, `readme.ts` with a unit test,
   `coverage.test.ts`, `deny-list.txt`, `ui-catalog:lint`.
5. First full run; review every image for leaks and for states that are not distinct; fix the
   catalog, not the images.
6. `publish.ts`, `status.ts`, the release-doc item, the `setup` reminder.
7. Update the `verify` skill section; open the one-line hub PR; delete `.evidence/harness/`.

### References

- Owner decisions for NIW2-625, 2026-11-04 (this spec's decisions table).
- Prototype harness: `.evidence/harness/` (git-ignored; `run.sh`, `shoot.mjs`,
  `fake-electron-api.ts`, `harness-entry.tsx`, `media-url.ts`, `make-fixtures.mjs`,
  `vite.config.mjs`), proven on NIW2-606, NIW2-619 and PRs #499–#502.
- [ADR 0006](/architecture/decisions/0006-desktop-e2e-in-the-candidate-tier/)
  and [ADR 0027](/architecture/decisions/0027-verify-release-candidates-only/):
  the desktop E2E runs only in the release-candidate tier.
- [ADR 0022](/architecture/decisions/0022-screenshot-capture-native-where-the-os-has-it/):
  the native screenshot selector the catalog cannot draw.
- `apps/kaipu-record/src/shared/routes.ts`, `window-size.ts` (presets and minimums),
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
- Alternatives rejected, with the reasons, in ADRs 0044 and 0045.
