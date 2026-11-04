import { ASSETS } from "../fixtures/seed-vault";
import { catalog, type Step } from "../types";

const open = (assetId: string): Step => ({ navigate: `/export/${assetId}` });
const pick = (name: string): Step => ({
  click: { area: "export.destinationRow", part: { role: "radio", name } },
});

/**
 * Export with a recording (`#/export/:assetId`): the video on top, what changes for the picked
 * destination in the middle, the seven destinations in a row at the bottom. The page does not
 * read the Settings export quality (only the editor's export sheet does), so the stage has no
 * gate.
 */
export const exportCatalog = catalog(
  "export",
  {
    "nothing-picked": {
      profile: "default",
      how: "Open “Walkthrough 1” in Export with no destination picked: the stage asks where it is going.",
      steps: [open(ASSETS.walkthrough)],
      demonstrates: [
        "export.header:default",
        "export.page:ready",
        "export.stage:nothingPicked",
        "export.destinationRow:default",
      ],
      ready: { area: "export.header" },
    },
    "destination-picked": {
      profile: "default",
      how: "Open “Walkthrough 1” in Export and pick YouTube: the stage shows the upload size and the export button.",
      steps: [open(ASSETS.walkthrough), pick("YouTube")],
      demonstrates: ["export.stage:destinationPicked", "export.destinationRow:selected"],
      ready: { area: "export.stage" },
    },
    "not-exportable": {
      profile: "default",
      how: "Open a screenshot in Export: only recordings can be exported.",
      steps: [
        open(ASSETS.settingsShot),
        { waitFor: { area: "export.page", part: { text: "Only recordings can be exported" } } },
      ],
      demonstrates: ["export.page:notExportable"],
    },
    "not-found": {
      profile: "default",
      how: "Open an id that is not in the Library: the page says the file was not found.",
      steps: [
        open("c0a1a10c-0000-4000-8000-00000000ffff"),
        { waitFor: { area: "export.page", part: { role: "button", name: "Export" } } },
      ],
      demonstrates: ["export.page:notFound"],
    },
  },
  {
    notCapturable: {
      "export.page:loading":
        "a transient state while the Library is listed and the recording is read",
    },
  },
);
