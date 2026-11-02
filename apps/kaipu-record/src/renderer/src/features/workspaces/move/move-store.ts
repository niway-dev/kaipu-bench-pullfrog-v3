import { useSyncExternalStore } from "react";
import type { MoveProgress } from "@shared/types/workspaces";

/** "Move all N" / "Move only …", or null when the dialog was dismissed (nothing moves). */
export type ExportsAnswer = "all" | "only" | null;

export interface ExportsPrompt {
  /** How many exports the selection's recordings have in the source workspace. */
  count: number;
  /** The source workspace's name. */
  source: string;
  /** Items selected (the recording alone, or a multi-select). */
  selected: number;
  answer(choice: ExportsAnswer): void;
}

interface MoveUiState {
  /** "Moving 3 of 12" while a group this window started runs; null otherwise. */
  progress: MoveProgress | null;
  prompt: ExportsPrompt | null;
}

let state: MoveUiState = { progress: null, prompt: null };
const listeners = new Set<() => void>();

function set(patch: Partial<MoveUiState>): void {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useMoveUi(): MoveUiState {
  return useSyncExternalStore(subscribe, () => state);
}

export function setMoveProgress(progress: MoveProgress | null): void {
  set({ progress });
}

/** Ask "Move them too?" (ADR 0033, decision 15); resolves the user's answer. */
export function askAboutExports(question: Omit<ExportsPrompt, "answer">): Promise<ExportsAnswer> {
  state.prompt?.answer(null);
  return new Promise((resolve) => {
    set({
      prompt: {
        ...question,
        answer: (choice) => {
          set({ prompt: null });
          resolve(choice);
        },
      },
    });
  });
}

/** For tests: back to nothing running and nothing asked. */
export function resetMoveUi(): void {
  state = { progress: null, prompt: null };
}
