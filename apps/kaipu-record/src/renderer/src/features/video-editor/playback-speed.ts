/**
 * Preview playback speed (NIW2-666). View state only: the speed lives in
 * `usePreviewPlayback`, is never saved in the session or the scene, and never reaches the
 * export plan, the GIF plan or the export workers. Reopening the editor starts at 1x.
 */
export const PREVIEW_SPEEDS = [0.5, 1, 1.5, 2] as const;
export type PreviewSpeed = (typeof PREVIEW_SPEEDS)[number];

export const DEFAULT_SPEED: PreviewSpeed = 1;

/** The speed button's cycle: 1x -> 1.5x -> 2x -> 0.5x -> 1x. */
const CYCLE: readonly PreviewSpeed[] = [1, 1.5, 2, 0.5];

export function nextSpeed(current: number): PreviewSpeed {
  const index = CYCLE.indexOf(current as PreviewSpeed);
  // A value outside the list restarts the cycle from just after 1x.
  return CYCLE[index === -1 ? 1 : (index + 1) % CYCLE.length];
}
