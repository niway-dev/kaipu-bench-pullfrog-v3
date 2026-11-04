import { catalog } from "../types";

/**
 * Export with no video (`#/export`): the door for any video, with the Library picker and the
 * recent exports under the drop zone. The seeded “Walkthrough 1 (light)” is an exported copy,
 * so Recent exports has a row.
 */
export const exportNew = catalog(
  "exportNew",
  {
    empty: {
      profile: "default",
      steps: [{ navigate: "/export" }],
      demonstrates: [
        "exportNew.page:empty",
        "exportNew.header:default",
        "exportNew.dropZone:idle",
        "exportNew.recentExports:list",
      ],
    },
  },
  {
    notCapturable: {
      "exportNew.page:dragging": "a transient state while a file is dragged over the window",
      "exportNew.dropZone:dragging": "a transient state while a file is dragged over the window",
      "exportNew.dropZone:importing": "a transient state while a dropped video is brought in",
    },
  },
);
