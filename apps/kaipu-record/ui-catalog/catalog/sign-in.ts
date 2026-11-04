import { catalog, type Step } from "../types";

const page: Step = { navigate: "/sign-in" };
const start: Step = {
  click: { area: "signIn.card", part: { role: "button", name: "Sign in with your browser" } },
};

/**
 * The sign-in screen (`#/sign-in`). Starting a sign-in hands off to the system browser and
 * waits for a link back, so the waiting look is reached by pressing the button. A pasted code
 * is checked by the API, so which error it gets (invalid code, or network when the runner has
 * none) depends on the runner's connection: neither error is shot.
 */
export const signIn = catalog(
  "signIn",
  {
    browser: {
      profile: "default",
      steps: [page],
      demonstrates: ["signIn.page:browser", "signIn.card:browser"],
    },
    waiting: {
      profile: "default",
      how: "Press Sign in with your browser: the card waits for the browser and offers a code field.",
      steps: [page, start, { waitFor: { area: "signIn.codeForm" } }],
      demonstrates: ["signIn.page:waiting", "signIn.card:waiting", "signIn.codeForm:empty"],
      ready: { area: "signIn.codeForm" },
      after: [{ click: { area: "signIn.card", part: { role: "button", name: "Cancel" } } }],
    },
    "code-filled": {
      profile: "default",
      steps: [
        page,
        start,
        { fill: { area: "signIn.codeForm", part: { role: "textbox" } }, value: "ABCD-1234" },
      ],
      demonstrates: ["signIn.codeForm:filled"],
      after: [{ click: { area: "signIn.card", part: { role: "button", name: "Cancel" } } }],
    },
  },
  {
    notCapturable: {
      "signIn.error:invalidCode":
        "needs the API to reject a code; the catalog runs offline (a runner with network gets this look, one without gets the network error)",
      "signIn.error:network":
        "needs the API to be unreachable on purpose; the runner's network decides which error a pasted code gets",
    },
  },
);
