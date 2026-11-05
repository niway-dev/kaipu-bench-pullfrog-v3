import { ITEM_IDS } from "../fixtures/seed-vault";
import { catalog, type Step } from "../types";

const home: Step = { navigate: "/editor" };
const tab = (name: "Images" | "Videos"): Step => ({
  click: { area: "editor.tabs", part: { role: "tab", name } },
});
/**
 * Remount the page, so what it reads on mount is read again after a step changed it: the
 * Continue list after a preload call, the clipboard after `clearClipboard` (the reset has
 * already mounted the page once, before the step ran).
 */
const remount: Step[] = [{ navigate: "/__ui-catalog-reset" }, home];
const opened = (id: string): Step => ({ call: "markOpenedInEditor", args: [id] });

/**
 * The Editor home (`#/editor`): start an image, or continue what was opened or saved in an
 * editor. Its Continue lists are what earlier states left behind (the video and image editor
 * states open items, which stamps them), so this file runs after those screens.
 */
export const editor = catalog("editor", {
  videos: {
    profile: "default",
    how: "Open the Editor and pick the Videos tab: the recording last worked on is the large card, the others are rows.",
    steps: [home, tab("Videos")],
    demonstrates: [
      "editor.page:videos",
      "editor.tabs:videos",
      "editor.hero:video",
      "editor.continue:default",
    ],
  },
  images: {
    profile: "default",
    how: "Open the Editor and pick the Images tab with nothing on the clipboard.",
    steps: [
      { action: "clearClipboard" },
      ...remount,
      tab("Images"),
      { waitFor: { area: "editor.hero" } },
    ],
    demonstrates: [
      "editor.page:images",
      "editor.tabs:images",
      "editor.startImage:default",
      "editor.hero:image",
    ],
  },
  clipboard: {
    profile: "default",
    how: "Copy a saved screenshot to the clipboard (`copyScreenshotById`), then open the Images tab: the start card shows the clipboard image.",
    steps: [
      { call: "copyScreenshotById", args: [ITEM_IDS.settingsShot] },
      ...remount,
      tab("Images"),
      { waitFor: { area: "editor.startImage", part: { text: "Image on your clipboard" } } },
    ],
    demonstrates: ["editor.startImage:clipboard"],
  },
  "show-older": {
    profile: "default",
    how: "Open six recordings in the editor (stamping them through `markOpenedInEditor`, from a vault no earlier state touched): the Videos tab lists the last one large, four rows and a Show older button.",
    steps: [
      // Start from the seeded vault: earlier states leave stamps behind that the restore after
      // each of them removes, so the second shot would otherwise count fewer recordings.
      { action: "restoreVault" },
      opened(ITEM_IDS.walkthrough),
      opened(ITEM_IDS.teamNotes),
      opened(ITEM_IDS.bugReport),
      opened(ITEM_IDS.weeklySync),
      opened(ITEM_IDS.onboardingFlow),
      opened(ITEM_IDS.releaseDemo),
      ...remount,
      tab("Videos"),
      { waitFor: { area: "editor.continue", part: { role: "button", name: "Show older" } } },
    ],
    demonstrates: ["editor.continue:showOlder"],
    // The stamps live in the vault; the next state must not inherit six opened recordings.
    after: [{ action: "restoreVault" }],
  },
  "empty-images": {
    profile: "empty",
    how: "In a workspace with nothing in it, the Images tab has nothing to continue.",
    steps: [{ action: "clearClipboard" }, ...remount],
    demonstrates: ["editor.emptyContinue:images", "editor.startImage:default"],
  },
  "empty-videos": {
    profile: "empty",
    steps: [home, tab("Videos")],
    demonstrates: ["editor.emptyContinue:videos"],
  },
});
