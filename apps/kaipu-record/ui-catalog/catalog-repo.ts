import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Manifest } from "./manifest";

/**
 * What `publish.ts` and `status.ts` share: where the private catalog repository is, how to
 * check a remote really is that repository, and how to clone it into a temp folder. Git runs
 * only in temp folders created here; the monorepo is never the working directory of a git
 * command that writes (ADR 0045).
 */

export const CATALOG_OWNER = "niway-dev";
export const CATALOG_REPO = "kaipu-ui-catalog";
/** `github-csdev` is this machine's SSH alias for niway-dev repos (`~/GITHUB_ACCOUNTS.md`). */
export const DEFAULT_REMOTE = `git@github-csdev:${CATALOG_OWNER}/${CATALOG_REPO}.git`;
export const CATALOG_BRANCH = "main";

export type RemoteCheck = { ok: true } | { ok: false; reason: string };

/** The hosts a catalog remote may live on: GitHub itself and this machine's niway SSH alias. */
export const ALLOWED_HOSTS: readonly string[] = ["github.com", "github-csdev"];

export interface ParsedRemote {
  readonly host: string;
  readonly owner: string;
  readonly repo: string;
}

/** `host` and `owner/repo` of a GitHub-style remote (scp form, ssh:// or https://), or null when it is not one. */
export function parseRemote(remote: string): ParsedRemote | null {
  // A query or fragment has no place in a git remote; it is how `?x=/a/b` fakes a path.
  if (/[?#\s]/.test(remote)) return null;
  let host: string;
  let pathname: string;
  const scp = /^[\w.-]+@([\w.-]+):(.+)$/.exec(remote);
  if (scp) {
    host = scp[1] as string;
    pathname = scp[2] as string;
  } else {
    try {
      const url = new URL(remote);
      if (url.protocol !== "ssh:" && url.protocol !== "https:") return null;
      if (url.port || url.password) return null;
      host = url.hostname;
      pathname = url.pathname;
    } catch {
      return null;
    }
  }
  const parts = pathname
    .replace(/^\/+/, "")
    .replace(/\.git$/, "")
    .split("/");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  return { host: host.toLowerCase(), owner: parts[0], repo: parts[1] };
}

/** `owner/repo` of a GitHub-style remote, or null when it is not one. */
export function remoteOwnerAndRepo(remote: string): { owner: string; repo: string } | null {
  const parsed = parseRemote(remote);
  return parsed ? { owner: parsed.owner, repo: parsed.repo } : null;
}

const MONOREPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

/** The absolute git common dir of a folder, resolved through symlinks; null when it is not in a repository. */
function commonDirOf(cwd: string): string | null {
  try {
    return realpathSync(git(cwd, ["rev-parse", "--path-format=absolute", "--git-common-dir"]));
  } catch {
    return null;
  }
}

/**
 * A relative local path (`./x`, `../x`) as an absolute one, resolved once against the
 * current folder. Clone runs in another cwd and git reports an absolute origin, so the raw
 * relative form would point to a different folder (or compare unequal) further on.
 */
export function normalizeRemote(remote: string): string {
  return /^(\.\/|\.\.\/)/.test(remote) ? path.resolve(remote) : remote;
}

/** A local remote is a path, or a file:// URL; anything else is not local. */
function localRemotePath(remote: string): string | null {
  if (remote.startsWith("file://")) {
    try {
      return fileURLToPath(remote);
    } catch {
      return null;
    }
  }
  return /^(\/|\.\/|\.\.\/)/.test(remote) ? path.resolve(remote) : null;
}

function checkLocalRemote(remote: string, localPath: string, monorepoRoot: string): RemoteCheck {
  let bare: string;
  try {
    bare = git(localPath, ["rev-parse", "--is-bare-repository"]);
  } catch {
    return { ok: false, reason: `"${remote}" is not a git repository` };
  }
  if (bare !== "true") {
    return {
      ok: false,
      reason: `"${remote}" is a working repository, not a bare one; publishing would write into it`,
    };
  }
  const common = commonDirOf(localPath);
  if (common !== null && common === commonDirOf(monorepoRoot)) {
    return { ok: false, reason: `"${remote}" is the monorepo's own repository` };
  }
  return { ok: true };
}

/**
 * A GitHub remote must be exactly `niway-dev/kaipu-ui-catalog` on `github.com` or the
 * `github-csdev` alias. A local remote (path or `file://`) is allowed so tests can use a
 * repository, but only a bare one that is not the monorepo's. Anything else is refused: the
 * catalog holds real screenshots and must not land in another repository by a typo.
 */
export function checkRemote(remote: string, monorepoRoot: string = MONOREPO_ROOT): RemoteCheck {
  const localPath = localRemotePath(remote);
  if (localPath !== null) return checkLocalRemote(remote, localPath, monorepoRoot);
  const parsed = parseRemote(remote);
  if (!parsed) {
    return { ok: false, reason: `"${remote}" is neither a local path nor an owner/repo remote` };
  }
  if (!ALLOWED_HOSTS.includes(parsed.host)) {
    return {
      ok: false,
      reason: `"${remote}" is on ${parsed.host}, not ${ALLOWED_HOSTS.join(" or ")}`,
    };
  }
  if (parsed.owner !== CATALOG_OWNER || parsed.repo !== CATALOG_REPO) {
    return {
      ok: false,
      reason: `"${remote}" is ${parsed.owner}/${parsed.repo}, not ${CATALOG_OWNER}/${CATALOG_REPO}`,
    };
  }
  return { ok: true };
}

export function git(cwd: string, args: readonly string[]): string {
  return execFileSync("git", [...args], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

export function makeTempDir(prefix: string): string {
  return mkdtempSync(path.join(os.tmpdir(), prefix));
}

/** Clones into a fresh temp folder; refuses a target that is not empty. An empty repo works. */
export function cloneCatalog(remote: string, options: { shallow?: boolean } = {}): string {
  const dir = makeTempDir("ui-catalog-clone-");
  if (readdirSync(dir).length > 0) throw new Error(`${dir} is not empty`);
  const args = ["clone", "--quiet", ...(options.shallow ? ["--depth", "1"] : []), remote, dir];
  git(os.tmpdir(), args);
  return dir;
}

/** The manifest the catalog repository currently holds, or null (empty repository, no file). */
export function readCatalogManifest(cloneDir: string): Manifest | null {
  const file = path.join(cloneDir, "manifest.json");
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, "utf8")) as Manifest;
}

/** `YYYY-MM-DD` (UTC) of a manifest's `generatedAt`. */
export function manifestDate(manifest: Pick<Manifest, "generatedAt">): string {
  return new Date(manifest.generatedAt).toISOString().slice(0, 10);
}
