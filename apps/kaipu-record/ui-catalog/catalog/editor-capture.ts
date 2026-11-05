import { ITEM_IDS } from "../fixtures/seed-vault";
import { catalog } from "../types";

/**
 * A fresh capture that is not in the vault (`#/editor/capture`). The route needs the image in
 * router state, which only a paste or a capture provides, so this puts a saved screenshot on
 * the clipboard and pastes it from New image. The capture lives only in memory, so leaving it
 * asks first: `after` leaves through the sidebar and discards it.
 */
export const editorCapture = catalog("editorCapture", {
  fresh: {
    profile: "default",
    how: "Copy a saved screenshot to the clipboard, open New image and press Paste from clipboard: the editor opens on it as a capture.",
    steps: [
      { call: "copyScreenshotById", args: [ITEM_IDS.settingsShot] },
      { navigate: "/editor/new" },
      {
        click: {
          area: "editorNew.pasteZone",
          part: { role: "button", name: "Paste from clipboard" },
        },
      },
    ],
    demonstrates: ["editorCapture.page:fresh"],
    after: [
      { click: { area: "shell.sidebar", part: { role: "link", name: "Library" } } },
      { click: { area: "editorCapture.page", part: { role: "button", name: "Discard" } } },
    ],
  },
});
