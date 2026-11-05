import { describe, expect, it } from "vitest";
import type { Manifest } from "./manifest";
import {
  renderReadme,
  renderRootIndex,
  renderScreenPage,
  renderVersionIndex,
  renderVersionPages,
  screenTitle,
} from "./readme";

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
      notCapturableKinds: { "record.audio:unavailable": "inducedFailure" },
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
      '<tr><td><code>on</code></td><td>Open the app. Gate: recording setting isMicrophoneEnabled = on.</td><td><a href="screens/record/idle.png"><img src="screens/record/idle.png" width="100%"></a></td><td><a href="areas/record/mic/idle.png"><img src="areas/record/mic/idle.png" width="100%"></a></td></tr>',
    );
  });

  it("sets 100% width and 10/30/30/30 columns on every area table", () => {
    expect(readme.match(/<table width="100%">/g)).toHaveLength(3);
    expect(readme).toContain(
      '<thead><tr><th width="10%">State</th><th width="30%">How reached</th><th width="30%">Window</th><th width="30%">Crop</th></tr></thead>',
    );
    expect(readme).not.toContain("| --- |");
  });

  it("renders inline code in a cell as <code> and escapes HTML", () => {
    const base = manifest.states[0] as Manifest["states"][number];
    const text = renderReadme({
      ...manifest,
      states: [{ ...base, how: "Set `a<b` & go." }],
    });
    expect(text).toContain("Set <code>a&lt;b</code> &amp; go.");
  });

  it("gives every state without an image its reason", () => {
    expect(readme).toContain(
      "<tr><td><code>off</code></td><td>Not captured this run: needs microphone denied.</td><td>—</td><td>—</td></tr>",
    );
    expect(readme).toContain(
      "<tr><td><code>unavailable</code></td><td>Not capturable: only during a failed take.</td><td>—</td><td>—</td></tr>",
    );
    expect(readme).toContain(
      "<tr><td><code>running</code></td><td>Not in the catalog yet.</td><td>—</td><td>—</td></tr>",
    );
    expect(readme).toContain("Other side of the gate: with 0 s there is no countdown.");
  });

  it("says an unpublished state is not published, and links neither image", () => {
    const base = manifest.states[0] as Manifest["states"][number];
    const withFlag: Manifest = {
      ...manifest,
      states: [{ ...base, unpublished: "shows the runner's real open windows" }],
    };
    const text = renderReadme(withFlag);
    expect(text).toContain(
      "<tr><td><code>on</code></td><td>Open the app. Gate: recording setting isMicrophoneEnabled = on.</td><td>Not published: shows the runner's real open windows</td><td>—</td></tr>",
    );
    expect(text).not.toContain("screens/record/idle.png");
    expect(text).not.toContain("areas/record/mic/idle.png");
  });

  it("groups everything not captured by kind, each with an imperative next step", () => {
    expect(readme).toContain("## What this run could not capture — and what to do");
    expect(readme).toContain("### Needs a permission the runner holds (1)");
    expect(readme).toContain("- `record/mic-denied` — needs microphone denied.");
    expect(readme).toContain("`tccutil reset <Service> <bundle id>`");
    expect(readme).toContain("The catalog never revokes grants itself.");
    expect(readme).toContain("### Needs a failure on purpose (1)");
    expect(readme).toContain("- `record.audio:unavailable` — only during a failed take.");
    expect(readme).toContain("### Native macOS UI (1)");
    expect(readme).toContain("- `Permission dialogs` — macOS draws them.");
    expect(readme).toContain("it cannot be shot from web contents");
  });

  it("names the failed state in its own rerun command, and keeps unpublished apart", () => {
    const base = manifest.states[0] as Manifest["states"][number];
    const text = renderReadme({
      ...manifest,
      states: [
        { ...base, id: "record/slow", status: "failed", reason: "timed out after 20000 ms" },
        { ...base, unpublished: "shows real windows" },
      ],
    });
    expect(text).toContain(
      "- `record/slow` — timed out after 20000 ms. **Next:** Rerun `bun run ui-catalog:remote --only 'record/slow'`; if it repeats, open a ticket.",
    );
    expect(text).toContain("### Shot locally, kept private (1)");
    expect(text).toContain("- `record/idle` — shows real windows.");
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

  it("gives a version a header, a link to each screen page and the tail", () => {
    const index = renderVersionIndex(manifest);
    expect(index).toContain("# Kaipu Record 0.16.0 — UI state catalog");
    expect(index).toContain("[← All versions](../../README.md)");
    expect(index).toContain("Generated 2026-11-04 from kaipu-record 0.16.0 @ 1ecd65c5, on macmini");
    expect(index).toContain("- [Record](record.md)");
    expect(index).toContain(
      "- [What this run could not capture — and what to do](#what-this-run-could-not-capture--and-what-to-do)",
    );
    expect(index).toContain("- `Permission dialogs` — macOS draws them.");
    expect(index).toContain("- `shell.statusBar` — shows the clock.");
    expect(index).not.toContain("<table");
  });

  it("gives each screen its own page with a back link and the tables", () => {
    const page = renderScreenPage(manifest, "record");
    expect(page.startsWith("[← Kaipu Record 0.16.0](README.md)\n\n# Record\n")).toBe(true);
    expect(page).toContain("## record.mic — gated by");
    expect(page).toContain('<a href="screens/record/idle.png"><img');
    expect(page).toContain('<th width="30%">Crop</th>');
    expect(Object.keys(renderVersionPages(manifest))).toEqual(["README.md", "record.md"]);
    expect(() => renderScreenPage(manifest, "nope")).toThrow();
  });

  it("lists versions newest first in the root index, each linking its page", () => {
    const at = (version: string, date: string, sha: string): Manifest => ({
      ...manifest,
      app: { ...manifest.app, version, shortSha: sha },
      generatedAt: date,
    });
    const root = renderRootIndex([
      at("0.9.0", "2026-10-01T00:00:00Z", "aaaaaaaa"),
      at("0.16.0", "2026-11-04T00:00:00Z", "bbbbbbbb"),
      at("0.16.0", "2026-11-05T00:00:00Z", "cccccccc"),
    ]);
    const rows = root.split("\n").filter((l) => l.startsWith("| ["));
    expect(rows).toEqual([
      "| [0.16.0](versions/0.16.0/README.md) | 2026-11-05 | `cccccccc` | 1 shot, 1 not capturable | [2 to act on](versions/0.16.0/README.md#what-this-run-could-not-capture--and-what-to-do) |",
      "| [0.16.0](versions/0.16.0/README.md) | 2026-11-04 | `bbbbbbbb` | 1 shot, 1 not capturable | [2 to act on](versions/0.16.0/README.md#what-this-run-could-not-capture--and-what-to-do) |",
      "| [0.9.0](versions/0.9.0/README.md) | 2026-10-01 | `aaaaaaaa` | 1 shot, 1 not capturable | [2 to act on](versions/0.9.0/README.md#what-this-run-could-not-capture--and-what-to-do) |",
    ]);
  });
});
