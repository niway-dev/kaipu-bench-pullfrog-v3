import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Manifest } from "./manifest";
import { readRunners } from "./guard";

/**
 * `bun run ui-catalog:lint [<output dir>]`: the deny-list check that runs before anything is
 * published (spec failure 7, ADR 0045). The images cannot be read as text, so this scans
 * everything that can be: the seed and fixture sources, the catalog descriptions, and the
 * run's README, manifest and log. What it cannot scan it lists, by state, for a look by eye.
 *
 * The matching is pure (`scanText`); the machine-derived entries are collected at run time
 * and are printed masked, so this log never repeats what it is protecting.
 */

const UI_CATALOG_DIR = __dirname;
export const DENY_LIST_FILE = path.join(UI_CATALOG_DIR, "deny-list.txt");
const MIN_ENTRY_LENGTH = 3;

export interface DenyEntry {
  /** Lowercased: the match is case-insensitive. */
  readonly needle: string;
  /** What a hit prints. A machine value prints as `<user name>`, never as itself. */
  readonly shown: string;
  /** True for a runtime value that must not be echoed. */
  readonly masked: boolean;
}

export interface Hit {
  readonly file: string;
  readonly line: number;
  readonly entry: string;
}

export function parseDenyList(text: string): DenyEntry[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"))
    .map((line) => ({ needle: line.toLowerCase(), shown: line, masked: false }));
}

export interface MachineValues {
  readonly username?: string;
  readonly homedir?: string;
  readonly hostnames?: readonly string[];
  readonly runnerHosts?: readonly string[];
}

/** Values this machine knows about itself, as masked deny-list entries. Too-short ones are dropped. */
export function machineEntries(values: MachineValues): DenyEntry[] {
  const out: DenyEntry[] = [];
  const add = (value: string | undefined, label: string): void => {
    const trimmed = value?.trim();
    if (!trimmed || trimmed.length < MIN_ENTRY_LENGTH) return;
    out.push({ needle: trimmed.toLowerCase(), shown: `<${label}>`, masked: true });
    // `Name.local` is written as `Name` as often as not.
    if (trimmed.toLowerCase().endsWith(".local") && trimmed.length - 6 >= MIN_ENTRY_LENGTH) {
      out.push({ needle: trimmed.slice(0, -6).toLowerCase(), shown: `<${label}>`, masked: true });
    }
  };
  add(values.username, "this machine's user name");
  add(values.homedir, "this machine's home folder");
  for (const host of values.hostnames ?? []) add(host, "this machine's hostname");
  for (const host of values.runnerHosts ?? []) add(host, "a catalog runner's hostname");
  return out;
}

/** Collected at run time, from this machine and `runners.json`. Nothing here is written to disk. */
export function currentMachineEntries(): DenyEntry[] {
  const hostnames = [os.hostname()];
  if (process.platform === "darwin") {
    try {
      const local = execFileSync("/usr/sbin/scutil", ["--get", "LocalHostName"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
      if (local) hostnames.push(local, `${local}.local`);
    } catch {
      // No Bonjour name: the other values still apply.
    }
  }
  let username: string | undefined;
  try {
    username = os.userInfo().username;
  } catch {
    username = process.env.USER;
  }
  let runnerHosts: string[] = [];
  try {
    runnerHosts = readRunners().runners;
  } catch {
    // A broken runners.json is the guard's problem, not the lint's.
  }
  return machineEntries({ username, homedir: os.homedir(), hostnames, runnerHosts });
}

/** Every line of `text` that contains an entry, one hit per line and entry. */
export function scanText(file: string, text: string, entries: readonly DenyEntry[]): Hit[] {
  const hits: Hit[] = [];
  text.split(/\r?\n/).forEach((line, index) => {
    const lower = line.toLowerCase();
    const seen = new Set<string>();
    for (const entry of entries) {
      if (!lower.includes(entry.needle) || seen.has(entry.shown)) continue;
      seen.add(entry.shown);
      hits.push({ file, line: index + 1, entry: entry.shown });
    }
  });
  return hits;
}

/** The states whose image shows real screen content, as `id (why)` lines. */
export function reviewByEye(manifest: Pick<Manifest, "states">): string[] {
  return manifest.states
    .filter((state) => state.embedsScreen === true && state.status === "shot")
    .map((state) => state.id)
    .sort();
}

function listFiles(dir: string, pattern: RegExp): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return entry.name === "out" ? [] : listFiles(full, pattern);
      return pattern.test(entry.name) ? [full] : [];
    })
    .sort();
}

/** The sources a seed or description could leak from: fixtures, profiles and the catalog. */
export function sourceFiles(uiCatalogDir: string = UI_CATALOG_DIR): string[] {
  return [
    ...listFiles(path.join(uiCatalogDir, "fixtures"), /\.ts$/),
    path.join(uiCatalogDir, "profiles.ts"),
    ...listFiles(path.join(uiCatalogDir, "catalog"), /\.ts$/),
  ].filter((file) => existsSync(file));
}

/** The shot states that are never published, as `id`, sorted. */
export function unpublishedStates(manifest: Pick<Manifest, "states">): string[] {
  return manifest.states
    .filter((state) => state.unpublished && state.status === "shot")
    .map((state) => state.id)
    .sort();
}

export interface LintResult {
  readonly hits: readonly Hit[];
  readonly reviewByEye: readonly string[];
  /** Shot but excluded from publishing: listed, not reviewed. */
  readonly unpublished: readonly string[];
  readonly scanned: readonly string[];
  readonly errors: readonly string[];
}

export interface LintOptions {
  /** The committed deny-list: applied to the catalog sources and to the generated output. */
  readonly entries?: readonly DenyEntry[];
  /**
   * Values derived from this machine (user name, hostnames): applied to the generated output
   * only. As substrings they would match ids and comments in the sources (a user `root`
   * matches `cameraBubble.root`), and a source file cannot hold the machine's own value.
   */
  readonly machineEntries?: readonly DenyEntry[];
  readonly sources?: readonly string[];
  /** Used when the manifest predates `embedsScreen` (a run made before the field existed). */
  readonly fallbackReview?: readonly string[];
  /** The catalog source's `unpublished` ids: also honoured, for a manifest from before the field. */
  readonly fallbackUnpublished?: readonly string[];
}

export function lintOutputDir(outDir: string, options: LintOptions = {}): LintResult {
  const entries = options.entries ?? parseDenyList(readFileSync(DENY_LIST_FILE, "utf8"));
  const outputEntries = [...entries, ...(options.machineEntries ?? currentMachineEntries())];
  const sources = options.sources ?? sourceFiles();
  const errors: string[] = [];
  const hits: Hit[] = [];
  const scanned: string[] = [];

  const scan = (file: string, label: string, against: readonly DenyEntry[]): void => {
    hits.push(...scanText(label, readFileSync(file, "utf8"), against));
    scanned.push(label);
  };
  for (const file of sources)
    scan(file, path.relative(path.dirname(UI_CATALOG_DIR), file), entries);
  for (const name of ["README.md", "manifest.json", "run.log"]) {
    const file = path.join(outDir, name);
    if (existsSync(file)) scan(file, `<output>/${name}`, outputEntries);
    else if (name !== "run.log") errors.push(`${outDir}: ${name} is missing`);
  }

  let review: readonly string[] = [];
  let unpublished: readonly string[] = [];
  try {
    const manifest = JSON.parse(
      readFileSync(path.join(outDir, "manifest.json"), "utf8"),
    ) as Manifest;
    const flagged = reviewByEye(manifest);
    const known = manifest.states.some((state) => "embedsScreen" in state);
    // The manifest's own flags plus the catalog source's: a run that predates the field is
    // still kept private, and a flag in either place is enough.
    unpublished = [
      ...new Set([...unpublishedStates(manifest), ...(options.fallbackUnpublished ?? [])]),
    ]
      .filter((id) => manifest.states.some((s) => s.id === id && s.status === "shot"))
      .sort();
    review = (known ? flagged : (options.fallbackReview ?? [])).filter(
      (id) => !unpublished.includes(id),
    );
  } catch {
    errors.push(`${outDir}: manifest.json cannot be read`);
  }
  return { hits, reviewByEye: review, unpublished, scanned, errors };
}

/** The output folder with the newest manifest under `<repo root>/.evidence/ui-catalog/`. */
export function newestOutputDir(repoRoot: string): string | null {
  const base = path.join(repoRoot, ".evidence", "ui-catalog");
  if (!existsSync(base)) return null;
  const candidates = readdirSync(base)
    .map((name) => path.join(base, name))
    .filter((dir) => existsSync(path.join(dir, "manifest.json")))
    .map((dir) => ({ dir, time: statSync(path.join(dir, "manifest.json")).mtimeMs }))
    .sort((a, b) => b.time - a.time);
  return candidates[0]?.dir ?? null;
}

export function repoRootOf(uiCatalogDir: string = UI_CATALOG_DIR): string {
  return path.resolve(uiCatalogDir, "..", "..", "..");
}

/** Prints the result the way `ui-catalog:lint` and `ui-catalog:publish` both show it. */
export function printLint(result: LintResult, outDir: string): void {
  console.log(`[ui-catalog:lint] ${outDir}: scanned ${result.scanned.length} files`);
  for (const error of result.errors) console.error(`[ui-catalog:lint] ${error}`);
  for (const hit of result.hits) {
    console.error(`[ui-catalog:lint] DENIED ${hit.file}:${hit.line} matches ${hit.entry}`);
  }
  if (result.reviewByEye.length > 0) {
    console.log(
      `[ui-catalog:lint] review by eye before publishing (these images embed real screen content, ${result.reviewByEye.length}):`,
    );
    for (const id of result.reviewByEye) console.log(`  - ${id}`);
  }
  if (result.unpublished.length > 0) {
    console.log(
      `[ui-catalog:lint] unpublished (shot locally, excluded from publishing, not reviewed, ${result.unpublished.length}):`,
    );
    for (const id of result.unpublished) console.log(`  - ${id}`);
  }
}

export function lintFailed(result: LintResult): boolean {
  return result.hits.length > 0 || result.errors.length > 0;
}

/** Catalog states flagged `embedsScreen`, for a manifest that does not carry the field. */
async function catalogReview(): Promise<string[]> {
  const { CATALOGS } = await import("./catalog");
  const { flattenCatalog } = await import("./types");
  return flattenCatalog(CATALOGS)
    .filter((entry) => entry.spec.embedsScreen === true)
    .map((entry) => entry.id)
    .sort();
}

/** Catalog states flagged `unpublished`, for a manifest that does not carry the field. */
async function catalogUnpublished(): Promise<string[]> {
  const { CATALOGS } = await import("./catalog");
  const { flattenCatalog } = await import("./types");
  return flattenCatalog(CATALOGS)
    .filter((entry) => Boolean(entry.spec.unpublished))
    .map((entry) => entry.id)
    .sort();
}

export async function lintDir(outDir: string): Promise<LintResult> {
  return lintOutputDir(outDir, {
    fallbackReview: await catalogReview(),
    fallbackUnpublished: await catalogUnpublished(),
  });
}

async function main(): Promise<number> {
  const arg = process.argv.slice(2).find((a) => !a.startsWith("-"));
  const outDir = arg ? path.resolve(arg) : newestOutputDir(repoRootOf());
  if (!outDir || !existsSync(outDir)) {
    console.error(
      "[ui-catalog:lint] no output folder: pass one, or run `bun run ui-catalog:remote`",
    );
    return 1;
  }
  const result = await lintDir(outDir);
  printLint(result, outDir);
  if (lintFailed(result)) return 1;
  console.log("[ui-catalog:lint] clean");
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main().then((code) => process.exit(code));
}
