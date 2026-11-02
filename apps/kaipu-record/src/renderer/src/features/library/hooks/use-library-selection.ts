import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * The Library's select mode (spec decision 20): which items are checked, by asset id. A click
 * toggles one; a shift-click selects the range between the last clicked item and this one, in
 * the order on screen (`visible`, whatever sort, search or filter is in effect). Changing the
 * search, a chip or the sort (`resetKey`) clears the selection, so a selection never moves
 * items the user can no longer see. Items `canSelect` refuses are never checked.
 */
export function useLibrarySelection<T extends { assetId: string }>(
  visible: readonly T[],
  resetKey: string,
  canSelect: (item: T) => boolean,
): LibrarySelection<T> {
  const [active, setActive] = useState(false);
  const [checked, setChecked] = useState<ReadonlySet<string>>(new Set());
  const anchor = useRef<string | null>(null);

  useEffect(() => {
    setChecked(new Set());
    anchor.current = null;
  }, [resetKey]);

  const toggle = useCallback(
    (assetId: string, range: boolean): void => {
      const order = visible.map((item) => item.assetId);
      const from = anchor.current !== null ? order.indexOf(anchor.current) : -1;
      const to = order.indexOf(assetId);
      setChecked((current) => {
        const next = new Set(current);
        if (range && from !== -1 && to !== -1) {
          const [lo, hi] = from < to ? [from, to] : [to, from];
          for (const item of visible.slice(lo, hi + 1)) {
            if (canSelect(item)) next.add(item.assetId);
          }
        } else if (next.has(assetId)) next.delete(assetId);
        else next.add(assetId);
        return next;
      });
      anchor.current = assetId;
    },
    [visible, canSelect],
  );

  // The checked items, in the order on screen; ones that left the list are dropped.
  const selected = useMemo(
    () => visible.filter((item) => checked.has(item.assetId)),
    [visible, checked],
  );

  return {
    active,
    start: () => setActive(true),
    stop: () => {
      setActive(false);
      setChecked(new Set());
      anchor.current = null;
    },
    isChecked: (assetId) => checked.has(assetId),
    toggle,
    clear: () => setChecked(new Set()),
    replace: (assetIds) => setChecked(new Set(assetIds)),
    selected,
  };
}

export interface LibrarySelection<T> {
  active: boolean;
  start(): void;
  /** Leave select mode; nothing stays checked. */
  stop(): void;
  isChecked(assetId: string): boolean;
  toggle(assetId: string, range: boolean): void;
  clear(): void;
  /** Check exactly these (after a group move: the items that stayed). */
  replace(assetIds: Iterable<string>): void;
  selected: T[];
}
