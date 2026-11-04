import { DEFAULT_CAMERA_BUBBLE } from "../../../src/shared/camera-bubble";
import { catalog, type Json, type Step } from "../../types";

const cameraOn: Step = {
  call: "updateRecordingSettings",
  args: [{ isCameraEnabled: true }],
  on: "main",
};
const cameraOff: Step = {
  call: "updateRecordingSettings",
  args: [{ isCameraEnabled: false }],
  on: "main",
};
const shape = (value: string): Step => ({
  call: "updateSettings",
  args: [{ cameraBubble: { ...DEFAULT_CAMERA_BUBBLE, shape: value } as unknown as Json }],
  on: "main",
});

/**
 * The camera bubble (`?window=camera-bubble`), created when the camera turns on. The runner
 * has no camera: Chromium's synthetic device (`--use-fake-device-for-media-stream`) feeds it.
 */
export const cameraBubble = catalog("cameraBubble", {
  circle: {
    profile: "default",
    steps: [cameraOn, { waitFor: { window: "camera-bubble" } }],
    demonstrates: ["cameraBubble.root:circle", "cameraBubble.bubble:live"],
    gates: [{ setting: "cameraBubble", side: "circle" }],
    requires: { camera: true },
    after: [cameraOff],
  },
  square: {
    profile: "default",
    steps: [shape("rounded"), cameraOn, { waitFor: { window: "camera-bubble" } }],
    demonstrates: ["cameraBubble.root:square"],
    gates: [{ setting: "cameraBubble", side: "rounded" }],
    requires: { camera: true },
    after: [cameraOff, shape("circle")],
  },
  portrait: {
    profile: "default",
    steps: [shape("rectangle"), cameraOn, { waitFor: { window: "camera-bubble" } }],
    demonstrates: ["cameraBubble.root:portrait"],
    gates: [{ setting: "cameraBubble", side: "rectangle" }],
    requires: { camera: true },
    after: [cameraOff, shape("circle")],
  },
  placeholder: {
    profile: "default",
    steps: [cameraOn, { waitFor: { window: "camera-bubble" } }],
    demonstrates: ["cameraBubble.bubble:placeholder"],
    requires: { camera: false },
    after: [cameraOff],
  },
});
