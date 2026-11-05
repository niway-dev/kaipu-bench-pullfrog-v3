import { expect, it } from "vitest";
import { areaEncodePlan } from "../../../renderer/src/features/recording/area-crop";
import { sourceRectFit } from "./source-rect-fit";

const displayPts = { width: 1920, height: 1080 };
const areas: [number, number][] = [
  [801, 451], // odd
  [804, 201], // wide: fitToCap gives 804x202
  [1001, 333], // wide, odd
  [201, 804], // tall
  [333, 1001], // tall, odd
  [400, 300],
  [1919, 1079],
  [3, 3],
  [1600, 5],
];

for (const scale of [1, 2]) {
  it(`accepts every areaEncodePlan output at ${scale}x`, () => {
    for (const [w, h] of areas) {
      for (const cap of [720, 1080, 1440, 2160]) {
        const plan = areaEncodePlan(
          { width: displayPts.width * scale, height: displayPts.height * scale },
          { displaySize: displayPts, rect: { x: 0, y: 0, width: w, height: h } } as never,
          cap,
        );
        if (plan.target.width < 2 || plan.target.height < 2) continue;
        expect(
          sourceRectFit({
            outW: plan.target.width,
            outH: plan.target.height,
            rectW: w,
            rectH: h,
            scale,
          }),
          `${w}x${h} cap ${cap} at ${scale}x -> ${plan.target.width}x${plan.target.height}`,
        ).toBe("ok");
      }
    }
  });
}

it("still refuses a real upscale and a wrong aspect", () => {
  const base = { rectW: 400, rectH: 300, scale: 2 };
  expect(sourceRectFit({ ...base, outW: 7680, outH: 5760 })).toBe("upscale");
  expect(sourceRectFit({ ...base, outW: 806, outH: 604 })).toBe("upscale");
  expect(sourceRectFit({ ...base, outW: 400, outH: 200 })).toBe("aspect");
  expect(sourceRectFit({ rectW: 804, rectH: 201, scale: 1, outW: 804, outH: 210 })).toBe("aspect");
});
