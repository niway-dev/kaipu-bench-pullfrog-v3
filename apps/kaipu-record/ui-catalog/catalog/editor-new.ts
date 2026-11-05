import { catalog } from "../types";

/** New image (`#/editor/new`): an empty editor waiting for an image pasted from the clipboard. */
export const editorNew = catalog("editorNew", {
  waiting: {
    profile: "default",
    steps: [{ navigate: "/editor/new" }],
    demonstrates: ["editorNew.page:waiting", "editorNew.pasteZone:waiting"],
  },
  empty: {
    profile: "default",
    how: "Empty the clipboard and press Paste from clipboard: the zone says there is no image on it.",
    steps: [
      { action: "clearClipboard" },
      { navigate: "/editor/new" },
      {
        click: {
          area: "editorNew.pasteZone",
          part: { role: "button", name: "Paste from clipboard" },
        },
      },
      { waitFor: { area: "editorNew.pasteZone", part: { role: "alert" } } },
    ],
    demonstrates: ["editorNew.pasteZone:empty"],
  },
});
