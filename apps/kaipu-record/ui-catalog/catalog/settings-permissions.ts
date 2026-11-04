import { catalog, type Step } from "../types";

const page: Step = { navigate: "/settings/permissions" };

/**
 * Settings → Permissions (`#/settings/permissions`). The runner's own grants decide what the
 * page shows, and it grants everything, so the missing sides are reported as not capturable
 * by the run (the same way Record's denied states are).
 */
export const settingsPermissions = catalog("settingsPermissions", {
  "all-granted": {
    profile: "default",
    how: "Open the page on a runner that has Screen Recording, Microphone, Camera and Accessibility.",
    steps: [page],
    demonstrates: [
      "settingsPermissions.page:allGranted",
      "settingsPermissions.permissions:allGranted",
      "settingsPermissions.clickZoom:granted",
    ],
    gates: [
      { permission: "screen", side: "granted" },
      { permission: "microphone", side: "granted" },
      { permission: "camera", side: "granted" },
      { permission: "accessibility", side: "granted" },
    ],
    requires: { screen: true, microphone: true, camera: true, accessibility: true },
  },
  "screen-denied": {
    profile: "default",
    steps: [page],
    demonstrates: ["settingsPermissions.page:missing", "settingsPermissions.permissions:missing"],
    gates: [{ permission: "screen", side: "denied" }],
    requires: { screen: false },
  },
  "microphone-denied": {
    profile: "default",
    steps: [page],
    demonstrates: ["settingsPermissions.permissions:missing"],
    gates: [{ permission: "microphone", side: "denied" }],
    requires: { microphone: false },
  },
  "camera-denied": {
    profile: "default",
    steps: [page],
    demonstrates: ["settingsPermissions.permissions:missing"],
    gates: [{ permission: "camera", side: "denied" }],
    requires: { camera: false },
  },
  "click-zoom-denied": {
    profile: "default",
    steps: [page],
    demonstrates: ["settingsPermissions.clickZoom:notGranted"],
    gates: [{ permission: "accessibility", side: "denied" }],
    requires: { accessibility: false },
  },
});
