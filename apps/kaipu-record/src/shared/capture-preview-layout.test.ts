import { describe, expect, it } from "vitest";
import {
  PREVIEW_CARD_WIDTH,
  PREVIEW_IMAGE_MAX_HEIGHT,
  PREVIEW_IMAGE_MIN_HEIGHT,
  PREVIEW_IMAGE_WIDTH,
  PREVIEW_THUMBNAIL_MAX_SIDE,
  PREVIEW_WINDOW_PADDING,
  previewCardSize,
} from "./capture-preview-layout";

describe("previewCardSize", () => {
  it("follows the shot's aspect ratio inside the bounds", () => {
    // 1440 × 900 is 16:10: 266 × 166 (rounded).
    expect(previewCardSize(1440, 900).imageHeight).toBe(
      Math.round((PREVIEW_IMAGE_WIDTH * 900) / 1440),
    );
  });

  it("caps a tall shot and floors a wide one (letterboxed by the card, never cropped)", () => {
    expect(previewCardSize(390, 1200).imageHeight).toBe(PREVIEW_IMAGE_MAX_HEIGHT);
    expect(previewCardSize(2400, 400).imageHeight).toBe(PREVIEW_IMAGE_MIN_HEIGHT);
  });

  it("never divides by zero on an unmeasured shot", () => {
    expect(previewCardSize(0, 0).imageHeight).toBe(PREVIEW_IMAGE_MIN_HEIGHT);
  });

  it("pads the window around the card for its shadow", () => {
    const size = previewCardSize(1440, 900);
    expect(size.windowWidth).toBe(PREVIEW_CARD_WIDTH + 2 * PREVIEW_WINDOW_PADDING);
    expect(size.windowHeight).toBe(size.cardHeight + 2 * PREVIEW_WINDOW_PADDING);
    expect(size.cardHeight).toBeGreaterThan(size.imageHeight);
  });

  it("asks for a thumbnail twice the image area, for HiDPI", () => {
    expect(PREVIEW_THUMBNAIL_MAX_SIDE).toBe(2 * PREVIEW_IMAGE_WIDTH);
  });
});
