import { catalog, type Step } from "../types";
import { nc } from "./not-capturable";

const page: Step = { navigate: "/cloud" };
const mode = (value: string): Step => ({ call: "updateSettings", args: [{ uploadMode: value }] });
const OFFLINE = "needs the API; the catalog runs offline";

/**
 * The Cloud page (`#/cloud`): the save mode and the account. The catalog runs offline and
 * signed out, so only the signed-out account and both save modes can be shot.
 */
export const cloud = catalog(
  "cloud",
  {
    "local-only": {
      profile: "default",
      how: "Open the page signed out, with the save mode on Local only.",
      steps: [page],
      demonstrates: ["cloud.page:signedOut", "cloud.saveMode:localOnly", "cloud.account:signedOut"],
      gates: [
        { setting: "uploadMode", side: "local-only" },
        { account: "signed-out", side: "signed-out" },
      ],
    },
    "save-mode-cloud": {
      profile: "default",
      how: "Set the save mode to Automatic (`updateSettings`) while signed out: the cloud mode is the selected one.",
      steps: [mode("automatic"), page],
      demonstrates: ["cloud.saveMode:cloud"],
      gates: [{ setting: "uploadMode", side: "automatic" }],
      after: [mode("local-only")],
    },
  },
  {
    notCapturable: {
      "cloud.page:signedIn": nc("needsApi", OFFLINE),
      "cloud.page:loading": nc(
        "transient",
        "a transient state until the first account status arrives",
      ),
      "cloud.account:unknown": nc(
        "needsApi",
        `${OFFLINE}: a stored session with the API unreachable needs a real sign-in first`,
      ),
      "cloud.account:signedIn": nc("needsApi", OFFLINE),
      "cloud.usage:shown": nc("needsApi", OFFLINE),
      "cloud.usage:stale": nc("needsApi", OFFLINE),
      "cloud.usage:unavailable": nc("needsApi", OFFLINE),
    },
    oneSided: {
      "cloud.account": "the signed-in side needs the API; the catalog runs offline",
    },
  },
);
