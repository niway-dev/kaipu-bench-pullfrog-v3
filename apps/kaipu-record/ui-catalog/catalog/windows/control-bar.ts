import { catalog, type Step } from "../../types";
import { nc } from "../not-capturable";

/** The bar says "Starting…" until the first frame; the states are after that. */
const settled: Step[] = [
  { waitFor: { window: "control-bar" } },
  { waitFor: { area: "controlBar.bar", part: { text: "Starting" }, state: "hidden" } },
];
const take: Step[] = [{ action: "selectFirstScreen" }, { action: "startTake" }, ...settled];

/** The floating bar (`?window=control-bar`) a take opens; only a real take creates it. */
export const controlBar = catalog(
  "controlBar",
  {
    recording: {
      profile: "recording",
      how: "Start a take on the first display (profile `recording`).",
      steps: take,
      demonstrates: ["controlBar.bar:recording", "controlBar.mode:screen"],
      after: [{ action: "stopTake" }],
    },
    paused: {
      profile: "recording",
      steps: [...take, { action: "pauseTake" }],
      demonstrates: ["controlBar.bar:paused"],
      after: [{ action: "stopTake" }],
    },
    frame: {
      profile: "recording",
      how: "Open the overlay to record in Frame mode and press Enter on its frame: a take of that area.",
      steps: [
        { call: "requestRecordSelector", args: ["frame"], on: "main" },
        { waitFor: { window: "capture-overlay" } },
        { waitMs: 500 },
        { press: "Enter", on: "capture-overlay" },
        ...settled,
      ],
      demonstrates: ["controlBar.mode:frame"],
      after: [{ action: "stopTake" }],
    },
  },
  {
    notCapturable: {
      "controlBar.bar:starting": nc(
        "transient",
        "a transient state between the countdown and the first frame",
      ),
      "controlBar.bar:saving": nc("transient", "a transient state while the take is written"),
      "controlBar.mode:window": nc(
        "platform",
        "needs a take of one window; the runner's window list is not stable between runs",
      ),
    },
  },
);
