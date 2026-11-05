import React, { useState } from "react";
import { ChevronUp } from "lucide-react";
import { useTranslations } from "@kaipu/i18n";
import { useOptionalWorkspaces } from "../workspaces-context";
import { useMoveUi } from "./move-store";
import { MoveTargetList, useMoveLock } from "./move-target-list";
import styles from "./move.module.css";
import type { UiAreaProps } from "@renderer/lib/ui-area";

/**
 * The Library's bottom bar in select mode (spec decision 20): "N selected · Move to ▸", a way
 * to clear and to leave select mode. While a group runs it shows "Moving 3 of 12…" and Stop,
 * which lets the move in flight finish and starts no further one.
 */
export function SelectionBar({
  count,
  onMoveTo,
  onClear,
  onDone,
  ui,
}: {
  count: number;
  onMoveTo(target: string | "new"): void;
  onClear(): void;
  onDone(): void;
  ui?: UiAreaProps;
}): React.JSX.Element | null {
  const t = useTranslations("move");
  const workspaces = useOptionalWorkspaces();
  const lock = useMoveLock(workspaces?.state ?? null);
  const { progress } = useMoveUi();
  const [open, setOpen] = useState(false);
  if (!workspaces?.state || !workspaces.active) return null;

  if (progress) {
    return (
      <div {...ui} className={styles.selectionBar} role="status">
        <span className={styles.progress}>
          {t("moving", { current: Math.max(progress.current, 1), total: progress.total })}
        </span>
        <span className={styles.selectionDivider} aria-hidden />
        <button
          type="button"
          className={styles.selectionButton}
          onClick={() => void window.electronAPI.workspaces.cancelMove()}
        >
          {t("stop")}
        </button>
      </div>
    );
  }

  return (
    <div {...ui} className={styles.selectionBar} role="toolbar" aria-label={t("select")}>
      <span className={styles.selectionCount}>{t("selectedCount", { count })}</span>
      <span className={styles.selectionDivider} aria-hidden />
      <div className={styles.chipAnchor}>
        <button
          type="button"
          className={styles.selectionButton}
          data-primary
          aria-haspopup="menu"
          aria-expanded={open}
          disabled={count === 0}
          onClick={() => setOpen(!open)}
        >
          {t("moveTo")}
          <ChevronUp size={13} />
        </button>
        {open && (
          <>
            <div className={styles.backdrop} onClick={() => setOpen(false)} aria-hidden />
            <div
              className={styles.menu}
              data-placement="above"
              role="menu"
              aria-label={t("moveTo")}
            >
              <MoveTargetList
                state={workspaces.state}
                active={workspaces.active}
                lock={lock}
                onPick={(target) => {
                  setOpen(false);
                  onMoveTo(target);
                }}
              />
            </div>
          </>
        )}
      </div>
      <button
        type="button"
        className={styles.selectionGhost}
        onClick={onClear}
        disabled={count === 0}
      >
        {t("clearSelection")}
      </button>
      <button type="button" className={styles.selectionGhost} onClick={onDone}>
        {t("selectDone")}
      </button>
    </div>
  );
}
