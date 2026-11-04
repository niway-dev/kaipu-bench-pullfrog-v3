import type { SidebarMode } from "@shared/types";

/**
 * The rail's mode as last known in this window, readable synchronously. The renderer root
 * (I18nRoot) awaits the settings before the first paint and leaves the mode here, so the rail
 * mounts in the saved mode instead of the default and then jumping (NIW2-626). The sidebar
 * keeps it current, so a remount after a full-window page opens in the mode the user left.
 */
let snapshot: SidebarMode | null = null;

export function rememberSidebarMode(mode: SidebarMode): void {
  snapshot = mode;
}

/** `null` until a root or the sidebar has seen the settings. */
export function knownSidebarMode(): SidebarMode | null {
  return snapshot;
}

export function __resetSidebarModeSnapshotForTests(): void {
  snapshot = null;
}
