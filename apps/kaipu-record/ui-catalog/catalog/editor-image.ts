import { ASSETS } from "../fixtures/seed-vault";
import { catalog, type Step } from "../types";

const open = (assetId: string): Step => ({ navigate: `/editor/image/${assetId}` });
const tool = (name: string): Step => ({
  click: { area: "editorImage.tools", part: { role: "button", name, exact: true } },
});

/** The image editor on a saved screenshot (`#/editor/image/:assetId`). */
export const editorImage = catalog("editorImage", {
  saved: {
    profile: "default",
    how: "Open “Settings page”, a saved screenshot, in the image editor.",
    steps: [open(ASSETS.settingsShot)],
    demonstrates: [
      "editorImage.page:saved",
      "editorImage.toolbar:default",
      "editorImage.tools:select",
      "editorImage.canvas:default",
      "editorImage.beautify:default",
    ],
  },
  "tool-box": {
    profile: "default",
    steps: [open(ASSETS.settingsShot), tool("Box")],
    demonstrates: ["editorImage.tools:annotate", "editorImage.canvas:annotate"],
  },
  "tool-crop": {
    profile: "default",
    steps: [open(ASSETS.settingsShot), tool("Crop")],
    demonstrates: ["editorImage.tools:crop", "editorImage.canvas:crop"],
  },
  "toolbar-saved": {
    profile: "default",
    how: "Open “Error dialog”, press Save and answer Overwrite: the Save button turns into Saved.",
    steps: [
      open(ASSETS.dialogShot),
      {
        click: { area: "editorImage.toolbar", part: { role: "button", name: "Save", exact: true } },
      },
      { click: { area: "editorImage.page", part: { role: "button", name: "Overwrite" } } },
      {
        waitFor: {
          area: "editorImage.toolbar",
          part: { role: "button", name: "Saved", exact: true },
        },
      },
    ],
    demonstrates: ["editorImage.toolbar:saved"],
  },
});
