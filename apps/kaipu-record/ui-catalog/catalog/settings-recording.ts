import { catalog, type Step } from "../types";

const page: Step = { navigate: "/settings/recording" };
const set = (patch: Record<string, string | number | boolean>): Step => ({
  call: "updateSettings",
  args: [patch],
});

/** Settings → Recording (`#/settings/recording`): the control bar, the countdown and the badge. */
export const settingsRecording = catalog("settingsRecording", {
  default: {
    profile: "default",
    how: "Open the page: the bar is out of the video, the countdown is 3 s and the brand badge is off.",
    steps: [page],
    demonstrates: ["settingsRecording.page:default", "settingsRecording.options:default"],
    gates: [
      { setting: "showBarInRecording", side: "off" },
      { setting: "recordingCountdownSeconds", side: "3 s" },
      { setting: "showBrandBadge", side: "off" },
    ],
  },
  changed: {
    profile: "default",
    how: "Turn on the bar in the video and the brand badge, and set the countdown to off.",
    steps: [
      set({ showBarInRecording: true, recordingCountdownSeconds: 0, showBrandBadge: true }),
      page,
    ],
    demonstrates: ["settingsRecording.options:default"],
    gates: [
      { setting: "showBarInRecording", side: "on" },
      { setting: "recordingCountdownSeconds", side: "off" },
      { setting: "showBrandBadge", side: "on" },
    ],
    after: [
      set({ showBarInRecording: false, recordingCountdownSeconds: 3, showBrandBadge: false }),
    ],
  },
});
