import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CATALOG_BRANCH,
  DEFAULT_REMOTE,
  checkRemote,
  git,
  makeTempDir,
  manifestDate,
  readCatalogManifest,
} from "./catalog-repo";
import { repoRootOf } from "./lint";
import type { Manifest } from "./manifest";

/**
 * `bun run ui-catalog:status [--remote <url>]`: when the catalog was last recounted, and
 * whether a newer desktop release exists since. A reminder, not a gate: an unreachable or
 * empty catalog repository is said plainly and exits 0 (spec, "The per-release recount").
 */

export function parseStatusArgs(argv: readonly string[]): { remote: string } | { error: string } {
  let remote = DEFAULT_REMOTE;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--remote") {
      const value = argv[++i];
      if (!value) return { error: "--remote needs a value" };
      remote = value;
    } else return { error: `unknown argument: ${arg}` };
  }
  return { remote };
}

/** `desktop-v0.16.0` → `0.16.0`; null for any other tag. */
export function versionOfTag(tag: string): string | null {
  return /^desktop-v(\d+\.\d+\.\d+(?:-[\w.]+)?)$/.exec(tag)?.[1] ?? null;
}

/** Plain semver order on the numeric part; a pre-release sorts before its release. */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string): { nums: number[]; pre: boolean } => ({
    nums: v.split("-")[0]!.split(".").map(Number),
    pre: v.includes("-"),
  });
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < 3; i++) {
    const diff = (pa.nums[i] ?? 0) - (pb.nums[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return Number(pb.pre) - Number(pa.pre);
}

/** The catalog's line, and `current` or `behind desktop-vX.Y.Z`. */
export function describeStatus(manifest: Manifest, newestTag: string | null): string {
  const base = `last recount: kaipu-record ${manifest.app.version} on ${manifestDate(manifest)} @ ${manifest.app.shortSha}`;
  const newest = newestTag ? versionOfTag(newestTag) : null;
  if (!newest) return `${base}; no desktop-v* tag found to compare with`;
  const behind = compareVersions(newest, manifest.app.version) > 0;
  return `${base}; ${behind ? `behind ${newestTag}` : "current"}`;
}

/** Read-only `git tag` in the monorepo. Null when there is none or git cannot read it. */
export function newestDesktopTag(repoRoot: string): string | null {
  try {
    const out = git(repoRoot, ["tag", "--list", "desktop-v*", "--sort=-v:refname"]);
    return (
      out
        .split("\n")
        .find((line) => versionOfTag(line.trim()) !== null)
        ?.trim() ?? null
    );
  } catch {
    return null;
  }
}

/** `main` of the catalog repository, shallow, into a temp folder; null when it cannot be read. */
export function readRemoteManifest(remote: string): Manifest | null {
  const dir = makeTempDir("ui-catalog-status-");
  try {
    // A bounded clone: an unreachable host must not hold `bun run setup` up.
    execFileSync(
      "git",
      ["clone", "--quiet", "--depth", "1", "--branch", CATALOG_BRANCH, remote, dir],
      {
        stdio: "ignore",
        timeout: Number(process.env.UI_CATALOG_STATUS_TIMEOUT_MS) || 15_000,
        env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
      },
    );
    return readCatalogManifest(dir);
  } catch {
    return null;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function main(): number {
  const args = parseStatusArgs(process.argv.slice(2));
  if ("error" in args) {
    console.error(`${args.error}\n\nUsage: bun run ui-catalog:status [--remote <url>]`);
    return 1;
  }
  const check = checkRemote(args.remote);
  if (!check.ok) {
    console.error(`[ui-catalog:status] ${check.reason}`);
    return 1;
  }
  const manifest = readRemoteManifest(args.remote);
  if (!manifest) {
    console.log(
      "[ui-catalog:status] the catalog repository is unreachable, empty, or has no manifest.json on main; nothing to compare",
    );
    return 0;
  }
  console.log(`[ui-catalog:status] ${describeStatus(manifest, newestDesktopTag(repoRootOf()))}`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main());
}
