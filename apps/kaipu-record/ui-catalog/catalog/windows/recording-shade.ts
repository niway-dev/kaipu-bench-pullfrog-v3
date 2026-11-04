import { catalog, type Step } from "../../types";

/** The overlay's own start: its countdown runs on the shade, over the chosen region. */
const fromOverlay = (mode: string): Step[] => [
  { call: "requestRecordSelector", args: [mode], on: "main" },
  { waitFor: { window: "capture-overlay" } },
  { waitMs: 500 },
  { press: "Enter", on: "capture-overlay" },
];

/**
 * The full-display shade (`?window=recording-shade`): the countdown before a take and the
 * border around what is being recorded. Prewarmed hidden; only a real take shows it.
 */
export const recordingShade = catalog(
  "recordingShade",
  {
    "border-display": {
      profile: "recording",
      how: "Start a take of the first display: the shade draws its border.",
      steps: [
        { action: "selectFirstScreen" },
        { action: "startTake" },
        { waitFor: { area: "recordingShade.displayBorder" } },
      ],
      demonstrates: ["recordingShade.displayBorder:fullDisplay"],
      after: [{ action: "stopTake" }],
    },
    "border-area": {
      profile: "recording",
      how: "Open the overlay to record in Frame mode and press Enter: the shade borders that area.",
      steps: [
        ...fromOverlay("frame"),
        { waitFor: { area: "recordingShade.areaBorder" }, timeoutMs: 15_000 },
      ],
      demonstrates: ["recordingShade.areaBorder:area"],
      after: [{ action: "stopTake" }],
    },

    "countdown-area": {
      profile: "recording",
      how: "Open the overlay in Frame mode and press Enter on its frame; shot during the countdown.",
      steps: [
        ...fromOverlay("frame"),
        { waitFor: { area: "recordingShade.countdown" }, timeoutMs: 10_000 },
      ],
      demonstrates: ["recordingShade.countdown:area"],
      gates: [{ setting: "recordingCountdownSeconds", side: "3" }],
      after: [{ action: "stopTake" }],
    },
    "countdown-display": {
      profile: "recording",
      how: "Ask to record in Screen mode: with one display there is no chooser, the countdown starts at once.",
      steps: [
        { call: "requestRecordSelector", args: ["screen"], on: "main" },
        { waitFor: { area: "recordingShade.countdown" }, timeoutMs: 10_000 },
      ],
      demonstrates: ["recordingShade.countdown:fullDisplay"],
      gates: [{ setting: "recordingCountdownSeconds", side: "3" }],
      after: [{ action: "stopTake" }],
    },
  },
  {
    oneSided: {
      "recordingShade.countdown": "with `recordingCountdownSeconds` 0 there is no countdown",
    },
  },
);
