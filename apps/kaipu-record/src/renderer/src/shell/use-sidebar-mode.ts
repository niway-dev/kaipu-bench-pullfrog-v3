import { useCallback, useEffect, useState } from "react";
import { DEFAULT_SIDEBAR_MODE, SIDEBAR_MODES, type SidebarMode } from "@shared/types";
import { useAppSettings } from "@renderer/pages/settings/use-app-settings";

/** The mode after `mode` in the toggle's cycle: expanded → stacked → collapsed → expanded. */
export function nextSidebarMode(mode: SidebarMode): SidebarMode {
  return SIDEBAR_MODES[(SIDEBAR_MODES.indexOf(mode) + 1) % SIDEBAR_MODES.length]!;
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
 * The rail's mode, persisted in the app settings so it survives a restart. A change shows at
 * once, before the settings write comes back, and two presses in a row each advance one step.
 */
export function useSidebarMode(): { mode: SidebarMode; cycle: () => void } {
  const { settings, update } = useAppSettings();
  const [chosen, setChosen] = useState<SidebarMode | null>(null);
  const mode = chosen ?? settings?.sidebarMode ?? DEFAULT_SIDEBAR_MODE;

  const cycle = useCallback(() => {
    const next = nextSidebarMode(mode);
    setChosen(next);
    void update({ sidebarMode: next });
  }, [mode, update]);

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

  return { mode, cycle };
}
