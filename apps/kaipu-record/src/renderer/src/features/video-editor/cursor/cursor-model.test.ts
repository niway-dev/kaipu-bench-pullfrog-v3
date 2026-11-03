import { describe, expect, it } from "vitest";
import {
  CURSOR_SIZE_MAX,
  CURSOR_SIZE_MIN,
  DEFAULT_CURSOR,
  cursorLayerData,
  cursorSizeToSlider,
  cursorSliderToSize,
  parseCursorSettings,
  prepareCursor,
} from "./cursor-model";
import { initialScene } from "../scene";
import { parseSession, serializeSession } from "../session";
import { buildExportPlan, sliceExportPlan } from "../export/export-plan";
import type { Redaction } from "../privacy/redaction";
import { track } from "./cursor-test-fixtures";
import type { CursorTrack } from "@shared/cursor-track";
const identity = { cx: 0.5, cy: 0.5, scale: 1 };
describe("editable cursor", () => {
  it("requires positive exclusion provenance and nonempty recorded positions", () => {
    for (const capture of [null, undefined, {}, { cursorPixels: "embedded" as const }])
      expect(cursorLayerData(capture, track)).toBeNull();
    expect(cursorLayerData({ cursorPixels: "excluded" }, null)).toBeNull();
    expect(
      cursorLayerData({ cursorPixels: "excluded" }, { ...track, t: [], x: [], y: [] }),
    ).toBeNull();
    expect(cursorLayerData({ cursorPixels: "excluded" }, track)?.settings.visible).toBe(true);
  });
  it("transforms the hotspot after camera crop and keeps size fixed across zooms", () => {
    const at = prepareCursor(track, DEFAULT_CURSOR);
    const original = at(0.5, identity, 1920, 1080)!;
    const zoomed = at(0.5, { ...identity, scale: 2 }, 1920, 1080)!;
    expect(original.x).toBeCloseTo(1152);
    expect(zoomed.x).toBeCloseTo(1344);
    expect(zoomed.size).toBe(original.size);
    expect(at(0.5, { ...identity, cx: 0.25, scale: 4 }, 1920, 1080)).toBeNull();
  });
  it("smoothing and effects are repeatable after arbitrary seeks and cuts", () => {
    const settings = {
      ...DEFAULT_CURSOR,
      smoothing: 80,
      clickEffect: "ripple" as const,
      clickBounce: true,
    };
    const at = prepareCursor(track, settings),
      expected = at(0.6, identity, 1920, 1080);
    at(2.5, identity, 1920, 1080);
    at(0, identity, 1920, 1080);
    expect(at(0.6, identity, 1920, 1080)).toEqual(expected);
    expect(prepareCursor(track, settings)(0.6, identity, 1920, 1080)).toEqual(expected);
    expect(expected?.click?.progress).toBeCloseTo(0.2);
    expect(expected?.bounce).toBeLessThan(1);
    const scene = initialScene(3);
    scene.items = [
      { id: "cut", kind: "clip", sourceStart: 0.5, sourceEnd: 1 },
      { id: "slide", kind: "slide", assetId: "a", duration: 1, naturalWidth: 1, naturalHeight: 1 },
      { id: "later", kind: "clip", sourceStart: 2, sourceEnd: 3 },
    ];
    expect(sliceExportPlan(buildExportPlan(scene), 0.1, 2).segments[0]).toMatchObject({
      sourceStart: 0.6,
    });
    expect(at(0.6, identity, 1920, 1080)).toEqual(expected);
  });
  it("never invents clicks without click capture, even with populated click data", () => {
    const result = prepareCursor(
      { ...track, clicksAvailable: false },
      { ...DEFAULT_CURSOR, clickEffect: "circle", clickBounce: true },
    )(0.6, identity, 1920, 1080);
    expect(result?.click).toBeNull();
    expect(result?.bounce).toBe(1);
  });
  it("honours idle, track truncation, off-display, visibility and privacy boundaries", () => {
    const at = prepareCursor(track, { ...DEFAULT_CURSOR, idleHide: true });
    expect(at(2.499, identity, 1920, 1080)).not.toBeNull();
    expect(at(2.5, identity, 1920, 1080)).toBeNull();
    expect(at(-0.001, identity, 1920, 1080)).toBeNull();
    // Native hooks may start milliseconds after the first video packet. Clamp to the
    // first recorded position so opening the initial cursor-free frame has a pointer.
    expect(
      prepareCursor(
        { ...track, t: track.t.map((t) => t + 53) },
        { ...DEFAULT_CURSOR, smoothing: 0 },
      )(0, identity, 1920, 1080),
    ).toMatchObject({ x: 960, y: 540 });
    expect(
      prepareCursor({ ...track, truncatedAtMs: 600 }, DEFAULT_CURSOR)(0.6, identity, 1920, 1080),
    ).toBeNull();
    expect(
      prepareCursor({ ...track, x: [-1, -1, -1, -1, -1] }, DEFAULT_CURSOR)(
        0.5,
        identity,
        1920,
        1080,
      ),
    ).toBeNull();
    expect(
      prepareCursor(track, { ...DEFAULT_CURSOR, visible: false })(0.5, identity, 1920, 1080),
    ).toBeNull();
    expect(at(0.5, identity, 1920, 1080, [{ start: 0.5, end: 1 } as Redaction])).toBeNull();
  });
  it("migrates legacy sessions without losing cuts and normalizes malformed settings", () => {
    const scene = initialScene(3);
    delete scene.cursor;
    const migrated = parseSession(serializeSession(scene))!.scene;
    expect(migrated.cursor).toEqual(DEFAULT_CURSOR);
    expect(migrated.items).toEqual(scene.items);
    expect(
      parseCursorSettings({ size: 1000, smoothing: -3, style: "hand", visible: false }),
    ).toMatchObject({ size: CURSOR_SIZE_MAX, smoothing: 0, style: "arrow", visible: false });
    // A field the saved settings lack takes today's default, not "off".
    expect(parseCursorSettings({ size: 40 })).toEqual({ ...DEFAULT_CURSOR, size: 40 });
    migrated.cursor = {
      ...DEFAULT_CURSOR,
      style: "dot",
      size: 64,
      clickEffect: "ripple",
      idleHide: true,
    };
    expect(parseSession(serializeSession(migrated))!.scene).toEqual(migrated);
  });
  it("smooths without lag: a click lands under the pointer, not behind it", () => {
    // Pointer jumps from x=0.2 to x=0.8 at t=1000 ms and clicks there at t=1100 ms.
    const t = Array.from({ length: 41 }, (_, i) => i * 50);
    const step: CursorTrack = {
      ...track,
      t,
      x: t.map((ms) => (ms < 1000 ? 0.2 : 0.8)),
      y: t.map(() => 0.5),
      clicks: [{ t: 1100, x: 0.8, y: 0.5, button: 0 }],
    };
    const smooth = prepareCursor(step, { ...DEFAULT_CURSOR, smoothing: 50 });
    const atClick = smooth(1.1, identity, 1000, 1000)!;
    const raw = prepareCursor(step, { ...DEFAULT_CURSOR, smoothing: 0 })(
      1.1,
      identity,
      1000,
      1000,
    )!;
    expect(raw.x).toBeCloseTo(800);
    // A causal filter with tau = 100 ms would still be ~37% short (x ≈ 578) 100 ms later.
    expect(atClick.x).toBeGreaterThan(700);
    // And the motion is still smoothed: halfway through the jump the pointer is between.
    const mid = smooth(1.0, identity, 1000, 1000)!.x;
    expect(mid).toBeGreaterThan(300);
    expect(mid).toBeLessThan(700);
  });
  it("maps the size slider on a ratio scale, so each step is a visible change", () => {
    expect(cursorSliderToSize(0)).toBe(CURSOR_SIZE_MIN);
    expect(cursorSliderToSize(100)).toBe(CURSOR_SIZE_MAX);
    expect(cursorSliderToSize(cursorSizeToSlider(DEFAULT_CURSOR.size))).toBe(DEFAULT_CURSOR.size);
    // Equal slider distances give equal size ratios.
    const ratio = (a: number, b: number) => cursorSliderToSize(b) / cursorSliderToSize(a);
    expect(ratio(25, 50)).toBeCloseTo(ratio(50, 75), 1);
  });
});
