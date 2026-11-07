import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { initialScene } from "../scene";
import { serializeSession } from "../session";
import { buildExportPlan, gifFrameSchedule, gifOutputSize, sliceExportPlan } from "./export-plan";
import { editFingerprint } from "./export-reuse";

/**
 * NIW2-666: the preview playback speed is view state. The export file always plays at 1x
 * and the plan is a function of the scene alone. What these tests pin, honestly: no
 * plan builder takes a speed, none of the scene, the session or the plan carries one, and
 * no module on the export path imports the speed. The one module that does read it (the
 * page) is covered at page level: "hands the export the same scene at 1x and at 2x" in
 * `pages/video-editor/video-editor-page.test.tsx`.
 */

const FEATURE = resolve(__dirname, "..");
const sourcesIn = (dir: string): string[] =>
  readdirSync(dir)
    .filter((name) => /\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name))
    .map((name) => join(dir, name));

const SPEED_REFERENCE = /playback-speed|PREVIEW_SPEEDS|playbackRate|setSpeed|previewSpeed/;

describe("preview playback speed does not reach the export", () => {
  const scene = {
    ...initialScene(20),
    items: [
      { id: "a", kind: "clip" as const, sourceStart: 0, sourceEnd: 8 },
      {
        id: "s",
        kind: "slide" as const,
        assetId: "asset-s",
        duration: 3,
        naturalWidth: 800,
        naturalHeight: 600,
      },
      { id: "b", kind: "clip" as const, sourceStart: 12, sourceEnd: 20 },
    ],
  };

  it("builds the same plan, slice and fingerprint whatever speed the preview is at", () => {
    // The builders take the scene and nothing else, so there is nowhere to pass a speed;
    // building "at 1x" and "at 2x" is the same call on the same scene, and must stay so.
    const at1x = buildExportPlan(scene);
    const at2x = buildExportPlan(structuredClone(scene));
    expect(at2x).toEqual(at1x);
    expect(sliceExportPlan(at2x, 1, 9)).toEqual(sliceExportPlan(at1x, 1, 9));
    expect(editFingerprint(scene)).toBe(editFingerprint(structuredClone(scene)));
    expect(buildExportPlan.length).toBe(1);
    expect(sliceExportPlan.length).toBe(3);
  });

  it("keeps the real timeline length: a 3 s slide stays 3 s in the plan", () => {
    const plan = buildExportPlan(scene);
    expect(plan.totalDuration).toBe(8 + 3 + 8);
    const slide = plan.segments.find((segment) => segment.kind === "slide");
    expect(slide).toMatchObject({ timelineStart: 8, duration: 3 });
  });

  it("keeps the GIF schedule and size a function of range, fps and dimensions", () => {
    expect(gifFrameSchedule(4, 10)).toEqual(gifFrameSchedule(4, 10));
    expect(gifFrameSchedule.length).toBe(2);
    expect(gifOutputSize.length).toBeGreaterThan(0);
  });

  it("has no speed in the scene, the saved session or the plan", () => {
    const key = /speed|playbackRate/i;
    expect(JSON.stringify(scene)).not.toMatch(key);
    expect(serializeSession(scene)).not.toMatch(key);
    expect(JSON.stringify(buildExportPlan(scene))).not.toMatch(key);
  });

  it("is not referenced by anything under export/", () => {
    const offenders = sourcesIn(__dirname).filter((file) =>
      SPEED_REFERENCE.test(readFileSync(file, "utf8")),
    );
    expect(offenders).toEqual([]);
  });

  it("is not referenced by the scene, the session or the scene hook", () => {
    const files = ["scene.ts", "session.ts", "use-video-scene.ts", "timeline.ts"].map((name) =>
      join(FEATURE, name),
    );
    const offenders = files.filter((file) => SPEED_REFERENCE.test(readFileSync(file, "utf8")));
    expect(offenders).toEqual([]);
  });
});
