import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CATALOG_BRANCH,
  DEFAULT_REMOTE,
  checkRemote,
  cloneCatalog,
  git,
  manifestDate,
  readCatalogManifest,
} from "./catalog-repo";
import {
  type LintResult,
  unpublishedStates,
  lintDir,
  lintFailed,
  newestOutputDir,
  printLint,
  repoRootOf,
} from "./lint";
import type { Manifest } from "./manifest";
import { renderRootIndex, renderVersionPages, newestFirst } from "./readme";
import { compareVersions } from "./status";

/**
 * `bun run ui-catalog:publish [<output dir>] [--push] [--force] [--remote <url>] [--author "Name <email>"]`
 *
 * Takes one run's output folder and turns it into one commit of the private catalog
 * repository, in a fresh temp clone (spec decision 11, ADR 0045). It lints first, checks the
 * folder is the run it claims to be, checks the remote, refuses to go backwards, and pushes
 * only when asked. The monorepo is read for the commit identity and never written.
 */

/** What a run's folder must hold to be published; the images and manifest are copied under `versions/<version>/`. */
const REQUIRED = ["screens", "areas", "manifest.json", "README.md"] as const;
/** What is copied from a run's folder into its version folder; the pages are rendered from the manifest. */
const COPIED = ["screens", "areas", "manifest.json"] as const;
/** The flat layout the repository had before versions; the first versioned publish removes it. */
const LEGACY = ["screens", "areas"] as const;
const VERSION_PATTERN = /^[0-9A-Za-z][0-9A-Za-z.+-]*$/;

/** Every `versions/*\/manifest.json` in the clone. */
export function readVersionManifests(cloneDir: string): Manifest[] {
  const root = path.join(cloneDir, "versions");
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .map((name) => path.join(root, name, "manifest.json"))
    .filter((file) => existsSync(file))
    .map((file) => JSON.parse(readFileSync(file, "utf8")) as Manifest);
}

export interface PublishArgs {
  readonly outDir?: string;
  readonly push: boolean;
  readonly force: boolean;
  readonly remote: string;
  readonly author?: string;
  readonly help: boolean;
}

export const PUBLISH_USAGE = `Usage: bun run ui-catalog:publish [<output dir>] [--push] [--force] [--remote <url>] [--author "Name <email>"]

  <output dir>  a run's folder under .evidence/ui-catalog/ (default: the newest)
  --push        push the commit to ${CATALOG_BRANCH}; without it the commit stays in the temp clone
  --force       publish a run older than, or not ahead of, the catalog's
  --remote      the catalog repository (default: ${DEFAULT_REMOTE})
  --author      commit identity; default: user.name / user.email read from the monorepo`;

export function parsePublishArgs(argv: readonly string[]): PublishArgs | { error: string } {
  let outDir: string | undefined;
  let push = false;
  let force = false;
  let help = false;
  let remote = DEFAULT_REMOTE;
  let author: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] as string;
    if (arg === "--push") push = true;
    else if (arg === "--force") force = true;
    else if (arg === "-h" || arg === "--help") help = true;
    else if (arg === "--remote" || arg === "--author") {
      const value = argv[++i];
      if (!value) return { error: `${arg} needs a value` };
      if (arg === "--remote") remote = value;
      else author = value;
    } else if (arg.startsWith("-")) return { error: `unknown argument: ${arg}` };
    else if (outDir === undefined) outDir = arg;
    else return { error: `unexpected argument: ${arg}` };
  }
  return { outDir, push, force, remote, author, help };
}

export interface Identity {
  readonly name: string;
  readonly email: string;
}

/** `Name <email>`. */
export function parseAuthor(author: string): Identity | null {
  const match = /^\s*(.+?)\s*<([^<>\s]+@[^<>\s]+)>\s*$/.exec(author);
  return match ? { name: match[1] as string, email: match[2] as string } : null;
}

/** Read-only: `git config` in the monorepo. Never falls back to an unset identity. */
export function identityFromRepo(repoRoot: string): Identity | null {
  const read = (key: string): string => {
    try {
      return git(repoRoot, ["config", "--get", key]);
    } catch {
      return "";
    }
  };
  const name = read("user.name");
  const email = read("user.email");
  return name && email ? { name, email } : null;
}

export function commitMessage(manifest: Manifest): string {
  return `catalog: kaipu-record ${manifest.app.version} ${manifestDate(manifest)} @ ${manifest.app.shortSha}`;
}

/** Whether `current` is an ancestor of `incoming`; null when it cannot be told (a SHA unknown here). */
export type AncestryCheck = (currentSha: string, incomingSha: string) => boolean | null;

/** Read-only `git merge-base --is-ancestor` in the monorepo: 0 yes, 1 no, anything else unknown. */
export function gitAncestry(repoRoot: string): AncestryCheck {
  return (currentSha, incomingSha) => {
    try {
      execFileSync("git", ["merge-base", "--is-ancestor", currentSha, incomingSha], {
        cwd: repoRoot,
        stdio: "ignore",
      });
      return true;
    } catch (error) {
      return (error as { status?: number }).status === 1 ? false : null;
    }
  };
}

/**
 * A refusal reason when `incoming` would take the catalog backwards; null when it may go
 * ahead. Backwards is any of: an older date, an older app version, or (both SHAs known) a
 * current commit that is not an ancestor of the incoming one. `--force` skips all three.
 */
export function backwardsReason(
  current: Manifest | null,
  incoming: Manifest,
  isAncestor: AncestryCheck = () => null,
): string | null {
  if (!current) return null;
  const held = `the catalog already holds ${current.app.version} @ ${current.app.shortSha} from ${manifestDate(current)}`;
  const offered = `${incoming.app.version} @ ${incoming.app.shortSha} from ${manifestDate(incoming)}`;
  if (Date.parse(incoming.generatedAt) < Date.parse(current.generatedAt)) {
    return `${held}, newer than ${offered}; use --force to go backwards`;
  }
  if (compareVersions(incoming.app.version, current.app.version) < 0) {
    return `${held}, a newer app version than ${offered}; use --force to go backwards`;
  }
  if (current.app.sha && incoming.app.sha && current.app.sha !== incoming.app.sha) {
    const ancestor = isAncestor(current.app.sha, incoming.app.sha);
    if (ancestor === null) {
      return `${held}; cannot tell whether ${incoming.app.shortSha} is ahead of it (a commit is unknown in this clone); use --force to publish anyway`;
    }
    if (!ancestor) {
      return `${held}, which is not an ancestor of ${offered}; use --force to publish anyway`;
    }
  }
  return null;
}

export interface PublishOptions {
  readonly outDir: string;
  readonly remote: string;
  readonly push: boolean;
  readonly force: boolean;
  readonly identity: Identity;
  /** Defaults to the real lint; a test can pass its own. */
  readonly lint?: (outDir: string) => Promise<LintResult>;
  /** Defaults to `git merge-base --is-ancestor` in the monorepo; a test can pass its own. */
  readonly isAncestor?: AncestryCheck;
}

export type PublishResult =
  | { status: "published"; cloneDir: string; message: string; pushed: boolean }
  | { status: "unchanged"; cloneDir: string }
  | { status: "refused"; reason: string };

export async function publish(options: PublishOptions): Promise<PublishResult> {
  const { outDir, remote } = options;
  const linted = await (options.lint ?? lintDir)(outDir);
  if (lintFailed(linted)) {
    printLint(linted, outDir);
    return { status: "refused", reason: "the deny-list lint failed; nothing was published" };
  }

  const manifestFile = path.join(outDir, "manifest.json");
  if (!existsSync(manifestFile)) return { status: "refused", reason: `${manifestFile} is missing` };
  const manifest = JSON.parse(readFileSync(manifestFile, "utf8")) as Manifest;
  const folder = path.basename(path.resolve(outDir));
  if (manifest.app.shortSha !== folder || !manifest.app.sha.startsWith(folder)) {
    return {
      status: "refused",
      reason: `the folder is named ${folder} but its manifest is of ${manifest.app.shortSha}`,
    };
  }
  if (!VERSION_PATTERN.test(manifest.app.version)) {
    return {
      status: "refused",
      reason: `"${manifest.app.version}" is not a usable version folder name`,
    };
  }
  for (const item of REQUIRED) {
    if (!existsSync(path.join(outDir, item))) {
      return { status: "refused", reason: `${path.join(outDir, item)} is missing` };
    }
  }

  const remoteCheck = checkRemote(remote);
  if (!remoteCheck.ok) return { status: "refused", reason: remoteCheck.reason };

  const cloneDir = cloneCatalog(remote);
  const origin = git(cloneDir, ["remote", "get-url", "origin"]);
  if (origin !== remote) {
    return { status: "refused", reason: `the clone's origin is ${origin}, not ${remote}` };
  }

  const backwards = backwardsReason(
    readCatalogManifest(cloneDir),
    manifest,
    options.isAncestor ?? gitAncestry(repoRootOf()),
  );
  if (backwards && !options.force) return { status: "refused", reason: backwards };

  // An empty repository has no branch yet: start it on the catalog's branch.
  git(cloneDir, ["checkout", "--quiet", "-B", CATALOG_BRANCH]);
  // Only this version's folder is replaced; the other versions stay as they are.
  const versionRel = path.posix.join("versions", manifest.app.version);
  const versionDir = path.join(cloneDir, versionRel);
  rmSync(versionDir, { recursive: true, force: true });
  mkdirSync(versionDir, { recursive: true });
  for (const item of COPIED) {
    cpSync(path.join(outDir, item), path.join(versionDir, item), { recursive: true });
  }
  for (const [name, text] of Object.entries(renderVersionPages(manifest))) {
    writeFileSync(path.join(versionDir, name), text);
  }
  // Unpublished states are shot locally and never leave this machine: drop their images.
  const unpublishedIds = new Set([...linted.unpublished, ...unpublishedStates(manifest)]);
  for (const state of manifest.states) {
    if (!unpublishedIds.has(state.id)) continue;
    const files = [state.window?.file, ...state.areasFound.map((a) => a.file)];
    for (const file of files) {
      if (file) rmSync(path.join(versionDir, file), { force: true });
    }
  }
  // The flat layout of the first publishes goes away; the root index and manifest are rebuilt.
  for (const legacy of LEGACY)
    rmSync(path.join(cloneDir, legacy), { recursive: true, force: true });
  const versions = newestFirst(readVersionManifests(cloneDir));
  writeFileSync(path.join(cloneDir, "README.md"), renderRootIndex(versions));
  cpSync(
    path.join(cloneDir, "versions", (versions[0] as Manifest).app.version, "manifest.json"),
    path.join(cloneDir, "manifest.json"),
  );
  // A temp clone of the catalog, never the monorepo: staging everything is safe here.
  git(cloneDir, ["add", "-A"]);
  if (git(cloneDir, ["status", "--porcelain"]) === "") return { status: "unchanged", cloneDir };

  const message = commitMessage(manifest);
  git(cloneDir, [
    "-c",
    `user.name=${options.identity.name}`,
    "-c",
    `user.email=${options.identity.email}`,
    "-c",
    "commit.gpgsign=false",
    "commit",
    "--quiet",
    "-m",
    message,
  ]);
  if (options.push) git(cloneDir, ["push", "--quiet", "origin", `HEAD:${CATALOG_BRANCH}`]);
  return { status: "published", cloneDir, message, pushed: options.push };
}

async function main(): Promise<number> {
  const args = parsePublishArgs(process.argv.slice(2));
  if ("error" in args) {
    console.error(`${args.error}\n\n${PUBLISH_USAGE}`);
    return 1;
  }
  if (args.help) {
    console.log(PUBLISH_USAGE);
    return 0;
  }
  const repoRoot = repoRootOf();
  const outDir = args.outDir ? path.resolve(args.outDir) : newestOutputDir(repoRoot);
  if (!outDir || !existsSync(outDir)) {
    console.error(
      "[ui-catalog:publish] no output folder: pass one, or run `bun run ui-catalog:remote`",
    );
    return 1;
  }
  const identity = args.author ? parseAuthor(args.author) : identityFromRepo(repoRoot);
  if (!identity) {
    console.error(
      '[ui-catalog:publish] no commit identity: pass --author "Name <email>" (git config has no user.name / user.email)',
    );
    return 1;
  }
  const result = await publish({
    outDir,
    remote: args.remote,
    push: args.push,
    force: args.force,
    identity,
  });
  if (result.status === "refused") {
    console.error(`[ui-catalog:publish] refused: ${result.reason}`);
    return 1;
  }
  console.log(`[ui-catalog:publish] temp clone: ${result.cloneDir}`);
  if (result.status === "unchanged") {
    console.log("[ui-catalog:publish] the catalog already holds these images; nothing to commit");
    return 0;
  }
  console.log(`[ui-catalog:publish] committed: ${result.message}`);
  console.log(
    result.pushed
      ? `[ui-catalog:publish] pushed to ${CATALOG_BRANCH}`
      : "[ui-catalog:publish] not pushed (add --push)",
  );
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main().then((code) => process.exit(code));
}
