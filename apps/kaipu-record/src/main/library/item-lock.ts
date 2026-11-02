import { withLock } from "./atomic-write";

/**
 * One lock per item for every writer of it (ADR 0033, decision 12): an edit-session save, a
 * screenshot overwrite, a rename, a delete and a move to another workspace. Keyed by
 * `(workspaceId, itemId)` and separate from the sidecar lock. The order is always item lock,
 * then the names lock, then the sidecar lock, so they cannot deadlock (`withLock` is not
 * re-entrant: never take the same item lock from inside `fn`).
 */
export function withItemLock<T>(
  workspaceId: string,
  itemId: string,
  fn: () => Promise<T>,
): Promise<T> {
  return withLock(`item:${workspaceId}:${itemId}`, fn);
}

/** A write reached an item that moved to another workspace meanwhile: nothing was written. */
export class ItemMovedError extends Error {
  constructor(readonly id: string) {
    super(`item-moved: "${id}" is no longer in this workspace; nothing was written`);
    this.name = "ItemMovedError";
  }
}
