import { catalog, type Step } from "../../types";

// Every pick here ends with Escape (cancelled). Screen mode is absent on purpose: with one
// display it skips the overlay and starts a take or a capture at once.

const cancel: Step = { action: "cancelPick" };
const record = (mode: string): Step => ({
  call: "requestRecordSelector",
  args: [mode],
  on: "main",
});
const screenshot = (mode: string): Step => ({
  call: "requestCaptureScreenshot",
  args: [mode],
  on: "main",
});

/**
 * The selector overlay (`?window=capture-overlay`), drawn over the display before a capture
 * or a take. What follows it, the system screenshot selector (ADR 0022), is native and not
 * in the images. Opened the way the Record and Screenshots pages open it; Escape cancels.
 */
export const captureOverlay = catalog(
  "captureOverlay",
  {
    "screenshot-frame": {
      profile: "recording",
      steps: [screenshot("frame"), { waitFor: { window: "capture-overlay" } }],
      demonstrates: [
        "captureOverlay.frameBox:screenshot",
        "captureOverlay.selectionToolbar:capture",
        "captureOverlay.hintPill:frame",
      ],
      ready: { area: "captureOverlay.frameBox" },
      after: [cancel],
    },
    "record-frame": {
      profile: "recording",
      steps: [record("frame"), { waitFor: { window: "capture-overlay" } }],
      demonstrates: [
        "captureOverlay.frameBox:record",
        "captureOverlay.ratioBar:free",
        "captureOverlay.recordWidget:default",
        "captureOverlay.hintPill:frame",
      ],
      ready: { area: "captureOverlay.frameBox" },
      gates: [
        { recordingSetting: "isMicrophoneEnabled", side: "on" },
        { recordingSetting: "isSystemAudioEnabled", side: "off" },
        { recordingSetting: "isCameraEnabled", side: "off" },
      ],
      after: [cancel],
    },
    "record-frame-inputs": {
      profile: "recording",
      how: "Turn off the mic and turn on system audio, then open the overlay to record a frame.",
      steps: [
        {
          call: "updateRecordingSettings",
          args: [{ isMicrophoneEnabled: false, isSystemAudioEnabled: true }],
          on: "main",
        },
        record("frame"),
        { waitFor: { window: "capture-overlay" } },
      ],
      demonstrates: ["captureOverlay.recordWidget:default"],
      ready: { area: "captureOverlay.recordWidget" },
      gates: [
        { recordingSetting: "isMicrophoneEnabled", side: "off" },
        { recordingSetting: "isSystemAudioEnabled", side: "on" },
      ],
      after: [cancel],
    },
    "record-frame-camera": {
      profile: "recording",
      steps: [
        { call: "updateRecordingSettings", args: [{ isCameraEnabled: true }], on: "main" },
        record("frame"),
        { waitFor: { window: "capture-overlay" } },
      ],
      demonstrates: ["captureOverlay.recordWidget:default"],
      ready: { area: "captureOverlay.recordWidget" },
      gates: [{ recordingSetting: "isCameraEnabled", side: "on" }],
      requires: { camera: true },
      after: [cancel],
    },
    "record-ratio": {
      profile: "recording",
      steps: [
        record("frame"),
        { waitFor: { window: "capture-overlay" } },
        { click: { area: "captureOverlay.ratioBar", part: { text: "16:9", exact: true } } },
      ],
      demonstrates: ["captureOverlay.ratioBar:ratio"],
      after: [cancel],
    },
  },
  {
    notCapturable: {
      "captureOverlay.windowPicker:noWindow":
        "Window mode on macOS is the system selector (ADR 0022); the picker is drawn on Windows only",
      "captureOverlay.windowPicker:hovered":
        "Window mode on macOS is the system selector (ADR 0022); the picker is drawn on Windows only",
      "captureOverlay.screenCard:screenshot":
        "the chooser needs two displays; with one (the runner has one) Screen mode takes it directly",
      "captureOverlay.screenCard:record":
        "the chooser needs two displays; with one (the runner has one) Screen mode takes it directly",
      "captureOverlay.screenCard:highlighted":
        "the chooser needs two displays; with one (the runner has one) Screen mode takes it directly",
      "captureOverlay.hintPill:pick":
        "drawn over the display chooser or the window picker, neither of which the runner can show",
    },
  },
);
