import React, { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

/**
 * The right end of the app header (design "Kaipu Workspaces v2", section 2): on a page that
 * belongs to an item, the "IN · Work ▾" chip sits there. The shell owns the element; a page
 * renders into it with `<HeaderEnd>`.
 */
let element: HTMLElement | null = null;
const listeners = new Set<() => void>();

export function setHeaderEndElement(next: HTMLElement | null): void {
  if (element === next) return;
  element = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function HeaderEnd({ children }: { children: React.ReactNode }): React.ReactPortal | null {
  const target = useSyncExternalStore(subscribe, () => element);
  return target ? createPortal(children, target) : null;
}
