import { SIDEBAR_MODES, type SidebarMode } from "@shared/types";

/**
 * The rail's mode as last known in this window, shared by the rail and the title bar's toggle
 * and readable synchronously (NIW2-626).
 *
 * The renderer root (I18nRoot) awaits the settings before the first paint and leaves the mode
 * here, so the rail mounts in the saved mode instead of the default and then jumping. The
 * sidebar keeps it in step with the settings, so a remount after a full-window page opens in
 * the mode the user left. The toggle lives in the title bar and the rail draws the result, so
 * both read this one value rather than each keeping its own.
 */
let snapshot: SidebarMode | null = null;
/** True after the user's first change: only those animate. */
let changed = false;
/** The rails on screen; the toggle shows only while one is. A set, so a stale unmount is a no-op. */
const rails = new Set<symbol>();
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function subscribeSidebarMode(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function rememberSidebarMode(mode: SidebarMode): void {
  if (snapshot === mode) return;
  snapshot = mode;
  emit();
}

/** `null` until a root or the sidebar has seen the settings. */
export function knownSidebarMode(): SidebarMode | null {
  return snapshot;
}

export function sidebarModeChanged(): boolean {
  return changed;
}

/** The other mode: expanded (stacked) ↔ collapsed. */
export function nextSidebarMode(mode: SidebarMode): SidebarMode {
  return SIDEBAR_MODES[(SIDEBAR_MODES.indexOf(mode) + 1) % SIDEBAR_MODES.length]!;
}

/**
 * Switch the mode, as the toggle button and Cmd/Ctrl+\ do: it shows at once, before the
 * settings write comes back, and is saved so it survives a restart.
 */
export function toggleSidebarMode(): void {
  if (!snapshot) return;
  const next = nextSidebarMode(snapshot);
  snapshot = next;
  changed = true;
  emit();
  void window.electronAPI.updateSettings({ sidebarMode: next });
}

/** A rail mounted; call the returned function when it unmounts. */
export function registerRail(): () => void {
  const token = Symbol("rail");
  rails.add(token);
  emit();
  return () => {
    if (rails.delete(token)) emit();
  };
}

export function isRailShown(): boolean {
  return rails.size > 0;
}

export function __resetSidebarModeSnapshotForTests(): void {
  snapshot = null;
  changed = false;
  rails.clear();
  listeners.clear();
}
