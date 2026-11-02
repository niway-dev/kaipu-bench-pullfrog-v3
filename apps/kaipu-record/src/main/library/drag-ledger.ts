import { rm } from "node:fs/promises";

/** A drop target may still be reading a file dragged this recently (ADR 0033, decision 11). */
export const DRAG_SETTLE_MS = 10_000;

export interface DragEntry {
  workspaceId: string;
  itemId: string;
  /** The per-drag folder under `.kaipu/drag/`, or null when the vault file itself was dragged. */
  dir: string | null;
  startedAt: number;
}

/**
 * The drag copies main created, in memory (ADR 0033, decision 11). Electron gives no "drop
 * finished" event, so the age of an entry is the only signal. A move refuses an item dragged
 * within `DRAG_SETTLE_MS`, and removes the item's older drag folders before it starts, so the
 * item's bytes never stay in the source under its title.
 */
export class DragLedger {
  private entries: DragEntry[] = [];

  constructor(private readonly now: () => number = Date.now) {}

  record(entry: Omit<DragEntry, "startedAt">): void {
    this.entries.push({ ...entry, startedAt: this.now() });
  }

  /** True when the item was dragged less than `DRAG_SETTLE_MS` ago. */
  draggedJustNow(workspaceId: string, itemId: string): boolean {
    const now = this.now();
    return this.entries.some(
      (e) =>
        e.workspaceId === workspaceId && e.itemId === itemId && now - e.startedAt < DRAG_SETTLE_MS,
    );
  }

  /** Delete every drag folder of the item and forget them. Best effort per folder. */
  async clear(workspaceId: string, itemId: string): Promise<void> {
    const mine = this.entries.filter((e) => e.workspaceId === workspaceId && e.itemId === itemId);
    this.entries = this.entries.filter((e) => !mine.includes(e));
    await Promise.allSettled(
      mine.flatMap((e) => (e.dir ? [rm(e.dir, { recursive: true, force: true })] : [])),
    );
  }
}

/** The process's one ledger: `startFileDrag` writes it, the mover reads it. */
export const dragLedger = new DragLedger();
