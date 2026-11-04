import { catalog, type Step } from "../types";

const page: Step = { navigate: "/screenshots" };
const mode = (value: string): Step => ({
  call: "updateSettings",
  args: [{ screenshotMode: value }],
});

/** The Screenshots page (`#/screenshots`): the Capture button, the mode chips, the recent shots. */
export const screenshots = catalog("screenshots", {
  idle: {
    profile: "default",
    how: "Open the page: Frame is the last mode, and the three seeded screenshots are listed.",
    steps: [page],
    demonstrates: [
      "screenshots.page:idle",
      "screenshots.captureButton:idle",
      "screenshots.modeChips:frame",
      "screenshots.recent:list",
    ],
    gates: [{ setting: "screenshotMode", side: "frame" }],
  },
  "mode-screen": {
    profile: "default",
    steps: [mode("screen"), page],
    demonstrates: ["screenshots.modeChips:screen"],
    gates: [{ setting: "screenshotMode", side: "screen" }],
    after: [mode("frame")],
  },
  busy: {
    profile: "recording",
    how: "Start a take on the first display and open the page: Capture is off until the take stops.",
    steps: [
      { action: "selectFirstScreen" },
      { action: "startTake" },
      { show: "main" },
      page,
      { waitFor: { area: "screenshots.page", part: { text: "Recording in progress" } } },
    ],
    demonstrates: ["screenshots.page:busyWhileRecording", "screenshots.captureButton:disabled"],
    after: [{ action: "stopTake" }],
  },
});
