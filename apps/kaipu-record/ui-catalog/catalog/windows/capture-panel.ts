import { catalog, type Step } from "../../types";

const show: Step = { show: "capture-panel" };
const camera = (on: boolean): Step => ({
  call: "updateRecordingSettings",
  args: [{ isCameraEnabled: on }],
  on: "main",
});
const setting = (patch: Record<string, string>): Step => ({
  call: "updateSettings",
  args: [patch],
  on: "main",
});
const take: Step[] = [{ action: "selectFirstScreen" }, { action: "startTake" }, show];

/**
 * The menu-bar panel (`?mode=capture`). Main prewarms it hidden once the main window has
 * painted; the catalog shows it without focus, as a tray click does (a focus change would
 * close an open drawer).
 */
export const capturePanel = catalog("capturePanel", {
  record: {
    profile: "default",
    steps: [show],
    demonstrates: [
      "capturePanel.root:record",
      "capturePanel.tabs:record",
      "capturePanel.startButton:idle",
      "capturePanel.modePicker:screen",
      "capturePanel.mic:on",
      "capturePanel.audio:off",
      "capturePanel.camera:off",
    ],
    gates: [
      { setting: "recordingMode", side: "screen" },
      { recordingSetting: "isMicrophoneEnabled", side: "on" },
      { recordingSetting: "isSystemAudioEnabled", side: "off" },
      { recordingSetting: "isCameraEnabled", side: "off" },
    ],
  },
  "mode-frame": {
    profile: "default",
    steps: [setting({ recordingMode: "frame" }), show],
    demonstrates: ["capturePanel.modePicker:frame"],
    gates: [{ setting: "recordingMode", side: "frame" }],
    after: [setting({ recordingMode: "screen" })],
  },
  "mode-window": {
    profile: "default",
    steps: [setting({ recordingMode: "window" }), show],
    demonstrates: ["capturePanel.modePicker:window"],
    gates: [{ setting: "recordingMode", side: "window" }],
    after: [setting({ recordingMode: "screen" })],
  },
  "mic-off": {
    profile: "default",
    steps: [
      { call: "updateRecordingSettings", args: [{ isMicrophoneEnabled: false }], on: "main" },
      show,
    ],
    demonstrates: ["capturePanel.mic:off"],
    gates: [{ recordingSetting: "isMicrophoneEnabled", side: "off" }],
  },
  "mic-settings": {
    profile: "default",
    steps: [
      show,
      {
        click: { area: "capturePanel.mic", part: { role: "button", name: "Microphone settings" } },
      },
    ],
    demonstrates: ["capturePanel.micSettings:open"],
    ready: { area: "capturePanel.micSettings" },
    gates: [
      { recordingSetting: "isMicrophoneEnabled", side: "on" },
      { permission: "microphone", side: "granted" },
    ],
    requires: { microphone: true },
  },
  "mic-settings-off": {
    profile: "default",
    steps: [
      { call: "updateRecordingSettings", args: [{ isMicrophoneEnabled: false }], on: "main" },
      show,
      {
        click: { area: "capturePanel.mic", part: { role: "button", name: "Microphone settings" } },
      },
    ],
    demonstrates: ["capturePanel.micSettings:open"],
    ready: { area: "capturePanel.micSettings" },
    gates: [{ recordingSetting: "isMicrophoneEnabled", side: "off" }],
  },
  "mic-denied": {
    profile: "default",
    steps: [show],
    demonstrates: ["capturePanel.mic:on"],
    gates: [{ permission: "microphone", side: "denied" }],
    requires: { microphone: false },
  },
  "audio-on": {
    profile: "default",
    steps: [
      { call: "updateRecordingSettings", args: [{ isSystemAudioEnabled: true }], on: "main" },
      show,
    ],
    demonstrates: ["capturePanel.audio:on"],
    gates: [{ recordingSetting: "isSystemAudioEnabled", side: "on" }],
  },
  "audio-settings": {
    profile: "default",
    steps: [
      { call: "updateRecordingSettings", args: [{ isSystemAudioEnabled: true }], on: "main" },
      show,
      {
        click: {
          area: "capturePanel.audio",
          part: { role: "button", name: "System audio settings" },
        },
      },
    ],
    demonstrates: ["capturePanel.audioSettings:open"],
    ready: { area: "capturePanel.audioSettings" },
    gates: [{ recordingSetting: "isSystemAudioEnabled", side: "on" }],
  },
  "audio-settings-off": {
    profile: "default",
    steps: [
      show,
      {
        click: {
          area: "capturePanel.audio",
          part: { role: "button", name: "System audio settings" },
        },
      },
    ],
    demonstrates: ["capturePanel.audioSettings:open"],
    ready: { area: "capturePanel.audioSettings" },
    gates: [{ recordingSetting: "isSystemAudioEnabled", side: "off" }],
  },
  "camera-on": {
    profile: "default",
    steps: [camera(true), show],
    demonstrates: ["capturePanel.camera:on"],
    gates: [
      { recordingSetting: "isCameraEnabled", side: "on" },
      { permission: "camera", side: "granted" },
    ],
    requires: { camera: true },
    after: [camera(false)],
  },
  "camera-settings": {
    profile: "default",
    steps: [
      camera(true),
      show,
      { click: { area: "capturePanel.camera", part: { role: "button", name: "Camera settings" } } },
    ],
    demonstrates: ["capturePanel.cameraSettings:open"],
    ready: { area: "capturePanel.cameraSettings" },
    gates: [{ recordingSetting: "isCameraEnabled", side: "on" }],
    after: [camera(false)],
  },
  "camera-settings-off": {
    profile: "default",
    steps: [
      show,
      { click: { area: "capturePanel.camera", part: { role: "button", name: "Camera settings" } } },
    ],
    demonstrates: ["capturePanel.cameraSettings:open"],
    ready: { area: "capturePanel.cameraSettings" },
    gates: [{ recordingSetting: "isCameraEnabled", side: "off" }],
  },
  "camera-blocked": {
    profile: "default",
    steps: [show],
    demonstrates: ["capturePanel.camera:blocked"],
    gates: [{ permission: "camera", side: "denied" }],
    requires: { camera: false },
  },
  capture: {
    profile: "default",
    steps: [show, { click: { area: "capturePanel.tabs", part: { role: "tab", name: "Capture" } } }],
    demonstrates: [
      "capturePanel.root:capture",
      "capturePanel.tabs:capture",
      "capturePanel.captureButtons:idle",
    ],
    ready: { area: "capturePanel.captureButtons" },
    gates: [{ setting: "screenshotMode", side: "frame" }],
    after: [{ click: { area: "capturePanel.tabs", part: { role: "tab", name: "Record" } } }],
  },
  "capture-screen": {
    profile: "default",
    steps: [
      setting({ screenshotMode: "screen" }),
      show,
      { click: { area: "capturePanel.tabs", part: { role: "tab", name: "Capture" } } },
    ],
    demonstrates: ["capturePanel.captureButtons:idle"],
    ready: { area: "capturePanel.captureButtons" },
    gates: [{ setting: "screenshotMode", side: "screen" }],
    after: [
      { click: { area: "capturePanel.tabs", part: { role: "tab", name: "Record" } } },
      setting({ screenshotMode: "frame" }),
    ],
  },
  recording: {
    profile: "recording",
    how: "Start a take on the first display, then show the panel: Capture is locked mid-take.",
    steps: take,
    demonstrates: [
      "capturePanel.root:recording",
      "capturePanel.tabs:locked",
      "capturePanel.recordingIndicator:recording",
    ],
    after: [{ action: "stopTake" }],
  },
  paused: {
    profile: "recording",
    steps: [
      { action: "selectFirstScreen" },
      { action: "startTake" },
      { action: "pauseTake" },
      show,
    ],
    demonstrates: ["capturePanel.recordingIndicator:paused"],
    after: [{ action: "stopTake" }],
  },
});
