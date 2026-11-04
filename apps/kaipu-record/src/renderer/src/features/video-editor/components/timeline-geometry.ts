import type { CoveredRange, SourceThumbnail } from "../use-source-thumbnails";

export function timeToFraction(t: number, duration: number): number {
  if (duration <= 0) return 0;
  return Math.max(0, Math.min(1, t / duration));
}

export function fractionToTime(f: number, duration: number): number {
  return Math.max(0, Math.min(1, f)) * duration;
}

function formatTick(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Labelled step (seconds) → how many parts the minor ticks cut it into. Each minor step
 *  is a round number of seconds or quarter seconds, so the ruler reads like a real one. */
const TICK_STEPS = [
  [1, 4],
  [2, 4],
  [5, 5],
  [10, 5],
  [15, 3],
  [30, 6],
  [60, 4],
  [120, 4],
  [300, 5],
  [600, 5],
] as const;

function rulerStep(duration: number): (typeof TICK_STEPS)[number] {
  return TICK_STEPS.find(([s]) => duration / s <= 10) ?? TICK_STEPS[TICK_STEPS.length - 1];
}

export function rulerTicks(duration: number): { time: number; label: string }[] {
  const [step] = rulerStep(duration);
  const ticks: { time: number; label: string }[] = [];
  for (let t = 0; t <= duration; t += step) {
    ticks.push({ time: t, label: formatTick(t) });
  }
  return ticks;
}

/** The unlabelled ticks between the labelled ones. Built from an integer index, not by
 *  adding the step repeatedly, so 0.25 s steps do not drift off the labelled ticks. */
export function rulerMinorTicks(duration: number): number[] {
  const [step, parts] = rulerStep(duration);
  const minor = step / parts;
  const times: number[] = [];
  for (let i = 1; i * minor <= duration; i++) {
    if (i % parts !== 0) times.push(i * minor);
  }
  return times;
}

/** The time under the pointer while hovering the ruler, to a tenth of a second ("0:07.4"). */
export function formatScrubTime(seconds: number): string {
  const tenths = Math.floor(Math.max(0, seconds) * 10);
  const m = Math.floor(tenths / 600);
  const s = Math.floor((tenths % 600) / 10);
  return `${m}:${String(s).padStart(2, "0")}.${tenths % 10}`;
}

function tileTargets(sourceStart: number, sourceEnd: number, count: number): number[] {
  return Array.from(
    { length: Math.max(0, count) },
    (_, i) => sourceStart + ((i + 0.5) / count) * (sourceEnd - sourceStart),
  );
}

function nearestThumbnail(thumbnails: SourceThumbnail[], target: number): SourceThumbnail {
  let nearest = thumbnails[0];
  for (const thumb of thumbnails) {
    if (Math.abs(thumb.sourceTime - target) < Math.abs(nearest.sourceTime - target)) {
      nearest = thumb;
    }
  }
  return nearest;
}

export function thumbnailsForRange(
  thumbnails: SourceThumbnail[],
  sourceStart: number,
  sourceEnd: number,
  count: number,
): SourceThumbnail[] {
  if (thumbnails.length === 0) return [];
  return tileTargets(sourceStart, sourceEnd, count).map((t) => nearestThumbnail(thumbnails, t));
}

/**
 * {@link thumbnailsForRange} for a file that does not cover the whole source (the webcam
 * starts late or ends early): a tile outside `covered` ([start, end), SOURCE time) is null —
 * there is no footage there, so it must not borrow the first or last frame.
 */
export function thumbnailsForRangeWithin(
  thumbnails: SourceThumbnail[],
  sourceStart: number,
  sourceEnd: number,
  count: number,
  covered: CoveredRange,
): (SourceThumbnail | null)[] {
  if (thumbnails.length === 0) return [];
  return tileTargets(sourceStart, sourceEnd, count).map((t) =>
    t >= covered.start && t < covered.end ? nearestThumbnail(thumbnails, t) : null,
  );
}
