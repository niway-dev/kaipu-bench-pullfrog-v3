import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
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

/** `owner/repo` of a GitHub-style remote (scp form, ssh:// or https://), or null when it is not one. */
export function remoteOwnerAndRepo(remote: string): { owner: string; repo: string } | null {
  let pathname: string | null = null;
  const scp = /^[\w.-]+@[\w.-]+:(.+)$/.exec(remote);
  if (scp) pathname = scp[1] ?? null;
  else {
    try {
      const url = new URL(remote);
      if (url.protocol !== "file:") pathname = url.pathname;
    } catch {
      return null;
    }
  }
  if (pathname === null) return null;
  const parts = pathname
    .replace(/^\/+/, "")
    .replace(/\.git$/, "")
    .split("/");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  return { owner: parts[0], repo: parts[1] };
}

/**
 * A GitHub remote must be exactly `niway-dev/kaipu-ui-catalog`; a local path or `file://`
 * URL is allowed so tests can use a bare repository. Anything else is refused: the catalog
 * holds real screenshots and must not land in another repository by a typo.
 */
export function checkRemote(remote: string): RemoteCheck {
  if (remote.startsWith("file://") || /^(\/|\.\/|\.\.\/)/.test(remote)) return { ok: true };
  const parsed = remoteOwnerAndRepo(remote);
  if (!parsed) {
    return { ok: false, reason: `"${remote}" is neither a local path nor an owner/repo remote` };
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
