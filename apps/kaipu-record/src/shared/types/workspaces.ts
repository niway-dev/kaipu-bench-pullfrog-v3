import type { TagColor } from "@kaipu/domain/constants";

/**
 * Workspaces (ADR 0032): separate libraries, one active at a time. Types only, so the
 * preload bundle can import this file (see the `src/shared` rule in CLAUDE.md).
 */

/** What every item-scoped call is made under; main refuses a call whose stamp is not the active one. */
export interface WorkspaceStamp {
  workspaceId: string;
  /** Bumped by main in the last step of every switch. */
  generation: number;
}

/** Why a registered workspace cannot be used right now. */
export type WorkspaceUnavailableReason =
  /** The folder is gone: an unplugged drive or a deleted folder. */
  | "missing"
  /** `.kaipu/workspace/identity.json` exists but cannot be read or parsed. */
  | "unreadable"
  /** Another workspace's identity is in that folder. */
  | "different";

/** Why a switch did not happen. */
export type WorkspaceSwitchRefusal =
  /** A recording or an export is writing into the active workspace (the LOCKED state). */
  | "recording"
  | "exporting"
  /** The target is not connected. */
  | "unavailable"
  /** A window said no (Cancel on an unsaved editor) or did not answer in time. */
  | "cancelled"
  /** The id is not registered. */
  | "unknown"
  /** preferences.json could not be parsed: nothing is written until the next launch. */
  | "read-only";

export interface WorkspaceView {
  id: string;
  name: string;
  color: TagColor;
  /** One or two characters for the tile. */
  initials: string;
  path: string;
  /** The volume name for a folder under /Volumes, else null (this Mac's disk). */
  volume: string | null;
  state: "available" | "unavailable";
  reason?: WorkspaceUnavailableReason;
  /** Local item count, only for the active workspace (null when it was not listed). */
  itemCount: number | null;
}

/** `workspaces:list` (and the `workspaces:changed` broadcast). */
export interface WorkspacesState {
  activeId: string;
  generation: number;
  /** The one-time "New: workspaces" hint was dismissed (or a workspace was added). */
  hintDismissed: boolean;
  /** A recording or export is running: switching is locked. */
  busy: "recording" | "exporting" | null;
  /** preferences.json did not parse: the app runs as before and changes nothing on disk. */
  readOnly: boolean;
  workspaces: WorkspaceView[];
}

export type WorkspaceSwitchResult = { ok: true } | { ok: false; reason: WorkspaceSwitchRefusal };

export type WorkspaceAddResult =
  | { ok: true; workspace: WorkspaceView }
  | { ok: false; reason: "cancelled" | "not-writable" | "read-only" };

/** Where "New workspace" would put its folder, and whether that folder can be used. */
export type LocationState =
  /** Nothing is there: Kaipu creates the folder. */
  | "free"
  /** An empty folder is already there: Kaipu uses it. */
  | "empty"
  /** Something is there (a file, or a folder with content): refused, nothing is touched. */
  | "not-empty"
  /** The folder next to the Default workspace cannot be reached (an unplugged drive). */
  | "parent-missing";

export interface LocationCheck {
  /** The full path of the folder to create, or null when it cannot be worked out. */
  path: string | null;
  state: LocationState;
}

export type WorkspaceCreateRefusal =
  | "read-only"
  | "invalid-name"
  | "invalid-color"
  | "name-taken"
  | "exists"
  | "parent-missing"
  | "not-writable";

/** `workspaces:create`: a new folder next to the Default workspace's, then a switch to it. */
export type WorkspaceCreateResult =
  | {
      ok: true;
      workspace: WorkspaceView;
      /** Creating switches like any other switch; a recording running refuses it. */
      switchResult: WorkspaceSwitchResult;
    }
  | { ok: false; reason: WorkspaceCreateRefusal };

export interface WorkspaceEditRequest {
  id: string;
  name?: string;
  color?: TagColor;
}

export type WorkspaceEditRefusal =
  | "read-only"
  | "unknown"
  | "invalid-name"
  | "invalid-color"
  | "name-taken"
  | "not-writable";

/** `workspaces:edit`: rename and/or recolor. */
export type WorkspaceEditResult =
  | {
      ok: true;
      workspace: WorkspaceView;
      /**
       * False for a workspace that is not connected: the change is in the registry and reaches
       * the folder's `identity.json` when it is reconnected.
       */
      savedToFolder: boolean;
    }
  | { ok: false; reason: WorkspaceEditRefusal };

/**
 * Why "Change folder…" (relocate) did not point a workspace at the picked folder. Relocating
 * never moves or copies files: it only says where the workspace now lives.
 */
export type WorkspaceRelocateRefusal =
  | "read-only"
  | "unknown"
  /** The user closed the folder picker, or a window answered Cancel to an unsaved editor. */
  | "cancelled"
  /** A recording or an export is writing into the active workspace (the LOCKED state). */
  | "recording"
  | "exporting"
  /** The picked path is not a folder. */
  | "not-a-folder"
  /** The folder's `identity.json` exists but cannot be read; it is never overwritten. */
  | "unreadable"
  /** Another workspace's identity is in that folder; `workspaceName` names it. */
  | "different"
  /** The folder is already registered as another workspace; `workspaceName` names it. */
  | "already-registered"
  /** `.kaipu/` is there (items' sidecars) but no workspace identity: not this workspace's folder. */
  | "has-items-no-identity"
  /** No `.kaipu` at all: an empty or plain folder. Never adopted silently. */
  | "not-a-workspace"
  /** The registry could not store the new path. */
  | "not-writable";

/** `workspaces:relocate`: the folder picker, then the workspace is pointed at the folder. */
export type WorkspaceRelocateResult =
  | { ok: true; workspace: WorkspaceView }
  | {
      ok: false;
      reason: WorkspaceRelocateRefusal;
      /** The other workspace, for `different` and `already-registered`. */
      workspaceName?: string;
    };

export type WorkspaceRemoveResult =
  | { ok: true }
  | { ok: false; reason: "active" | "last" | "unknown" | "read-only" };

/** Main → window `workspaces:prepare`: flush, ask about unsaved work, close editors. */
export interface WorkspacePrepareRequest {
  requestId: number;
}

/** Window → main `workspaces:prepare-result`. */
export interface WorkspacePrepareResult {
  requestId: number;
  ok: boolean;
}

/** The message main rejects a stale item-scoped call with (ADR 0032, decision 6). */
export const STALE_WORKSPACE = "stale-workspace";
