import { relocateActive, type ActiveTransactionDeps } from "./switch-transaction";
import type { RelocateOutcome, WorkspaceRegistry } from "./registry";

/**
 * "Change folder…" (relocate), after the folder picker: point a workspace at the folder where it
 * now lives. Pure of Electron, so every rule is unit-tested. It never moves, copies or writes
 * the user's files; the registry's `relocate` holds the rules about which folders qualify.
 */
export interface RelocateDeps extends ActiveTransactionDeps {
  registry: Pick<WorkspaceRegistry, "get" | "active" | "readOnly" | "checkRelocate" | "relocate">;
}

/**
 * Refused before the picker opens: no point asking for a folder that could not be used. The
 * lock holds for every workspace, not only the active one: a take or an export is running.
 */
export function relocateRefusal(
  deps: Pick<RelocateDeps, "registry" | "busy">,
  id: string,
): Extract<RelocateOutcome, { ok: false }> | null {
  if (deps.registry.readOnly) return { ok: false, reason: "read-only" };
  if (!deps.registry.get(id)) return { ok: false, reason: "unknown" };
  const busy = deps.busy();
  return busy ? { ok: false, reason: busy } : null;
}

export async function relocateWorkspace(
  deps: RelocateDeps,
  id: string,
  chosen: string,
): Promise<RelocateOutcome> {
  const refused = relocateRefusal(deps, id);
  if (refused) return refused;
  // Validated before any window is asked to prepare: a folder that will be refused costs the
  // user no "unsaved changes" question.
  const checked = await deps.registry.checkRelocate(id, chosen);
  if (!checked.ok) return checked;
  if (id !== deps.registry.active().id) return deps.registry.relocate(id, chosen);
  // The active workspace's items are open in the windows: same transaction as a switch.
  return relocateActive(deps, id, () => deps.registry.relocate(id, chosen));
}
