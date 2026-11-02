import React, { useEffect, useId, useRef, useState } from "react";
import { X } from "lucide-react";
import { Input, ModalButton, ModalOverlay } from "@kaipu/ui";
import { TAG_COLORS, nextTagColor, type TagColor } from "@kaipu/domain/constants";
import { useTranslations } from "@kaipu/i18n";
import type {
  LocationCheck,
  WorkspaceCreateRefusal,
  WorkspaceCreateResult,
  WorkspaceEditRefusal,
  WorkspaceEditResult,
  WorkspacesState,
  WorkspaceView,
} from "@shared/types/workspaces";
import { validateWorkspaceName } from "@shared/workspace-name";
import "@renderer/features/library/tags/tag-palette.css";
import styles from "./workspace-dialog.module.css";

type Created = Extract<WorkspaceCreateResult, { ok: true }>;
type Saved = Extract<WorkspaceEditResult, { ok: true }>;

export interface WorkspaceDialogProps {
  state: WorkspacesState;
  /** The workspace being edited, or null for "New workspace". */
  editing: WorkspaceView | null;
  onClose(): void;
  /** "Use an existing folder…": the folder-picker flow, for Google Drive or OneDrive folders. */
  onUseExisting(): void;
  onCreated(result: Created): void;
  onSaved(result: Saved): void;
}

/** What a location check allows: a free name, or an empty folder that is already there. */
const USABLE: ReadonlySet<LocationCheck["state"]> = new Set(["free", "empty"]);

/**
 * "New workspace" and "Edit workspace" (NIW2-599): a name, a color and, for a new one, where its
 * folder goes. A new workspace gets a NEW folder `Kaipu Record — <name>` next to the Default
 * workspace's, shown in full; adopting an existing folder stays one click away.
 */
export function WorkspaceDialog({
  state,
  editing,
  onClose,
  onUseExisting,
  onCreated,
  onSaved,
}: WorkspaceDialogProps): React.JSX.Element {
  const t = useTranslations("workspaces");
  const tc = useTranslations("common");
  const tl = useTranslations("library");
  const id = useId();
  const formRef = useRef<HTMLFormElement>(null);

  const [name, setName] = useState(editing?.name ?? "");
  const [color, setColor] = useState<TagColor>(
    () => editing?.color ?? nextTagColor(state.workspaces.map((w) => w.color)),
  );
  const [location, setLocation] = useState<LocationCheck | null>(null);
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<WorkspaceCreateRefusal | WorkspaceEditRefusal | null>(
    null,
  );

  const check = validateWorkspaceName(name, state.workspaces, editing?.id);
  const validName = check.ok ? check.name : null;

  // The overlay focuses itself when it mounts, after its children's effects: take the focus
  // back for the field the user came to fill.
  useEffect(() => {
    const frame = requestAnimationFrame(() => formRef.current?.querySelector("input")?.focus());
    return () => cancelAnimationFrame(frame);
  }, []);

  // Where the folder would go, asked of main (it knows the Default workspace's folder). An
  // answer for a name that is no longer in the box is dropped.
  useEffect(() => {
    if (editing) return;
    setLocation(null);
    if (!validName) return;
    let alive = true;
    void window.electronAPI.workspaces.checkLocation(name).then((next) => {
      if (alive) setLocation(next);
    });
    return () => {
      alive = false;
    };
    // `name` rather than `validName`: the path follows what the user typed, normalized by main.
  }, [editing, name, validName]);

  const changed = editing ? validName !== editing.name || color !== editing.color : true;
  const canSubmit =
    !busy &&
    !state.readOnly &&
    validName !== null &&
    changed &&
    (editing ? true : location !== null && USABLE.has(location.state));

  const submit = async (): Promise<void> => {
    if (!canSubmit || !validName) return;
    setBusy(true);
    setRefusal(null);
    try {
      if (editing) {
        const result = await window.electronAPI.workspaces.edit({
          id: editing.id,
          ...(validName !== editing.name ? { name: validName } : {}),
          ...(color !== editing.color ? { color } : {}),
        });
        if (result.ok) onSaved(result);
        else setRefusal(result.reason);
      } else {
        const result = await window.electronAPI.workspaces.create({ name: validName, color });
        if (result.ok) onCreated(result);
        else setRefusal(result.reason);
      }
    } finally {
      setBusy(false);
    }
  };

  const nameError = !check.ok && check.reason === "taken" ? t("nameTaken") : null;
  const title = editing ? t("editTitle") : t("newTitle");

  return (
    <ModalOverlay onCancel={onClose} labelledBy={`${id}-title`} size="wide">
      <form
        ref={formRef}
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <header className={styles.header}>
          <h3 id={`${id}-title`} className={styles.title}>
            {title}
          </h3>
          <button type="button" className={styles.close} aria-label={tc("close")} onClick={onClose}>
            <X size={14} strokeWidth={1.8} />
          </button>
        </header>

        <div className={styles.body}>
          <div className={styles.field}>
            <Input
              id={`${id}-name`}
              label={t("nameLabel")}
              value={name}
              placeholder={t("namePlaceholder")}
              autoComplete="off"
              spellCheck={false}
              aria-invalid={nameError !== null}
              aria-describedby={nameError ? `${id}-name-error` : undefined}
              onChange={(event) => {
                setName(event.currentTarget.value);
                setRefusal(null);
              }}
            />
            {nameError && (
              <p id={`${id}-name-error`} className={styles.error}>
                {nameError}
              </p>
            )}
          </div>

          <div className={styles.field}>
            <span className={styles.label} id={`${id}-color`}>
              {t("colorLabel")}
            </span>
            <div className={styles.swatches} role="radiogroup" aria-labelledby={`${id}-color`}>
              {TAG_COLORS.map((option) => (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={option === color}
                  aria-label={tl(`tagColor_${option}`)}
                  title={tl(`tagColor_${option}`)}
                  className={styles.swatch}
                  data-color={option}
                  onClick={() => setColor(option)}
                />
              ))}
            </div>
          </div>

          <div className={styles.field}>
            <span className={styles.label}>{editing ? t("folderLabel") : t("locationLabel")}</span>
            {editing ? (
              <code className={styles.path} title={editing.path}>
                {editing.path}
              </code>
            ) : (
              <LocationSummary location={location} hasName={validName !== null} />
            )}
            {editing && <p className={styles.hint}>{t("editHint")}</p>}
          </div>

          {refusal && (
            <p className={styles.error} role="alert">
              {refusalMessage(refusal, t)}
            </p>
          )}
        </div>

        <footer className={styles.footer}>
          {!editing && (
            <button type="button" className={styles.link} onClick={onUseExisting}>
              {t("useExisting")}
            </button>
          )}
          <span className={styles.spacer} />
          <div className={styles.actions}>
            <ModalButton variant="ghost" onClick={onClose}>
              {tc("cancel")}
            </ModalButton>
            <ModalButton variant="primary" disabled={!canSubmit} onClick={() => void submit()}>
              {editing ? tc("save") : t("createAction")}
            </ModalButton>
          </div>
        </footer>
      </form>
    </ModalOverlay>
  );
}

function LocationSummary({
  location,
  hasName,
}: {
  location: LocationCheck | null;
  hasName: boolean;
}): React.JSX.Element {
  const t = useTranslations("workspaces");
  if (!hasName) return <p className={styles.hint}>{t("locationNeedsName")}</p>;
  if (!location) return <p className={styles.hint}>{t("locationChecking")}</p>;
  const bad = location.state === "not-empty" || location.state === "parent-missing";
  return (
    <>
      {location.path && (
        <code className={styles.path} title={location.path} data-bad={bad || undefined}>
          {location.path}
        </code>
      )}
      <p className={bad ? styles.error : styles.hint}>
        {t(
          location.state === "free"
            ? "locationFree"
            : location.state === "empty"
              ? "locationEmpty"
              : location.state === "not-empty"
                ? "locationNotEmpty"
                : "locationParentMissing",
        )}
      </p>
    </>
  );
}

function refusalMessage(
  reason: WorkspaceCreateRefusal | WorkspaceEditRefusal,
  t: ReturnType<typeof useTranslations<"workspaces">>,
): string {
  switch (reason) {
    case "exists":
      return t("locationNotEmpty");
    case "parent-missing":
      return t("locationParentMissing");
    case "name-taken":
      return t("nameTaken");
    case "read-only":
      return t("readOnly");
    case "unknown":
      return t("removeRefusedUnknown");
    case "not-writable":
      return t("createNotWritable");
    default:
      return t("createFailed");
  }
}
