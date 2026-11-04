import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  type DenyEntry,
  lintFailed,
  lintOutputDir,
  machineEntries,
  newestOutputDir,
  parseDenyList,
  reviewByEye,
  scanText,
  sourceFiles,
} from "./lint";

describe("deny-list parsing", () => {
  it("skips comments and blank lines and lowercases the needle", () => {
    const entries = parseDenyList("# why\n\nCricut\n  @Gmail.com  \n");
    expect(entries.map((e) => e.needle)).toEqual(["cricut", "@gmail.com"]);
    expect(entries.every((e) => !e.masked)).toBe(true);
  });
});

describe("scanText", () => {
  const entries = parseDenyList("Cricut\n/Users/");

  it("names the line and the entry, case-insensitively", () => {
    const hits = scanText("README.md", "fine\nOpened CRICUT design space\nfine", entries);
    expect(hits).toEqual([{ file: "README.md", line: 2, entry: "Cricut" }]);
  });

  it("reports each entry once per line", () => {
    const hits = scanText("f", "/Users/x and cricut and /users/y", entries);
    expect(hits.map((h) => h.entry).sort()).toEqual(["/Users/", "Cricut"]);
  });

  it("finds nothing in clean text", () => {
    expect(scanText("f", "Record page, mic on", entries)).toEqual([]);
  });
});

describe("machine entries", () => {
  const entries = machineEntries({
    username: "someuser",
    homedir: "/home/someuser",
    hostnames: ["My-Box.local", "ab"],
    runnerHosts: ["Runner-1.local"],
  });

  it("masks the value, so a hit never echoes it", () => {
    const hits = scanText("run.log", "owner is someuser here", entries);
    expect(hits).toHaveLength(1);
    expect(hits[0]?.entry).toBe("<this machine's user name>");
    expect(JSON.stringify(hits)).not.toContain("someuser");
  });

  it("matches a hostname with and without .local", () => {
    expect(scanText("f", "host my-box", entries)).toHaveLength(1);
    expect(scanText("f", "host Runner-1.local", entries)).toHaveLength(1);
  });

  it("drops values too short to be a meaningful match", () => {
    expect(entries.some((e) => e.needle === "ab")).toBe(false);
  });
});

describe("review by eye", () => {
  it("lists shot states that embed the screen, sorted", () => {
    const states = [
      { id: "record/b", status: "shot", embedsScreen: true },
      { id: "record/a", status: "shot", embedsScreen: true },
      { id: "record/c", status: "shot", embedsScreen: false },
      { id: "record/d", status: "notCapturable", embedsScreen: true },
    ] as never;
    expect(reviewByEye({ states })).toEqual(["record/a", "record/b"]);
  });
});

describe("lintOutputDir", () => {
  const entries: DenyEntry[] = parseDenyList("Cricut");

  function outputDir(readme: string, states: unknown[] = []): string {
    const dir = mkdtempSync(path.join(tmpdir(), "ui-catalog-lint-test-"));
    writeFileSync(path.join(dir, "README.md"), readme);
    writeFileSync(path.join(dir, "manifest.json"), JSON.stringify({ states }));
    return dir;
  }

  it("passes a clean folder and carries the review list", () => {
    const dir = outputDir("# Catalog", [{ id: "record/a", status: "shot", embedsScreen: true }]);
    const result = lintOutputDir(dir, { entries, sources: [] });
    expect(lintFailed(result)).toBe(false);
    expect(result.reviewByEye).toEqual(["record/a"]);
  });

  it("fails with file and line on a hit in the README", () => {
    const dir = outputDir("# Catalog\nCricut\n");
    const result = lintOutputDir(dir, { entries, sources: [] });
    expect(lintFailed(result)).toBe(true);
    expect(result.hits).toEqual([{ file: "<output>/README.md", line: 2, entry: "Cricut" }]);
  });

  it("scans run.log when it is there", () => {
    const dir = outputDir("# Catalog");
    writeFileSync(path.join(dir, "run.log"), "ok\nok\nCRICUT\n");
    const result = lintOutputDir(dir, { entries, sources: [] });
    expect(result.hits[0]).toMatchObject({ file: "<output>/run.log", line: 3 });
  });

  it("scans the given source files", () => {
    const dir = outputDir("# Catalog");
    const source = path.join(dir, "seed.ts");
    writeFileSync(source, 'const title = "Cricut";');
    expect(lintOutputDir(dir, { entries, sources: [source] }).hits).toHaveLength(1);
  });

  it("uses the fallback list for a manifest from before embedsScreen existed", () => {
    const dir = outputDir("# Catalog", [{ id: "record/a", status: "shot" }]);
    const result = lintOutputDir(dir, { entries, sources: [], fallbackReview: ["record/a"] });
    expect(result.reviewByEye).toEqual(["record/a"]);
  });

  it("errors when the manifest is missing", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "ui-catalog-lint-test-"));
    writeFileSync(path.join(dir, "README.md"), "x");
    expect(lintFailed(lintOutputDir(dir, { entries, sources: [] }))).toBe(true);
  });
});

describe("the committed sources", () => {
  it("lists fixtures, profiles and the catalog", () => {
    const files = sourceFiles().map((f) => path.basename(f));
    expect(files).toContain("seed-vault.ts");
    expect(files).toContain("profiles.ts");
    expect(files).toContain("record.ts");
  });

  it("are clean against the committed deny-list", () => {
    // The real gate: the repository's own seed and descriptions hold no denied string.
    const dir = mkdtempSync(path.join(tmpdir(), "ui-catalog-lint-test-"));
    writeFileSync(path.join(dir, "README.md"), "x");
    writeFileSync(path.join(dir, "manifest.json"), JSON.stringify({ states: [] }));
    const result = lintOutputDir(dir);
    expect(result.hits).toEqual([]);
  });
});

describe("newestOutputDir", () => {
  it("picks the folder with the newest manifest", () => {
    const root = mkdtempSync(path.join(tmpdir(), "ui-catalog-newest-"));
    const base = path.join(root, ".evidence", "ui-catalog");
    for (const [name, time] of [
      ["old", 1_000],
      ["new", 2_000],
    ] as const) {
      mkdirSync(path.join(base, name), { recursive: true });
      const file = path.join(base, name, "manifest.json");
      writeFileSync(file, "{}");
      utimesSync(file, time, time);
    }
    expect(newestOutputDir(root)).toBe(path.join(base, "new"));
    expect(newestOutputDir(path.join(root, "nowhere"))).toBeNull();
  });
});
