import { catalog, type Step } from "../types";

const next: Step = {
  click: { area: "onboarding.root", part: { role: "button", name: "Get started" } },
};
const continueStep: Step = {
  click: { area: "onboarding.root", part: { role: "button", name: "Continue" } },
};

/**
 * The first-run takeover over the Record page. Each state starts from a reload, which puts
 * the takeover back at Welcome (it is only stored as done when it is finished or skipped).
 */
export const onboarding = catalog("onboarding", {
  welcome: {
    profile: "onboarding",
    how: "First launch of a fresh profile.",
    demonstrates: ["onboarding.root:welcome", "onboarding.welcomeStep:default"],
  },
  permissions: {
    profile: "onboarding",
    steps: [next],
    demonstrates: ["onboarding.root:permissions", "onboarding.permissionsStep:all"],
    ready: { area: "onboarding.permissionsStep" },
    gates: [
      { permission: "screen", side: "granted" },
      { permission: "microphone", side: "granted" },
      { permission: "camera", side: "granted" },
      { permission: "accessibility", side: "granted" },
    ],
    requires: { screen: true, microphone: true, camera: true, accessibility: true },
  },
  "permissions-none": {
    profile: "onboarding",
    steps: [next],
    demonstrates: ["onboarding.permissionsStep:none"],
    ready: { area: "onboarding.permissionsStep" },
    gates: [
      { permission: "screen", side: "denied" },
      { permission: "microphone", side: "denied" },
      { permission: "camera", side: "denied" },
      { permission: "accessibility", side: "denied" },
    ],
    requires: { screen: false, microphone: false, camera: false, accessibility: false },
  },
  done: {
    profile: "onboarding",
    steps: [next, { waitFor: { area: "onboarding.permissionsStep" } }, continueStep],
    demonstrates: ["onboarding.root:done", "onboarding.doneStep:default"],
    ready: { area: "onboarding.doneStep" },
    // Continue stays disabled until screen and microphone are granted.
    requires: { screen: true, microphone: true },
  },
});
