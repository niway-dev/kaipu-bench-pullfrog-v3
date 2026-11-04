import { WORKSPACE_ID } from "../fixtures/seed-vault";
import { catalog, type Step } from "../types";

const page: Step = { navigate: "/settings/recording-quality" };
const override = (key: string, value: Record<string, string | number> | string): Step => ({
  call: "settingsScope.setOverride",
  args: [WORKSPACE_ID, key, value],
});

const overrides: Step[] = [
  override("recordingQuality", { resolution: 1440, fps: 60, bitrate: "high" }),
  override("exportQuality", "maximum"),
];
const reset: Step = {
  call: "settingsScope.resetOverrides",
  args: [WORKSPACE_ID, ["recordingQuality", "exportQuality"]],
};

/**
 * Settings → Recording quality (`#/settings/recording-quality`). “Overridden” is a workspace
 * that brings its own value: with one workspace the rows read it from the active workspace's
 * settings file, and a source line plus Reset appear.
 */
export const settingsRecordingQuality = catalog("settingsRecordingQuality", {
  default: {
    profile: "default",
    steps: [page],
    demonstrates: [
      "settingsRecordingQuality.page:default",
      "settingsRecordingQuality.recordingQuality:default",
      "settingsRecordingQuality.exportQuality:default",
    ],
    gates: [{ setting: "exportQuality", side: "balanced" }],
  },
  overridden: {
    profile: "default",
    how: "Give the workspace its own recording quality (1440p, 60 fps, high) and Maximum export quality (`settingsScope.setOverride`): the page counts what differs and the recording quality shows where its value comes from, with Reset.",
    steps: [...overrides, page],
    demonstrates: [
      "settingsRecordingQuality.page:overridden",
      "settingsRecordingQuality.recordingQuality:overridden",
    ],
    after: [reset],
  },
  "overridden-export": {
    profile: "default",
    how: "With the same overrides, scroll to Export quality: Maximum is set for this workspace, with Reset.",
    steps: [...overrides, page, { scrollTo: { area: "settingsRecordingQuality.exportQuality" } }],
    demonstrates: ["settingsRecordingQuality.exportQuality:overridden"],
    gates: [{ setting: "exportQuality", side: "maximum" }],
    after: [reset],
  },
});
