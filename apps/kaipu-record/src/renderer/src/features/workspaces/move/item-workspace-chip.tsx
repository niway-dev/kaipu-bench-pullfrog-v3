import React, { useEffect, useState } from "react";
import { Check, ChevronDown, Lock } from "lucide-react";
import { useTranslations } from "@kaipu/i18n";
import { showToast } from "@renderer/ui/toast-store";
import { isWindowsHost } from "@renderer/features/shortcuts/host-platform";
import { HeaderEnd } from "../header-slot";
import { closeItemPage } from "../prepare-switch";
import { WorkspaceTile } from "../workspace-switcher";
import { useOptionalWorkspaces } from "../workspaces-context";
import { MoveTargetList, useMoveLock } from "./move-target-list";
import { reasonText } from "./move-flow";
import { useMoveItems } from "./use-move-items";
import styles from "./move.module.css";

/**
 * "IN · Work ▾" (design "Kaipu Workspaces v2", section 2): in an editor, the header's right
 * end says which workspace the item belongs to, and its menu moves it. Moving closes the
 * editor first. Locked (with the reason) while a recording, an export or a move runs.
 *
 * `assetId` is null while the item is not in any workspace yet (an unsaved capture): the chip
 * is not shown.
 */
export function ItemWorkspaceChip({
  assetId,
  closes = "editor",
}: {
  assetId: string | null;
  /** What a move closes: an editor, or the item page. */
  closes?: "editor" | "page";
}): React.JSX.Element | null {
  const workspaces = useOptionalWorkspaces();
  if (!workspaces || assetId === null) return null;
  return (
    <HeaderEnd>
      <Chip assetId={assetId} closes={closes} />
    </HeaderEnd>
  );
}

function Chip({
  assetId,
  closes,
}: {
  assetId: string;
  closes: "editor" | "page";
}): React.JSX.Element | null {
  const t = useTranslations("move");
  const tw = useTranslations("workspaces");
  const { state, active } = useOptionalWorkspaces()!;
  const move = useMoveItems();
  const lock = useMoveLock(state);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!state || !active) return null;
  const location = active.volume ?? (isWindowsHost() ? tw("thisPc") : tw("thisMac"));

  const pick = async (target: string | "new"): Promise<void> => {
    setOpen(false);
    // The current id and the exports come from a fresh list: a rename may have changed the id.
    const library = await window.electronAPI.listLocalRecordings();
    const item = library.find((entry) => entry.assetId === assetId);
    if (!item) {
      showToast({ message: reasonText("not-found", (key) => t(key as Parameters<typeof t>[0])) });
      return;
    }
    await move({ items: [item], target, library, before: closeItemPage });
  };

  return (
    <div className={styles.chipAnchor}>
      <button
        type="button"
        className={styles.chip}
        data-open={open || undefined}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("chipLabel", { name: active.name })}
        onClick={() => setOpen(!open)}
      >
        <span className={styles.chipIn}>{t("chipIn")}</span>
        <WorkspaceTile workspace={active} size={18} />
        <span className={styles.chipName}>{active.name}</span>
        <span className={styles.chipChevron} aria-hidden>
          {lock ? <Lock size={11} /> : <ChevronDown size={12} />}
        </span>
      </button>
      {open && (
        <>
          <div className={styles.backdrop} onClick={() => setOpen(false)} aria-hidden />
          <div className={styles.menu} data-align="end" role="menu" aria-label={t("moveTo")}>
            <div className={styles.belongs}>
              <WorkspaceTile workspace={active} size={22} />
              <span className={styles.targetText}>
                <span className={styles.belongsName}>{active.name}</span>
                <span className={styles.targetCost}>
                  {t("belongsHere")} · {location}
                </span>
              </span>
              <Check size={14} strokeWidth={2.4} className={styles.belongsCheck} />
            </div>
            <div className={styles.divider} />
            <MoveTargetList
              state={state}
              active={active}
              lock={lock}
              onPick={(target) => void pick(target)}
            />
            <p className={styles.footnote}>
              {t(closes === "page" ? "closesPage" : "closesEditor")}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
