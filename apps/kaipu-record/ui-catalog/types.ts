import type { AreaId, Gate, ScreenId, StateId, WindowKind } from "../src/shared/ui-map";
import type { KaipuElectronAPI } from "../src/shared/types/electron-api";
import { WINDOW_PRESETS } from "../src/shared/window-size";
import type { ProfileName } from "./profiles";

/**
 * The catalog format (spec "The catalog file format"). The UI map (`src/shared/ui-map.ts`)
 * says what exists; a catalog state says how to reach some of it in the real app, as data,
 * so the README can say how each image was made and the coverage test can check that every
 * map state has an image or a reason why not.
 */

/** Window sizes a route state may ask for. Floating windows are never resized. */
export const WINDOW_SIZES = {
  main: { width: WINDOW_PRESETS.main.width, height: WINDOW_PRESETS.main.height },
  "main-min": { width: WINDOW_PRESETS.main.minWidth, height: WINDOW_PRESETS.main.minHeight },
  editor: { width: WINDOW_PRESETS.editor.width, height: WINDOW_PRESETS.editor.height },
  "editor-min": {
    width: WINDOW_PRESETS.editor.minWidth,
    height: WINDOW_PRESETS.editor.minHeight,
  },
} as const;
export type WindowSize = keyof typeof WINDOW_SIZES;

export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

/** The map states of one screen: `record.mic:on`, … */
export type StateIn<S extends ScreenId> = Extract<StateId, `${S}.${string}`>;
/** The areas of one screen: `record.mic`, … */
export type AreaIn<S extends ScreenId> = Extract<AreaId, `${S}.${string}`>;

/**
 * A sub-locator inside an area: by ARIA role (and accessible name), by CSS, or by text.
 * Prefer role; text and names are English (the catalog pins `locale: "en"`).
 */
export type Part =
  | { readonly role: string; readonly name?: string; readonly exact?: boolean }
  | { readonly css: string }
  | { readonly text: string; readonly exact?: boolean };

export interface Target {
  readonly area: AreaId;
  readonly part?: Part;
  /** Only the instances of the area that contain this text (a card by its title). */
  readonly hasText?: string;
  /** Which match, when the area or part repeats (cards, rows). Default: the first. */
  readonly nth?: number;
}

/** A preload method, or a method of one of its namespaces (`workspaces.dismissHint`). */
export type ApiMethod =
  | (keyof KaipuElectronAPI & string)
  | `${keyof KaipuElectronAPI & string}.${string}`;

/**
 * Named runner helpers for what plain data cannot say (pick a real screen source, start a
 * take). Discouraged: each one is code the README can only name, not describe.
 */
export const ACTIONS = [
  /** Make the first display the selected source (`getScreenSources` → `updateRecordingSettings`). */
  "selectFirstScreen",
  /** Ask main to start a take on the selected source, as the capture panel's Start does. */
  "startTake",
  /** Ask for a take without waiting for it (to catch its countdown). */
  "requestTake",
  /** Stop a running take and wait until the app is idle again. */
  "stopTake",
  /** Pause / resume the running take through the control bar's commands. */
  "pauseTake",
  "resumeTake",
  /**
   * Cancel a capture overlay pick: Escape if the overlay is still open (it may have closed
   * itself), then wait until no overlay is visible.
   */
  "cancelPick",
  /**
   * Make the workspace folder unreadable (`chmod 000`), so listing it fails: what an
   * unreachable drive does. Always paired with `unlockVault` in `after`.
   */
  "lockVault",
  "unlockVault",
  /**
   * Put the workspace folder back as it was when the profile launched (a state that renamed
   * files, saved an edit session or exported a copy), so a second shot starts from the same
   * vault. Pair it with the state's own undo only when that cannot be done in the UI.
   */
  "restoreVault",
  /** Reload the main window, so per-session renderer state (the reconcile scan) starts over. */
  "reloadMain",
  /** Empty the system clipboard (`clipboard.clear()` in main), so "no image on it" is a state. */
  "clearClipboard",
] as const;
export type ActionName = (typeof ACTIONS)[number];

/** Where a step runs: the state's own window (default), the main window, or a floating one. */
type On = { readonly on?: "main" | "target" | WindowKind };

export type WaitTarget =
  | { readonly area: AreaId; readonly part?: Part; readonly state?: "visible" | "hidden" }
  /**
   * A video has its first frame. In the video editor this also waits for the timeline's
   * thumbnails (and the webcam lane's), which decode after the video and appear all at once.
   * `"paused-at-start"` also pauses every video at 0:00 and waits for that frame to paint,
   * for a player that autoplays (a shot of it would catch whichever frame came up).
   */
  | { readonly video: true | "paused-at-start" }
  | { readonly window: WindowKind };

export type Step =
  /** Hash navigation in the main window: `{ navigate: "/library" }`. */
  | ({ readonly navigate: string } & On)
  | ({ readonly click: Target } & On)
  | ({ readonly hover: Target } & On)
  | ({ readonly press: string; readonly target?: Target } & On)
  | ({ readonly fill: Target; readonly value: string } & On)
  | ({ readonly waitFor: WaitTarget; readonly timeoutMs?: number } & On)
  /** `window.electronAPI[method](...args)` in the page. */
  | ({ readonly call: ApiMethod; readonly args?: readonly Json[] } & On)
  /** Show a hidden window without focus (`BrowserWindow.showInactive()`). */
  | { readonly show: WindowKind | "main" }
  | { readonly hide: WindowKind | "main" }
  /** Resize the main window to a named size. */
  | { readonly window: WindowSize }
  | { readonly action: ActionName }
  /** Scroll an instance into view (a card below the fold) without hovering it. */
  | ({ readonly scrollTo: Target } & On)
  /** A fixed pause. Discouraged: wait for something instead. */
  | { readonly waitMs: number };

/** A runner permission, as `checkPermissions()` + `getAccessibilityStatus()` report it. */
export type PermissionName = "screen" | "microphone" | "camera" | "accessibility";
export type Requires = Partial<Record<PermissionName, boolean>>;

/** A gate and the side of it a state shows: `{ recordingSetting: "isCameraEnabled", side: "on" }`. */
export type GateSide = Gate & { readonly side: string };

/**
 * Crops whose bytes change between two runs on one commit for a reason the app owns (a
 * clock, a running timer, live screen content). `--twice` does not report them; the README
 * prints the reason beside each.
 */
export interface KnownVariable {
  readonly areas: readonly AreaId[];
  /** State ids (`<screen>/<name>`, globs allowed as in `--only`); every state when absent. */
  readonly states?: readonly string[];
  readonly reason: string;
}

export function isKnownVariable(
  known: readonly KnownVariable[],
  stateId: string,
  area: string,
): boolean {
  return known.some(
    (k) =>
      (k.areas as readonly string[]).includes(area) &&
      (!k.states || matchesOnly(stateId, k.states.join(","))),
  );
}

export interface CatalogState<S extends ScreenId> {
  /** The launch profile (`profiles.ts`); the runner launches once per profile. */
  readonly profile: ProfileName;
  /** One sentence for the README's "How reached" column; default: generated from steps. */
  readonly how?: string;
  /** Route screens only. Default: the preset the route asks for (`main` or `editor`). */
  readonly window?: WindowSize;
  readonly steps?: readonly Step[];
  /** The map states this image is evidence of. At least one. */
  readonly demonstrates: readonly [StateIn<S>, ...StateIn<S>[]];
  /** What must be on screen before the shot. Default: the screen's `page`/`root` area. */
  readonly ready?: { readonly area: AreaIn<S> } | { readonly video: true | "paused-at-start" };
  /** The side of each gate this state shows, so the README can pair both sides. */
  readonly gates?: readonly GateSide[];
  /** Steps that undo what this state did, before the next state of the profile. */
  readonly after?: readonly Step[];
  /**
   * Permissions the runner must (or must not) have; else not capturable, with the reason.
   * This is the only way a state is excused from running: any other error fails the run, so a
   * flaky state cannot pass as "not capturable" (the profile's `requires` counts too).
   */
  readonly requires?: Requires;
  /** Which instance to crop for an area that repeats (a card in a grid). */
  readonly crops?: Partial<
    Record<AreaIn<S>, { readonly part?: Part; readonly hasText?: string; readonly nth?: number }>
  >;
  /**
   * Must still be on screen right after the shot. For a state that is moving when it is shot
   * (an export's progress card): if it has already moved on, the shot shows the wrong state
   * and the run fails instead of keeping it.
   */
  readonly stillOnScreen?: Target;
  /** Keep the pointer where the steps left it (hover states). Default: parked in a corner. */
  readonly keepPointer?: boolean;
  /**
   * The image shows what was on the runner's screen (a source thumbnail, a capture's preview,
   * a take's first frame). It cannot be scanned as text, so `ui-catalog:lint` lists it for a
   * look by eye before publishing (spec failure 7).
   */
  readonly embedsScreen?: boolean;
  /** Per-state budget for steps + ready, ms. Default 20 s. */
  readonly timeoutMs?: number;
}

export interface ScreenCatalog<S extends ScreenId = ScreenId> {
  readonly screen: S;
  readonly states: Readonly<Record<string, CatalogState<S>>>;
  /** Map states no catalog state can show, each with the reason the README prints. */
  readonly notCapturable: Readonly<Partial<Record<StateIn<S>, string>>>;
  /**
   * Gated areas whose other side has no look of its own (the area simply is not drawn),
   * with that reason: `{ "record.countdown": "with 0 s there is no countdown" }`.
   */
  readonly oneSided: Readonly<Partial<Record<AreaIn<S>, string>>>;
}

export interface CatalogExtras<S extends ScreenId> {
  readonly notCapturable?: Partial<Record<StateIn<S>, string>>;
  readonly oneSided?: Partial<Record<AreaIn<S>, string>>;
}

/** Any screen's catalog; what `catalog/index.ts` exports a list of. */
export type AnyScreenCatalog = { [S in ScreenId]: ScreenCatalog<S> }[ScreenId];

/**
 * Declare one screen's catalog. Typed on the screen, so a `demonstrates` entry, an area or
 * a `notCapturable` key from another screen, or one the map does not declare, is a compile
 * error. State names become ids `<screen>/<name>` and paths `screens/<screen>/<name>.png`.
 */
export function catalog<S extends ScreenId>(
  screen: S,
  states: Record<string, CatalogState<S>>,
  extras: CatalogExtras<S> = {},
): ScreenCatalog<S> {
  for (const name of Object.keys(states)) {
    if (!/^[A-Za-z0-9-]+(@min)?$/.test(name)) {
      throw new Error(`ui-catalog: state name "${screen}/${name}" must be [A-Za-z0-9-], @min`);
    }
  }
  return {
    screen,
    states,
    notCapturable: extras.notCapturable ?? ({} as Partial<Record<StateIn<S>, string>>),
    oneSided: extras.oneSided ?? ({} as Partial<Record<AreaIn<S>, string>>),
  };
}

/** A catalog state with its id, flattened for the runner. */
export interface CatalogEntry {
  /** `<screen>/<name>`. */
  readonly id: string;
  readonly screen: ScreenId;
  readonly name: string;
  readonly spec: CatalogState<ScreenId>;
}

export function flattenCatalog(catalogs: readonly AnyScreenCatalog[]): CatalogEntry[] {
  return catalogs.flatMap((c) =>
    Object.entries(c.states as Record<string, CatalogState<ScreenId>>).map(([name, spec]) => ({
      id: `${c.screen}/${name}`,
      screen: c.screen,
      name,
      spec,
    })),
  );
}

/**
 * `--only` globs: comma-separated, `*` matches anything (slashes included), `?` one
 * character. `record/*` → every Record state; `*@min` → every minimum-size state.
 */
export function matchesOnly(id: string, only: string | undefined): boolean {
  if (!only || only.trim() === "") return true;
  return only
    .split(",")
    .map((glob) => glob.trim())
    .filter(Boolean)
    .some((glob) => {
      const source = glob
        .split("")
        .map((ch) =>
          ch === "*" ? ".*" : ch === "?" ? "." : ch.replace(/[.+^${}()|[\]\\]/g, "\\$&"),
        )
        .join("");
      return new RegExp(`^${source}$`).test(id);
    });
}

/** A readable sentence for one step, for the README's "How reached". */
export function describeStep(step: Step): string {
  const target = (t: Target): string => {
    const part = t.part
      ? "role" in t.part
        ? ` ${t.part.role}${t.part.name ? ` "${t.part.name}"` : ""}`
        : "css" in t.part
          ? ` \`${t.part.css}\``
          : ` "${t.part.text}"`
      : "";
    const which = t.hasText ? ` "${t.hasText}"` : "";
    return `\`${t.area}\`${which}${part}${t.nth ? ` #${t.nth + 1}` : ""}`;
  };
  if ("navigate" in step) return `Go to \`#${step.navigate}\``;
  if ("click" in step) return `Click ${target(step.click)}`;
  if ("hover" in step) return `Hover ${target(step.hover)}`;
  if ("press" in step)
    return `Press ${step.press}${step.target ? ` in ${target(step.target)}` : ""}`;
  if ("fill" in step) return `Type "${step.value}" in ${target(step.fill)}`;
  if ("scrollTo" in step) return `Scroll to ${target(step.scrollTo)}`;
  if ("waitFor" in step) {
    const w = step.waitFor;
    if ("video" in w) return "Wait for a video frame";
    if ("window" in w) return `Wait for the ${w.window} window`;
    return `Wait for ${target(w)}${w.state === "hidden" ? " to close" : ""}`;
  }
  if ("call" in step) {
    const args = (step.args ?? []).map((a) => JSON.stringify(a)).join(", ");
    return `Call \`${step.call}(${args})\``;
  }
  if ("show" in step) return `Show the ${step.show} window`;
  if ("hide" in step) return `Hide the ${step.hide} window`;
  if ("window" in step) return `Resize to ${step.window}`;
  if ("action" in step) return `Run \`${step.action}\``;
  return `Wait ${step.waitMs} ms`;
}
