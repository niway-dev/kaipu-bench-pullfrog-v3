import { useEffect, useSyncExternalStore } from "react";
import type { SidebarMode } from "@shared/types";
import { useAppSettings } from "@renderer/pages/settings/use-app-settings";
import {
  isRailShown,
  knownSidebarMode,
  registerRail,
  rememberSidebarMode,
  sidebarModeChanged,
  subscribeSidebarMode,
  toggleSidebarMode,
} from "./sidebar-mode-snapshot";

export { nextSidebarMode } from "./sidebar-mode-snapshot";

/**
 * Cmd+\ on macOS, Ctrl+\ elsewhere (NIW2-626). No global shortcut and no editor key uses it.
 * Matched on the physical key as well as the character, so a layout that types something else
 * on that key still has the shortcut; Shift and Alt are left for other uses.
 */
export function isSidebarToggleKey(event: KeyboardEvent, platform: string): boolean {
  const mod = platform === "darwin" ? event.metaKey && !event.ctrlKey : event.ctrlKey;
  return (
    mod && !event.shiftKey && !event.altKey && (event.key === "\\" || event.code === "Backslash")
  );
}

/**
 * Whether the window-level shortcut may act on this key press: not when another handler took
 * it, not while the user types in a field, and not while a modal dialog owns the keyboard.
 */
export function sidebarShortcutMayRun(event: KeyboardEvent): boolean {
  if (event.defaultPrevented) return false;
  const target = event.target instanceof Element ? event.target : null;
  if (
    target?.closest(
      'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="dialog"][aria-modal="true"]',
    )
  ) {
    return false;
  }
  return document.querySelector('[role="dialog"][aria-modal="true"]') === null;
}

/** The toggle's shortcut as the platform writes it. */
export function sidebarToggleHint(platform: string): string {
  return platform === "darwin" ? "⌘\\" : "Ctrl+\\";
}

/**
 * The rail's mode for the sidebar, persisted in the app settings so it survives a restart.
 * `null` while it is not known yet (no root left it and the settings have not arrived): the
 * rail then draws nothing rather than the default and a jump. While mounted it also marks the
 * rail as shown (so the title bar draws the toggle) and owns the Cmd/Ctrl+\ shortcut.
 */
export function useSidebarMode(): { mode: SidebarMode | null; changed: boolean } {
  const { settings } = useAppSettings();
  const mode = useSyncExternalStore(subscribeSidebarMode, knownSidebarMode);
  const changed = useSyncExternalStore(subscribeSidebarMode, sidebarModeChanged);

  // The settings win until the user changes the mode here.
  useEffect(() => {
    if (settings && !sidebarModeChanged()) rememberSidebarMode(settings.sidebarMode);
  }, [settings]);

  useEffect(() => registerRail(), []);

  useEffect(() => {
    const platform = window.electronAPI.platform;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.repeat || !isSidebarToggleKey(event, platform)) return;
      if (!sidebarShortcutMayRun(event)) return;
      event.preventDefault();
      toggleSidebarMode();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return { mode, changed };
}

/** The title bar's view: the mode, whether a rail is on screen, and the switch. */
export function useSidebarToggle(): { mode: SidebarMode | null; shown: boolean } {
  const mode = useSyncExternalStore(subscribeSidebarMode, knownSidebarMode);
  const shown = useSyncExternalStore(subscribeSidebarMode, isRailShown);
  return { mode, shown };
}
