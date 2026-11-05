import { ASSETS } from "../../fixtures/seed-vault";
import { catalog, type Step } from "../../types";

const showCard = (canEdit: boolean): Step => ({
  call: "showRecordingReady",
  args: [
    {
      assetId: ASSETS.walkthrough,
      durationSeconds: 12,
      dimensions: { width: 1920, height: 1080 },
      sizeBytes: 52_692,
      canEdit,
    },
  ],
  on: "main",
});
const dismiss: Step = { press: "Escape" };

/**
 * The "Recording ready" card (`?window=recording-ready`) main shows after a take. The
 * catalog asks main for it directly with the seeded “Walkthrough 1” as the payload, so no
 * take is needed.
 */
export const recordingReady = catalog(
  "recordingReady",
  {
    default: {
      profile: "default",
      steps: [showCard(true)],
      demonstrates: ["recordingReady.root:default", "recordingReady.card:default"],
      gates: [{ setting: "showRecordingSavedCard", side: "on" }],
      after: [dismiss],
    },
    hover: {
      profile: "default",
      steps: [showCard(true), { hover: { area: "recordingReady.card" } }],
      demonstrates: ["recordingReady.card:hover"],
      keepPointer: true,
      after: [dismiss],
    },
    "cannot-edit": {
      profile: "default",
      steps: [showCard(false)],
      demonstrates: ["recordingReady.card:cannotEdit"],
      after: [dismiss],
    },
  },
  {
    oneSided: {
      "recordingReady.card": "with the setting off, main shows no card after a take",
    },
  },
);
