import type { Gate, ScreenId } from "../src/shared/ui-map";
import type { KnownVariable } from "./types";

/**
 * The shape of `manifest.json`: everything the run knows about itself and each state. The
 * README is generated from it alone (`readme.ts`), so the two can never disagree (spec
 * failure 13). It names the runner by a neutral label, never by its hostname or user: the
 * manifest is published with the images.
 */

export const MANIFEST_VERSION = 1;

export interface ManifestArea {
  /** `<screen>.<area>`. */
  readonly id: string;
  readonly states: readonly string[];
  /** README wording of each gate: `flag native-cursor-capture`, `permission microphone`. */
  readonly gates: readonly string[];
}

export interface ManifestScreen {
  readonly id: ScreenId;
  readonly kind: "route" | "window" | "chrome" | "overlay";
  /** `#/library`, `?window=control-bar`, or how chrome/overlays are reached. */
  readonly where: string;
  /** The window size states of this screen are shot at by default, `1040×760`; null for floating windows. */
  readonly windowSize: string | null;
  readonly areas: readonly ManifestArea[];
  /** Map states declared not capturable, with the reason. */
  readonly notCapturable: Readonly<Record<string, string>>;
  /** Gated areas whose other side draws nothing, with the reason. */
  readonly oneSided: Readonly<Record<string, string>>;
  /** Map states the catalog shows, but only in states this run skipped (`--only`). */
  readonly notRun: readonly string[];
  /** Whether every map state of the screen has a catalog state or a not-capturable reason. */
  readonly covered: boolean;
  /** Whether every catalog state of the screen ran (false under `--only`). */
  readonly complete: boolean;
}

export interface ShotArea {
  readonly id: string;
  /** Relative to the output folder. */
  readonly file: string;
  readonly rect: { x: number; y: number; width: number; height: number };
  readonly sha256: string;
}

export type StateStatus = "shot" | "notCapturable" | "failed";

export interface ManifestState {
  /** `<screen>/<name>`. */
  readonly id: string;
  readonly screen: ScreenId;
  readonly name: string;
  readonly profile: string;
  readonly status: StateStatus;
  /** Not capturable or failed: why. */
  readonly reason?: string;
  readonly demonstrates: readonly string[];
  /** The image embeds real screen content: `ui-catalog:lint` lists it for a look by eye. */
  readonly embedsScreen?: boolean;
  /** README sentence: the `how` text or the steps, described. */
  readonly how: string;
  readonly gates: readonly { readonly label: string; readonly side: string }[];
  readonly window?: {
    readonly file: string;
    readonly kind: string;
    readonly width: number;
    readonly height: number;
    readonly bounds: { x: number; y: number; width: number; height: number } | null;
    readonly sha256: string;
  };
  readonly areasFound: readonly ShotArea[];
  /** Areas of the screen the DOM did not have in this state (a closed panel). */
  readonly areasAbsent: readonly string[];
  readonly pageErrors: readonly string[];
  readonly durationMs: number;
}

export interface ManifestProfile {
  readonly name: string;
  readonly description: string;
  readonly launched: boolean;
  /** Overrides asked for (`KAIPU_FLAG_OVERRIDES`). */
  readonly flags: Readonly<Record<string, boolean>>;
  /** Overrides the renderer reported back (`window.electronAPI.flagOverrides`). */
  readonly rendererFlags: Readonly<Record<string, boolean>> | null;
  readonly permissions: Readonly<Record<string, string | boolean>> | null;
  /** The primary display the windows were on. */
  readonly display: { readonly scaleFactor: number; readonly size: string } | null;
  readonly error?: string;
}

export interface Manifest {
  readonly manifestVersion: typeof MANIFEST_VERSION;
  readonly app: {
    readonly name: "kaipu-record";
    readonly version: string;
    readonly sha: string;
    readonly shortSha: string;
    readonly dirty: boolean;
    /** When `out/main/index.js` was written. */
    readonly builtAt: string | null;
  };
  readonly generatedAt: string;
  readonly runner: {
    readonly label: string;
    readonly macos: string;
    readonly scaleFactor: number | null;
    readonly display: string | null;
  };
  readonly options: { readonly only: string | null; readonly twice: boolean };
  readonly profiles: readonly ManifestProfile[];
  readonly screens: readonly ManifestScreen[];
  readonly states: readonly ManifestState[];
  /** Crops whose bytes are expected to change between runs, each with its reason. */
  readonly knownVariable: readonly KnownVariable[];
  /** Crops that differed between the two shots of `--twice`, outside `knownVariable`. */
  readonly nondeterministic: readonly string[];
  /** Everything that makes the run exit non-zero. */
  readonly failures: readonly string[];
  /** The native flows the README lists as not capturable. */
  readonly nativeNotCapturable: readonly { readonly title: string; readonly reason: string }[];
}

/** README wording of a gate. */
export function gateLabel(gate: Gate): string {
  if ("flag" in gate) return `flag ${gate.flag}`;
  if ("setting" in gate) return `setting ${gate.setting}`;
  if ("recordingSetting" in gate) return `recording setting ${gate.recordingSetting}`;
  if ("permission" in gate) return `permission ${gate.permission}`;
  return `account ${gate.account}`;
}
