import React, { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

/**
 * Places in the title bar a page renders into. The shell owns each element and hands it
 * over with `set…Element` as a ref; a page renders into it through a portal, so what it
 * puts there mounts and unmounts with the page.
 */
function createHeaderSlot(): {
  setElement(next: HTMLElement | null): void;
  Slot(props: { children: React.ReactNode }): React.ReactPortal | null;
} {
  let element: HTMLElement | null = null;
  const listeners = new Set<() => void>();
  const subscribe = (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  return {
    setElement(next) {
      if (element === next) return;
      element = next;
      for (const listener of listeners) listener();
    },
    Slot({ children }) {
      const target = useSyncExternalStore(subscribe, () => element);
      return target ? createPortal(children, target) : null;
    },
  };
}

/**
 * The right end of the bar (design "Kaipu Workspaces v2", section 2): on a page that
 * belongs to an item, the "IN · Work ▾" chip sits there.
 */
const end = createHeaderSlot();
export const setHeaderEndElement = end.setElement;
export const HeaderEnd = end.Slot;

/**
 * Left of the end slot (Kaipu Black, NIW2-619): a page's own actions — the video editor's
 * undo, redo, split, delete, status and Export — while that page is open.
 */
const actions = createHeaderSlot();
export const setHeaderActionsElement = actions.setElement;
export const HeaderActions = actions.Slot;
