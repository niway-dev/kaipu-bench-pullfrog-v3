import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { initialScene } from "../scene";
import { TRACK_KEYS } from "../tracks";
import { buildExportPlan, gifFrameSchedule, gifOutputSize, sliceExportPlan } from "./export-plan";
import { editFingerprint } from "./export-reuse";

/**
 * ADR 0050 decision 1: hiding a lane is view state. The export plan, the GIF plan and the
 * preview never read it, so what the Tracks popover hides cannot change a file. These tests
 * pin that from both sides: the plan carries every edit whatever the timeline draws, and
 * no module on the preview/export path can reach the setting.
 */

const FEATURE = resolve(__dirname, "..");
const sourcesIn = (dir: string): string[] =>
  readdirSync(dir)
    .filter((name) => /\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name))
    .map((name) => join(dir, name));

const VISIBILITY_REFERENCE =
  /hiddenTracks|use-hidden-tracks|editor-settings|isTrackHidden|\/tracks["']/;

describe("track visibility never reaches the export or the preview", () => {
  const scene = {
    ...initialScene(20),
    items: [{ id: "a", kind: "clip" as const, sourceStart: 0, sourceEnd: 20 }],
    overlays: [
      {
        id: "o1",
        kind: "text" as const,
        x: 0,
        y: 0,
        text: "hola",
        size: 19,
        color: "#000",
        start: 1,
        end: 4,
      },
    ],
    redactions: [
      {
        id: "r1",
        kind: "cover" as const,
        start: 2,
        end: 6,
        rect: { x: 0, y: 0, w: 0.2, h: 0.2 },
        fill: "#18181b",
        label: "",
      },
    ],
    mutedRanges: [{ id: "m1", sourceStart: 3, sourceEnd: 5 }],
    zoomSegments: [
      {
        id: "z1",
        start: 1,
        end: 3,
        scale: 2,
        mode: "follow" as const,
        anchor: null,
        smoothing: 70,
        origin: "auto" as const,
        trigger: "click" as const,
      },
    ],
  };

  it("keeps every edit in the plan: a zoom, a blur, a mute and an annotation all export", () => {
    const plan = buildExportPlan(scene);
    expect(plan.hasZoom).toBe(true);
    expect(plan.redactions.map((r) => r.id)).toEqual(["r1"]);
    expect(plan.audio.mutedRanges.map((r) => r.id)).toEqual(["m1"]);
    expect(plan.overlayWindows.map((w) => w.overlayId)).toEqual(["o1"]);
  });

  it("builds the same plan, slice, fingerprint and GIF schedule on every call: the inputs are the scene alone", () => {
    // The builders take the scene (and a range, a size) and nothing about lanes, so the
    // plan with every lane hidden is, by construction, the plan with none hidden.
    expect(TRACK_KEYS.length).toBeGreaterThan(1);
    expect(buildExportPlan(scene)).toEqual(buildExportPlan(structuredClone(scene)));
    expect(sliceExportPlan(buildExportPlan(scene), 1, 5)).toEqual(
      sliceExportPlan(buildExportPlan(scene), 1, 5),
    );
    expect(editFingerprint(scene)).toBe(editFingerprint(structuredClone(scene)));
    expect(gifFrameSchedule(4, 10)).toEqual(gifFrameSchedule(4, 10));
    expect(buildExportPlan.length).toBe(1);
    expect(gifOutputSize.length).toBeGreaterThan(0);
  });

  it("is not imported by anything under export/", () => {
    const offenders = sourcesIn(__dirname).filter((file) =>
      VISIBILITY_REFERENCE.test(readFileSync(file, "utf8")),
    );
    expect(offenders).toEqual([]);
  });

  it("is not imported by the preview: playback, the scene hook, the frame clock, the stage", () => {
    const files = [
      join(FEATURE, "use-preview-playback.ts"),
      join(FEATURE, "use-video-scene.ts"),
      join(FEATURE, "use-video-frame-clock.ts"),
      join(FEATURE, "components", "preview-stage.tsx"),
      join(FEATURE, "components", "framing-preview.tsx"),
    ];
    const offenders = files.filter((file) => VISIBILITY_REFERENCE.test(readFileSync(file, "utf8")));
    expect(offenders).toEqual([]);
  });
});
