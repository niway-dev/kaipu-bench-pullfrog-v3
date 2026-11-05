import { catalog } from "../types";

/** Settings → General (`#/settings/general`): language, theme (dark) and a pointer to Cloud. */
export const settingsGeneral = catalog("settingsGeneral", {
  default: {
    profile: "default",
    steps: [{ navigate: "/settings/general" }],
    demonstrates: [
      "settingsGeneral.page:default",
      "settingsGeneral.language:default",
      "settingsGeneral.theme:dark",
      "settingsGeneral.account:default",
    ],
  },
});
