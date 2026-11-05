/**
 * Flows the app has that no image can show, because macOS draws them and `page.screenshot`
 * only draws a window's web contents (spec decision 15). The README lists them so a reader
 * knows they exist.
 */
export const NATIVE_NOT_CAPTURABLE: readonly { readonly title: string; readonly reason: string }[] =
  [
    {
      title: "Screenshot selector (Frame, Window, Screen)",
      reason: "the system `screencapture` selector draws it, not the app (ADR 0022)",
    },
    {
      title: "Permission dialogs",
      reason: "macOS's own prompts for screen recording, microphone, camera and accessibility",
    },
    {
      title: "Folder and file pickers",
      reason: "native dialogs: add a workspace, import a video, choose an export destination",
    },
    {
      title: "Menu-bar tray menu",
      reason: "a native menu; the panel it opens is under Floating windows (capturePanel)",
    },
    {
      title: "Traffic lights and window chrome",
      reason: "composited by macOS over the hidden title bar, outside the web contents",
    },
    {
      title: "Settings → Developer",
      reason: "a DEV-only page, absent from the production build the catalog runs",
    },
  ];

/**
 * Why a map state has no image, as a kind. Every static `notCapturable` declaration and every
 * runtime reason carries one, and `INSTRUCTIONS` must answer each: a new kind without an
 * instruction does not compile, and a reason without a kind does not type-check.
 */
export const NOT_CAPTURABLE_KINDS = [
  "permission",
  "needsApi",
  "inducedFailure",
  "transient",
  "platform",
  "needsSetup",
  "unpublished",
  "runFailure",
  "native",
] as const;

export type NotCapturableKind = (typeof NOT_CAPTURABLE_KINDS)[number];

export interface NotCapturable {
  readonly kind: NotCapturableKind;
  /** The reason the README prints. */
  readonly why: string;
}

/** Declares one not-capturable map state: `{ "record.audio:unavailable": nc("inducedFailure", "…") }`. */
export function nc(kind: NotCapturableKind, why: string): NotCapturable {
  return { kind, why };
}

export interface Instruction {
  /** Heading of the group in the version README. */
  readonly title: string;
  /** Imperative next step. `{id}` is replaced by each state id; without it the step is printed once per group. */
  readonly next: string;
}

export const INSTRUCTIONS: Readonly<Record<NotCapturableKind, Instruction>> = {
  permission: {
    title: "Needs a permission the runner holds",
    next: "Revoke the permission on the runner (a second runner or user account with it denied, or `tccutil reset <Service> <bundle id>` on the mini before a dedicated run), then rerun. The catalog never revokes grants itself.",
  },
  needsApi: {
    title: "Needs the API or an account",
    next: "Check it by hand against a real account. To catalog it, run against a local API with a seeded signed-in session (not built; follow-up).",
  },
  inducedFailure: {
    title: "Needs a failure on purpose",
    next: "Force the failure by hand and check it. To catalog it, add a fixture or step that makes the call fail (not built).",
  },
  transient: {
    title: "Transient state",
    next: "Check it by hand: it lasts too short to shoot without racing it. To catalog it, add a test-only hold hook in the app that pins the state (not built).",
  },
  platform: {
    title: "Needs other hardware or platform",
    next: "Check it by hand on the platform or hardware the reason names (a second display, Windows, a stable window list).",
  },
  needsSetup: {
    title: "Needs a setup the catalog does not have yet",
    next: "Add a catalog step or fixture that produces the state, or check it by hand.",
  },
  unpublished: {
    title: "Shot locally, kept private",
    next: "Look at the image in the local `.evidence/ui-catalog/<sha>/` run only: it shows real content, so it is never published.",
  },
  runFailure: {
    title: "Failed or timed out in this run",
    next: "Rerun `bun run ui-catalog:remote --only '{id}'`; if it repeats, open a ticket.",
  },
  native: {
    title: "Native macOS UI",
    next: "Check it by hand: it cannot be shot from web contents.",
  },
};
