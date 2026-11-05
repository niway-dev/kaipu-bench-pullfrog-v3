import { spawn } from "node:child_process";
import { compareVersions } from "./version";
import { rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CATALOG_BRANCH,
  DEFAULT_REMOTE,
  checkRemote,
  git,
  makeTempDir,
  normalizeRemote,
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
      remote = normalizeRemote(value);
    } else return { error: `unknown argument: ${arg}` };
  }
  return { remote };
}

/** `desktop-v0.16.0` → `0.16.0`; null for any other tag. */
export function versionOfTag(tag: string): string | null {
  return /^desktop-v(\d+\.\d+\.\d+(?:-[\w.]+)?)$/.exec(tag)?.[1] ?? null;
}

/** The catalog's line, and `current` or `behind desktop-vX.Y.Z`. */
export function describeStatus(manifest: Manifest, newestTag: string | null): string {
  const base = `last recount: kaipu-record ${manifest.app.version} on ${manifestDate(manifest)} @ ${manifest.app.shortSha}`;
  const newest = newestTag ? versionOfTag(newestTag) : null;
  if (!newest) return `${base}; no desktop-v* tag found to compare with`;
  const behind = compareVersions(newest, manifest.app.version) > 0;
  return `${base}; ${behind ? `behind ${newestTag}` : "current"}`;
}

/** The highest desktop tag by version; `git tag --sort` puts an rc above its release. */
export function newestOfTags(tags: readonly string[]): string | null {
  let best: string | null = null;
  let bestVersion = "";
  for (const raw of tags) {
    const tag = raw.trim();
    const version = versionOfTag(tag);
    if (version === null) continue;
    if (best === null || compareVersions(version, bestVersion) > 0) {
      best = tag;
      bestVersion = version;
    }
  }
  return best;
}

/** Read-only `git tag` in the monorepo. Null when there is none or git cannot read it. */
export function newestDesktopTag(repoRoot: string): string | null {
  try {
    return newestOfTags(git(repoRoot, ["tag", "--list", "desktop-v*"]).split("\n"));
  } catch {
    return null;
  }
}

const BATCH_SSH = "ssh -o BatchMode=yes -o ConnectTimeout=5";

/**
 * The environment of the status clone: no prompt of any kind (git's own, or ssh's host-key
 * and passphrase questions), and a short connect timeout. An existing `GIT_SSH_COMMAND` is
 * kept and the options are appended, because a later `-o` does not override an earlier one
 * and the caller's command may already pick a key.
 */
export function statusCloneEnv(base: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const existing = base.GIT_SSH_COMMAND?.trim();
  return {
    ...base,
    GIT_TERMINAL_PROMPT: "0",
    GIT_ASKPASS: "",
    GIT_SSH_COMMAND: existing ? `${existing} -o BatchMode=yes -o ConnectTimeout=5` : BATCH_SSH,
  };
}

/**
 * Runs `git clone` bounded in time. The child leads its own process group so a timeout kills
 * git and the ssh it started, not just git: a stuck ssh must not outlive `bun run setup`.
 */
function boundedClone(
  remote: string,
  dir: string,
  timeoutMs: number,
  env: NodeJS.ProcessEnv,
): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(
      "git",
      ["clone", "--quiet", "--depth", "1", "--branch", CATALOG_BRANCH, remote, dir],
      { stdio: "ignore", detached: true, env: statusCloneEnv(env) },
    );
    const killGroup = (): void => {
      try {
        if (child.pid) process.kill(-child.pid, "SIGKILL");
      } catch {
        child.kill("SIGKILL");
      }
    };
    const timer = setTimeout(() => {
      killGroup();
      resolve(false);
    }, timeoutMs);
    child.on("error", () => {
      clearTimeout(timer);
      resolve(false);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      // Whatever the exit, nothing of the group may remain (an ssh that outlived git).
      killGroup();
      resolve(code === 0);
    });
  });
}

/** `main` of the catalog repository, shallow, into a temp folder; null when it cannot be read. */
export async function readRemoteManifest(
  remote: string,
  options: { timeoutMs?: number; env?: NodeJS.ProcessEnv } = {},
): Promise<Manifest | null> {
  const dir = makeTempDir("ui-catalog-status-");
  try {
    // A bounded clone: an unreachable host must not hold `bun run setup` up.
    const timeoutMs =
      options.timeoutMs ?? (Number(process.env.UI_CATALOG_STATUS_TIMEOUT_MS) || 15_000);
    const ok = await boundedClone(remote, dir, timeoutMs, options.env ?? process.env);
    return ok ? readCatalogManifest(dir) : null;
  } catch {
    return null;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function main(): Promise<number> {
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
  const manifest = await readRemoteManifest(args.remote);
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
  void main().then((code) => process.exit(code));
}
