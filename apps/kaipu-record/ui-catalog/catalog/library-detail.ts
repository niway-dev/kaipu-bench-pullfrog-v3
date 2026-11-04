import { ASSETS } from "../fixtures/seed-vault";
import { catalog } from "../types";

const detail = (assetId: string) => ({ navigate: `/library/${assetId}` }) as const;

/** An item's page (`#/library/:assetId`), opened on the seeded items by their fixed ids. */
export const libraryDetail = catalog(
  "libraryDetail",
  {
    recording: {
      profile: "default",
      how: "Open “Walkthrough 1”, a recording with a GIF copy made from it.",
      steps: [detail(ASSETS.walkthrough)],
      demonstrates: [
        "libraryDetail.page:recording",
        "libraryDetail.details:recording",
        "libraryDetail.preview:video",
        "libraryDetail.actions:recording",
        "libraryDetail.copies:master",
      ],
      ready: { video: "paused-at-start" },
    },
    "recording-no-copies": {
      profile: "default",
      how: "Open “Onboarding flow”, a recording with no copies yet: the page asks where it is going.",
      steps: [detail(ASSETS.onboardingFlow)],
      demonstrates: ["libraryDetail.destinations:ready"],
      ready: { video: "paused-at-start" },
    },
    edited: {
      profile: "default",
      how: "Open “Team notes”, whose saved edit session (a zoom, a muted range) was never exported.",
      steps: [detail(ASSETS.teamNotes)],
      demonstrates: ["libraryDetail.details:edited"],
      ready: { video: "paused-at-start" },
    },
    screenshot: {
      profile: "default",
      steps: [detail(ASSETS.settingsShot)],
      demonstrates: [
        "libraryDetail.page:screenshot",
        "libraryDetail.preview:image",
        "libraryDetail.actions:screenshot",
      ],
    },
    gif: {
      profile: "default",
      how: "Open “Loop preview”, a GIF made from “Walkthrough 1 (light)”.",
      steps: [detail(ASSETS.loopGif)],
      demonstrates: [
        "libraryDetail.page:gif",
        "libraryDetail.preview:gif",
        "libraryDetail.actions:gif",
        "libraryDetail.details:copy",
      ],
    },
    "light-copy": {
      profile: "default",
      how: "Open “Walkthrough 1 (light)”, a copy of “Walkthrough 1” that has a GIF made from it.",
      steps: [detail(ASSETS.lightCopy)],
      demonstrates: ["libraryDetail.copies:copy"],
      ready: { video: "paused-at-start" },
    },
    "saved-notice": {
      profile: "recording",
      how: "Record a 3 s take of the first display and stop it: the app opens the new recording's page.",
      steps: [
        { action: "selectFirstScreen" },
        { action: "startTake" },
        { waitMs: 3_000 },
        { action: "stopTake" },
        { show: "main" },
        { waitFor: { area: "libraryDetail.savedNotice" }, timeoutMs: 20_000 },
      ],
      demonstrates: ["libraryDetail.savedNotice:shown"],
    },
  },
  {
    notCapturable: {
      "libraryDetail.missing:notFound":
        "drawn for one frame at most: a missing item re-lists once, then the page falls back to the Library (use-missing-recording-recovery.ts)",
      "libraryDetail.page:loading": "a transient state before the item is listed",
      "libraryDetail.details:stale": "needs an export of an edit that was edited again afterwards",
      "libraryDetail.preview:unavailable": "needs a cloud-only item; the catalog runs offline",
      "libraryDetail.actions:cloudOnly": "needs a cloud-only item; the catalog runs offline",
      "libraryDetail.copies:running": "a transient state while a copy is exported",
      "libraryDetail.postRecordingCard:fresh":
        "shown only after a take heavier than 10 MB; the catalog's takes are seconds long",
    },
    oneSided: {
      "libraryDetail.postRecordingCard": "with the setting off, no card is drawn",
    },
  },
);
