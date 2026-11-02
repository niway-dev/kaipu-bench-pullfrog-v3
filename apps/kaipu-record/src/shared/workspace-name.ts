/**
 * A workspace's display name and the folder created for it. Pure and import-free, so the
 * renderer (live validation in the dialog), main (the authority) and the preload bundle can
 * all use it: `src/shared` never takes a value import from a workspace package.
 */

export const WORKSPACE_NAME_MAX_LENGTH = 64;

/** The folder a new workspace gets, next to the Default workspace's: "Kaipu Record — Work". */
export const WORKSPACE_FOLDER_PREFIX = "Kaipu Record — ";

/** The workspace's display name, or null when nothing usable is left. */
export function normalizeWorkspaceName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.normalize("NFKC").trim().replace(/\s+/g, " ");
  // eslint-disable-next-line no-control-regex
  if (name.length === 0 || /[\u0000-\u001f\u007f-\u009f]/.test(name)) return null;
  return name.slice(0, WORKSPACE_NAME_MAX_LENGTH).trimEnd();
}

export type WorkspaceNameCheck =
  | { ok: true; name: string }
  | { ok: false; reason: "empty" | "taken" };

/**
 * Normalize `raw` and check it against the registered names (case-insensitive). The workspace
 * being edited (`exceptId`) may keep its own name.
 */
export function validateWorkspaceName(
  raw: string,
  existing: readonly { id: string; name: string }[],
  exceptId?: string,
): WorkspaceNameCheck {
  const name = normalizeWorkspaceName(raw);
  if (!name) return { ok: false, reason: "empty" };
  const key = name.toLocaleLowerCase();
  const taken = existing.some(
    (other) => other.id !== exceptId && other.name.toLocaleLowerCase() === key,
  );
  return taken ? { ok: false, reason: "taken" } : { ok: true, name };
}

/**
 * `Kaipu Record — <name>`, with what no file system accepts replaced by a dash, and no dot,
 * space or dash left at the end (Windows refuses a trailing dot or space).
 */
export function newWorkspaceFolderName(name: string): string {
  const safe = name.replace(/[\\/:*?"<>|]/g, "-").replace(/[. -]+$/g, "");
  return `${WORKSPACE_FOLDER_PREFIX}${safe}`;
}
