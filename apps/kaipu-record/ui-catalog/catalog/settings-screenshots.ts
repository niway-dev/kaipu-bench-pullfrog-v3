import { catalog, type Step } from "../types";

const page: Step = { navigate: "/settings/screenshots" };
const set = (patch: Record<string, string>): Step => ({ call: "updateSettings", args: [patch] });

/** Settings → Screenshots (`#/settings/screenshots`): what happens after a capture. */
export const settingsScreenshots = catalog("settingsScreenshots", {
  preview: {
    profile: "default",
    how: "Open the page: a capture shows the preview card, and the copy is automatic.",
    steps: [page],
    demonstrates: ["settingsScreenshots.page:default", "settingsScreenshots.options:preview"],
    gates: [
      { setting: "screenshotAfterCapture", side: "preview" },
      { setting: "screenshotCopy", side: "auto" },
    ],
  },
  copy: {
    profile: "default",
    steps: [set({ screenshotAfterCapture: "copy", screenshotCopy: "manual" }), page],
    demonstrates: ["settingsScreenshots.options:copy"],
    gates: [
      { setting: "screenshotAfterCapture", side: "copy" },
      { setting: "screenshotCopy", side: "manual" },
    ],
    after: [set({ screenshotAfterCapture: "preview", screenshotCopy: "auto" })],
  },
});
