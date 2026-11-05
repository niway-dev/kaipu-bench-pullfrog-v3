import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isRunner, parseCliArgs, readRunners, REMOTE_RECIPE } from "./guard";
import { matchesOnly } from "./types";

describe("host guard", () => {
  it("lets only the listed runners through", () => {
    const runners = ["Cristians-Mac-mini-2.local"];
    expect(isRunner("Cristians-Mac-mini-2.local", runners)).toBe(true);
    // macOS reports the name with or without `.local` depending on the network.
    expect(isRunner("cristians-mac-mini-2", runners)).toBe(true);
    expect(isRunner("owners-macbook-pro.local", runners)).toBe(false);
    expect(isRunner("", runners)).toBe(false);
    // A DHCP address as hostname still passes on the Bonjour name, and only on it.
    expect(isRunner(["192.168.18.99", "Cristians-Mac-mini-2.local"], runners)).toBe(true);
    expect(isRunner(["192.168.18.99", "Owners-MacBook-Pro.local"], runners)).toBe(false);
  });

  it("reads the committed runners file", () => {
    const { runners, label } = readRunners();
    expect(runners.length).toBeGreaterThan(0);
    // The label is what the README prints; it must never be the hostname itself.
    expect(runners).not.toContain(label);
  });

  it("refuses a runners file that is not a list of names", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "ui-catalog-guard-"));
    const file = path.join(dir, "runners.json");
    writeFileSync(file, JSON.stringify({ runners: "macmini" }));
    expect(() => readRunners(file)).toThrow(/runners/);
  });

  it("points the refused host at the remote recipe", () => {
    expect(REMOTE_RECIPE).toContain("bun run ui-catalog:remote");
    expect(REMOTE_RECIPE).toContain("ssh macmini");
  });
});

describe("cli arguments", () => {
  it("parses --only and --twice", () => {
    expect(parseCliArgs(["--only", "record/*", "--twice"])).toEqual({
      only: "record/*",
      twice: true,
      prepareOnly: false,
      help: false,
    });
    expect(parseCliArgs(["--only=library/*", "--only", "shell/*"])).toMatchObject({
      only: "library/*,shell/*",
    });
    expect(parseCliArgs(["--prepare-only"])).toMatchObject({ prepareOnly: true });
  });

  it("has no flag that skips the host check", () => {
    for (const flag of ["--force", "--skip-guard", "--local", "--yes"]) {
      expect(parseCliArgs([flag])).toEqual({ error: `unknown argument ${flag}` });
    }
  });

  it("rejects --only without a glob", () => {
    expect(parseCliArgs(["--only"])).toHaveProperty("error");
    expect(parseCliArgs(["--only", "--twice"])).toHaveProperty("error");
  });
});

describe("--only globs", () => {
  it("matches state ids", () => {
    expect(matchesOnly("record/idle", "record/*")).toBe(true);
    expect(matchesOnly("record/idle@min", "*@min")).toBe(true);
    expect(matchesOnly("library/grid", "record/*")).toBe(false);
    expect(matchesOnly("library/grid", "record/*, library/grid")).toBe(true);
    expect(matchesOnly("anything/at-all", undefined)).toBe(true);
    // A dot in a glob is a dot, not "any character".
    expect(matchesOnly("recordXidle", "record.idle")).toBe(false);
  });
});
