# Writing a screen's catalog

One file per screen of `src/shared/ui-map.ts`. The map says what exists (areas and their
states); a catalog file says how to reach each state in the real app, as data. The
runner (`../run.ts`) launches the built app once per profile, walks the states, and shoots
the window plus a crop of every area of that screen that is on screen.

Read first: the spec `apps/documentation/src/content/docs/specs/2026-11-04-ui-state-catalog-design.md`,
`../types.ts` (the format, with comments on every field) and `../profiles.ts`.

## The rules

1. **One `catalog(screen, states, extras)` per file**, exported and added to `index.ts`.
   `catalog` is typed on the screen: a `demonstrates` entry, a `ready` area or a
   `notCapturable` key from another screen does not compile.
2. **Every map state is demonstrated or declared.** Each `<area>:<state>` of the screen
   appears in some state's `demonstrates`, or in `extras.notCapturable` with the reason the
   README prints ("needs the API; the catalog runs offline", "a transient state while …").
   `../coverage.test.ts` lists what is missing, grouped by screen.
3. **Both sides of every gate.** For each `gatedBy` of an area, two or more states carry that
   gate in `gates` with different `side`s, or `extras.oneSided` says why the other side has
   no look of its own. A side the runner cannot produce (a permission it grants) is still
   written as a state with `requires`; the run reports it as not capturable with the reason.
4. **`embedsScreen: true` on any state that can show live screen or camera content on some
   runner** (a source thumbnail, a capture's preview, a take, a camera bubble or any state
   with the camera on). The rule is what the state can show, not what the mini happened to
   produce: a runner with a webcam draws a live frame into the same state the mini draws a
   placeholder in. `ui-catalog:lint` lists those states for a look by eye before
   `ui-catalog:publish`, because an image cannot be scanned for the deny-list.
5. **A state demonstrates only what its image shows.** The run fails a state whose
   `demonstrates` names an area that is not on screen, so a claim cannot drift from the image.
6. **Data, not code.** Steps are `navigate`, `click`/`hover`/`press`/`fill`/`scrollTo` on an
   area (with `part` for a button inside it, `hasText` to pick one card of many), `waitFor`,
   `call` (a preload method with JSON args), `show`/`hide` (a window), `window` (a size),
   `action` (named runner helpers for takes) and, last resort, `waitMs`. Names in `part` are
   English: every profile pins `locale: "en"`.
7. **Undo what you change.** The runner resets the route (or reloads, for onboarding), presses
   Escape and puts the recording toggles back before every state. A setting a state changes
   (`call updateSettings`) is put back in its `after`.
8. **Fix the map, not the image.** If a declared state cannot exist in the real app, change
   `ui-map.ts` (and the renderer's `uiArea` if an area goes) and say why in a comment there.

## Worked example

Settings → Screenshots (`settingsScreenshots`) declares `page: default` and
`options: preview · copy`, gated by the settings `screenshotAfterCapture` and
`screenshotCopy`. Illustrative, not tested:

```ts
// catalog/settings-screenshots.ts
import { catalog, type Step } from "../types";

const page: Step = { navigate: "/settings/screenshots" };
const set = (patch: Record<string, string>): Step => ({ call: "updateSettings", args: [patch] });

export const settingsScreenshots = catalog(
  "settingsScreenshots",
  {
    default: {
      profile: "default",
      steps: [page],
      demonstrates: ["settingsScreenshots.page:default", "settingsScreenshots.options:preview"],
      gates: [
        { setting: "screenshotAfterCapture", side: "preview" },
        { setting: "screenshotCopy", side: "auto" },
      ],
    },
    copy: {
      profile: "default",
      steps: [set({ screenshotAfterCapture: "copy", screenshotCopy: "manual" }), page],
      demonstrates: ["settingsScreenshots.options:copy"],
      gates: [
        { setting: "screenshotAfterCapture", side: "copy" },
        { setting: "screenshotCopy", side: "manual" },
      ],
      after: [set({ screenshotAfterCapture: "preview", screenshotCopy: "auto" })],
    },
  },
);
```

Then add it to `CATALOGS` in `index.ts`, run `bun run test` (the coverage test must stop
listing the screen) and `bun run check-types`, push, and shoot it on the mini:

```bash
cd apps/kaipu-record && bun run ui-catalog:remote --only 'settingsScreenshots/*'
```

Open the copied PNGs under `.evidence/ui-catalog/<sha>/screens/settingsScreenshots/`. A
state that could not be reached leaves what the window looked like in `debug/`, and
`run.log` has the reason and every `call`'s answer.

## Choosing a profile

`default` covers most states. Add a profile only for what exists at launch: the vault's
content (`seed`, `reconcile`), a forced flag (`flags`), onboarding left up, or screen
capture (`recording`, which runs last and is the only one allowed real takes). A state that
needs the API is not capturable: the catalog runs offline.
