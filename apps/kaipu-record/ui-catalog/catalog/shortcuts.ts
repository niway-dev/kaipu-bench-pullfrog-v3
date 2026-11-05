import { catalog } from "../types";

/** The Shortcuts page (`#/shortcuts`): the global keyboard shortcuts, each rebindable. */
export const shortcuts = catalog("shortcuts", {
  default: {
    profile: "default",
    steps: [{ navigate: "/shortcuts" }],
    demonstrates: ["shortcuts.page:default", "shortcuts.list:default"],
  },
  conflict: {
    profile: "default",
    how: "Click Start recording's shortcut and press the combination Stop recording uses: the page refuses it and names the action that owns it.",
    steps: [
      { navigate: "/shortcuts" },
      { click: { area: "shortcuts.list", part: { role: "button", name: "Change shortcut" } } },
      { press: "Meta+Control+S" },
      { waitFor: { area: "shortcuts.list", part: { text: "already bound to" } } },
    ],
    demonstrates: ["shortcuts.list:conflict"],
  },
});
