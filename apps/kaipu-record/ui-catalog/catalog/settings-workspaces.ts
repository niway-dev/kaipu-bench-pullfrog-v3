import { SECOND_WORKSPACE } from "../fixtures/seed-vault";
import { catalog, type Step } from "../types";

const page: Step = { navigate: "/settings/workspaces" };

/**
 * Settings → Workspaces (`#/settings/workspaces`). “Several” creates a second workspace, which
 * stays registered for the rest of the profile's run, so this screen runs after every other
 * default-profile screen; the unplugged-drive look comes from the `disconnected` profile.
 */
export const settingsWorkspaces = catalog("settingsWorkspaces", {
  one: {
    profile: "default",
    steps: [page],
    demonstrates: ["settingsWorkspaces.page:list", "settingsWorkspaces.list:one"],
  },
  several: {
    profile: "default",
    how: "Create a second workspace (`workspaces.create`, kept inactive): the list has two rows.",
    steps: [
      {
        call: "workspaces.create",
        args: [{ name: SECOND_WORKSPACE.name, color: "amber", activate: false }],
      },
      page,
      { waitFor: { area: "settingsWorkspaces.list", part: { text: SECOND_WORKSPACE.name } } },
    ],
    demonstrates: ["settingsWorkspaces.list:several"],
  },
  "not-connected": {
    profile: "disconnected",
    how: "The workspace folder is missing at launch: the row says so and offers Change folder.",
    steps: [page],
    demonstrates: ["settingsWorkspaces.list:notConnected"],
  },
});
