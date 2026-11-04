import { describe, expect, it } from "vitest";
import type { Manifest } from "./manifest";
import { renderReadme, screenTitle } from "./readme";

const manifest: Manifest = {
  manifestVersion: 1,
  app: {
    name: "kaipu-record",
    version: "0.16.0",
    sha: "1ecd65c5aaaabbbbccccddddeeeeffff00001111",
    shortSha: "1ecd65c5",
    dirty: false,
    builtAt: "2026-11-04T10:00:00.000Z",
  },
  generatedAt: "2026-11-04T12:00:00.000Z",
  runner: { label: "macmini", macos: "27.0.1", scaleFactor: 1, display: "1920×1080" },
  options: { only: null, twice: false },
  profiles: [
    {
      name: "cursor-flag",
      description: "",
      launched: true,
      flags: { "native-cursor-capture": true },
      rendererFlags: { "native-cursor-capture": true },
      permissions: null,
      display: null,
    },
  ],
  screens: [
    {
      id: "record",
      kind: "route",
      where: "#/",
      windowSize: "1040×760",
      areas: [
        {
          id: "record.mic",
          states: ["on", "off"],
          gates: ["recording setting isMicrophoneEnabled", "permission microphone"],
        },
        {
          id: "record.countdown",
          states: ["running"],
          gates: ["setting recordingCountdownSeconds"],
        },
        { id: "record.audio", states: ["unavailable"], gates: [] },
      ],
      notCapturable: { "record.audio:unavailable": "only during a failed take" },
      oneSided: { "record.countdown": "with 0 s there is no countdown" },
      notRun: [],
      covered: true,
      complete: true,
    },
  ],
  states: [
    {
      id: "record/idle",
      screen: "record",
      name: "idle",
      profile: "default",
      status: "shot",
      demonstrates: ["record.mic:on"],
      how: "Open the app.",
      gates: [{ label: "recording setting isMicrophoneEnabled", side: "on" }],
      window: {
        file: "screens/record/idle.png",
        kind: "main",
        width: 1040,
        height: 760,
        bounds: null,
        sha256: "x",
      },
      areasFound: [
        {
          id: "record.mic",
          file: "areas/record/mic/idle.png",
          rect: { x: 0, y: 0, width: 10, height: 10 },
          sha256: "y",
        },
      ],
      areasAbsent: [],
      pageErrors: [],
      durationMs: 10,
    },
    {
      id: "record/mic-denied",
      screen: "record",
      name: "mic-denied",
      profile: "default",
      status: "notCapturable",
      reason: "needs microphone denied",
      demonstrates: ["record.mic:off"],
      how: "Open the app.",
      gates: [],
      areasFound: [],
      areasAbsent: [],
      pageErrors: [],
      durationMs: 0,
    },
  ],
  knownVariable: [
    { areas: ["shell.statusBar"], reason: "shows the clock" },
    { areas: ["record.page"], states: ["record/paused"], reason: "a timer runs" },
  ],
  nondeterministic: [],
  failures: [],
  nativeNotCapturable: [{ title: "Permission dialogs", reason: "macOS draws them" }],
};

describe("README generator", () => {
  const readme = renderReadme(manifest);

  it("opens with version, date, sha, runner label and scale", () => {
    expect(readme).toContain(
      "Generated 2026-11-04 from kaipu-record 0.16.0 @ 1ecd65c5, on macmini (macOS 27.0.1, scale 1x).",
    );
    expect(readme).toContain("Dark, English. Fixtures are neutral generated data.");
    expect(readme).toContain("Not a design source");
    expect(readme).toContain("native-cursor-capture=true (profile `cursor-flag`)");
  });

  it("names each area's gates and links the window and the crop", () => {
    expect(readme).toContain(
      "### record.mic — gated by `recording setting isMicrophoneEnabled`, `permission microphone`",
    );
    expect(readme).toContain(
      "| `on` | Open the app. Gate: recording setting isMicrophoneEnabled = on. | ![](screens/record/idle.png) | ![](areas/record/mic/idle.png) |",
    );
  });

  it("gives every state without an image its reason", () => {
    expect(readme).toContain("| `off` | Not captured this run: needs microphone denied. | — | — |");
    expect(readme).toContain(
      "| `unavailable` | Not capturable: only during a failed take. | — | — |",
    );
    expect(readme).toContain("| `running` | Not in the catalog yet. | — | — |");
    expect(readme).toContain("Other side of the gate: with 0 s there is no countdown.");
  });

  it("ends with the native flows", () => {
    expect(readme).toMatch(
      /## Not capturable\n\n.*\n\n- \*\*Permission dialogs\*\* — macOS draws them\.\n/,
    );
  });

  it("lists each known-variable area with its reason and the states it is limited to", () => {
    expect(readme).toContain("## Known-variable areas");
    expect(readme).toContain("- `shell.statusBar` — shows the clock.");
    expect(readme).toContain("- `record.page` (in `record/paused`) — a timer runs.");
  });

  it("titles screens for people", () => {
    expect(screenTitle("libraryDetail")).toBe("Library detail");
    expect(screenTitle("capturePanel")).toBe("Capture panel");
  });
});
