import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { SIDEBAR_MODES, type SidebarMode } from "@shared/types";
import { WINDOW_PRESETS, presetForPath } from "@shared/window-size";
import { useAppSettings } from "@renderer/pages/settings/use-app-settings";
import { knownSidebarMode, rememberSidebarMode } from "./sidebar-mode-snapshot";

/** What the 200px row takes beyond the 64px rail every preset's minimum was tuned for. */
const ROW_EXTRA_WIDTH = 200 - 64;

/**
 * Below this window width a saved `expanded-row` rail draws as `stacked` on `pathname`: the
 * route's preset minimum plus the row's extra 136px, so the content keeps the width its layout
 * was tuned for. The editor: 1180 + 136 = 1316. Every sidebar page: 900 + 136 = 1036, under
 * the main window's 1040. The saved setting is not touched, so widening the window brings the
 * rows back.
 */
export function rowMinWindowWidth(pathname: string): number {
  return WINDOW_PRESETS[presetForPath(pathname)].minWidth + ROW_EXTRA_WIDTH;
}

function subscribeResize(onChange: () => void): () => void {
  window.addEventListener("resize", onChange);
  return () => window.removeEventListener("resize", onChange);
}

const windowWidth = (): number => window.innerWidth;

/** The mode the rail draws: the saved one, with rows stacked in a narrow window. */
export function displayedSidebarMode(saved: SidebarMode, narrow: boolean): SidebarMode {
  return saved === "expanded-row" && narrow ? "stacked" : saved;
}

/** The mode after `mode` in the toggle's cycle: expanded → stacked → collapsed → expanded. */
export function nextSidebarMode(mode: SidebarMode): SidebarMode {
  return SIDEBAR_MODES[(SIDEBAR_MODES.indexOf(mode) + 1) % SIDEBAR_MODES.length]!;
}

/** The mode a toggle press shows next: the cycle, skipping rows while they cannot fit. */
export function nextShownSidebarMode(mode: SidebarMode, narrow: boolean): SidebarMode {
  const next = nextSidebarMode(mode);
  return next === "expanded-row" && narrow ? nextSidebarMode(next) : next;
}

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
 * The rail's mode, persisted in the app settings so it survives a restart. `null` while it is
 * not known yet (no root left it and the settings have not arrived): the rail then draws
 * nothing rather than the default and a jump. A change shows at once, before the settings
 * write comes back, and two presses in a row each advance one step. `changed` turns true on
 * the first change the user makes, so only those animate.
 */
export function useSidebarMode(pathname: string): {
  mode: SidebarMode | null;
  /** What the next press will show (for the toggle's label). */
  next: SidebarMode | null;
  changed: boolean;
  cycle: () => void;
} {
  const { settings, update } = useAppSettings();
  const [startup] = useState(knownSidebarMode);
  const [chosen, setChosen] = useState<SidebarMode | null>(null);
  const saved = chosen ?? settings?.sidebarMode ?? startup;
  const narrow = useSyncExternalStore(subscribeResize, windowWidth) < rowMinWindowWidth(pathname);
  const mode = saved ? displayedSidebarMode(saved, narrow) : null;
  const next = mode ? nextShownSidebarMode(mode, narrow) : null;

  useEffect(() => {
    if (saved) rememberSidebarMode(saved);
  }, [saved]);

  // Steps from what is on screen, skipping rows that cannot fit, so a press always shows a change.
  const cycle = useCallback(() => {
    if (!next) return;
    setChosen(next);
    void update({ sidebarMode: next });
  }, [next, update]);

  useEffect(() => {
    const platform = window.electronAPI.platform;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.repeat || !isSidebarToggleKey(event, platform)) return;
      if (!sidebarShortcutMayRun(event)) return;
      event.preventDefault();
      cycle();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cycle]);

  return { mode, next, changed: chosen !== null, cycle };
}
