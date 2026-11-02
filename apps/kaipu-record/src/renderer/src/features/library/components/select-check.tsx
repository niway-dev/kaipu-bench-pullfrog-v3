import React from "react";
import { Check } from "lucide-react";
import styles from "./select-check.module.css";

/** In the Library's select mode, how a card or row takes part (spec decision 20). */
export interface ItemSelection {
  checked: boolean;
  /** Why this item cannot be checked (cloud-only, unreadable record), or null. */
  disabledReason: string | null;
  label: string;
  /** A click on the item: `range` when Shift was held (select from the last clicked one). */
  onToggle(range: boolean): void;
}

/** The checkbox a card or row shows in select mode. Clicks are handled by the item itself. */
export function SelectCheck({ selection }: { selection: ItemSelection }): React.JSX.Element {
  return (
    <span
      className={styles.check}
      role="checkbox"
      aria-checked={selection.checked}
      aria-disabled={selection.disabledReason !== null || undefined}
      aria-label={selection.label}
      title={selection.disabledReason ?? undefined}
      data-checked={selection.checked || undefined}
      data-disabled={selection.disabledReason !== null || undefined}
    >
      {selection.checked && <Check size={12} strokeWidth={3} />}
    </span>
  );
}
