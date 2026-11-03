/**
 * Geometry of the capture preview card (NIW2-606, spec decision 3), shared by main, which sizes
 * the window, and the renderer, which draws the card inside it. Pure and literal-only: this
 * module is reachable from the preload bundle.
 */

/** The card's width, in DIP. */
export const PREVIEW_CARD_WIDTH = 280;
/** Transparent room around the card inside its window, so the card's shadow is not clipped. */
export const PREVIEW_WINDOW_PADDING = 16;
/** Inset between the card's border and the image. */
export const PREVIEW_CARD_INSET = 6;
/** The image area's width: the card minus its 1 px border and the inset on both sides. */
export const PREVIEW_IMAGE_WIDTH = PREVIEW_CARD_WIDTH - 2 * (1 + PREVIEW_CARD_INSET);
/** The image area's height bounds; outside them the shot is letterboxed, never cropped. */
export const PREVIEW_IMAGE_MIN_HEIGHT = 100;
export const PREVIEW_IMAGE_MAX_HEIGHT = 220;
/**
 * Everything below the image: the meta line (7 + 14 + 1 px) and the timer bar (6 + 2 px), as
 * `capture-toast.module.css` draws them.
 */
export const PREVIEW_FOOTER_HEIGHT = 30;
/** The thumbnail's longest side, in px: twice the largest image area, for HiDPI displays. */
export const PREVIEW_THUMBNAIL_MAX_SIDE = 2 * PREVIEW_IMAGE_WIDTH;

/** Compact Copy confirmation: no image, metadata, buttons or progress bar. */
export const COPY_CONFIRMATION_SIZE = {
  imageHeight: 0,
  cardHeight: 48,
  windowWidth: PREVIEW_CARD_WIDTH + 2 * PREVIEW_WINDOW_PADDING,
  windowHeight: 48 + 2 * PREVIEW_WINDOW_PADDING,
};

export interface PreviewCardSize {
  imageHeight: number;
  cardHeight: number;
  windowWidth: number;
  windowHeight: number;
}

/** The card for a `width` × `height` shot: image height from its aspect ratio, clamped. */
export function previewCardSize(width: number, height: number): PreviewCardSize {
  const natural =
    width > 0 && height > 0
      ? Math.round((PREVIEW_IMAGE_WIDTH * height) / width)
      : PREVIEW_IMAGE_MIN_HEIGHT;
  const imageHeight = Math.min(
    PREVIEW_IMAGE_MAX_HEIGHT,
    Math.max(PREVIEW_IMAGE_MIN_HEIGHT, natural),
  );
  const cardHeight = 2 * (1 + PREVIEW_CARD_INSET) + imageHeight + PREVIEW_FOOTER_HEIGHT;
  return {
    imageHeight,
    cardHeight,
    windowWidth: PREVIEW_CARD_WIDTH + 2 * PREVIEW_WINDOW_PADDING,
    windowHeight: cardHeight + 2 * PREVIEW_WINDOW_PADDING,
  };
}
