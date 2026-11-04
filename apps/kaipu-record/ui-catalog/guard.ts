import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * The host guard and argument parsing of `bun run ui-catalog`, kept pure and free of any
 * Playwright import so the guard decides before anything that can launch Electron loads
 * (spec failure 1, ADR 0044). There is deliberately no flag to bypass it.
 */

export const RUNNERS_FILE = path.join(__dirname, "runners.json");

export interface RunnersFile {
  /** Hostnames (`os.hostname()`) allowed to run the catalog. */
  runners: string[];
  /** The neutral name the README and manifest use for the runner. */
  label: string;
}

export function readRunners(file: string = RUNNERS_FILE): RunnersFile {
  const parsed = JSON.parse(readFileSync(file, "utf8")) as Partial<RunnersFile>;
  if (!Array.isArray(parsed.runners) || parsed.runners.some((r) => typeof r !== "string")) {
    throw new Error(`${file}: "runners" must be a list of hostnames`);
  }
  return { runners: parsed.runners, label: parsed.label ?? "runner" };
}

/** Hostnames compare case-insensitively and with or without the `.local` suffix. */
function normalizeHost(host: string): string {
  return host
    .trim()
    .toLowerCase()
    .replace(/\.local$/, "");
}

/** True when any of the host's names is a listed runner. */
export function isRunner(names: string | readonly string[], runners: readonly string[]): boolean {
  const hosts = (typeof names === "string" ? [names] : names).map(normalizeHost).filter(Boolean);
  return runners.some((r) => hosts.includes(normalizeHost(r)));
}

/**
 * The names this machine answers to. `os.hostname()` alone is not stable on macOS: on some
 * networks it becomes the DHCP address (the mini reported `192.168.18.99` on 2026-11-04),
 * so the Bonjour name from `scutil --get LocalHostName`, which only the owner changes, is
 * accepted too.
 */
export function hostNames(): string[] {
  const names = [os.hostname()];
  if (process.platform === "darwin") {
    try {
      const local = execFileSync("/usr/sbin/scutil", ["--get", "LocalHostName"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
      if (local) names.push(`${local}.local`);
    } catch {
      // No Bonjour name: os.hostname() alone decides.
    }
  }
  return names;
}

export const REMOTE_RECIPE = [
  "The UI catalog runs the real Electron app, and only on the catalog runner (the Mac mini).",
  "From your machine, run it there and copy the result back:",
  "",
  "  cd apps/kaipu-record && bun run ui-catalog:remote [--sha <sha>] [--only <glob>] [--twice]",
  "",
  "Or by hand: ssh macmini, then in its kaipu-record checkout:",
  "",
  "  cd apps/kaipu-record && bun run ui-catalog [--only <glob>] [--twice]",
  "",
  "Hosts allowed to run it are listed in apps/kaipu-record/ui-catalog/runners.json.",
].join("\n");

export interface CliOptions {
  only?: string;
  twice: boolean;
  /** Prepare the run and write its spec for `job.mjs`, without starting it (the remote path). */
  prepareOnly: boolean;
  help: boolean;
}

export function parseCliArgs(argv: readonly string[]): CliOptions | { error: string } {
  const options: CliOptions = { twice: false, prepareOnly: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--twice") options.twice = true;
    else if (arg === "--prepare-only") options.prepareOnly = true;
    else if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--only" || arg.startsWith("--only=")) {
      const value = arg === "--only" ? argv[++i] : arg.slice("--only=".length);
      if (!value || value.startsWith("--"))
        return { error: "--only needs a glob, e.g. 'record/*'" };
      options.only = options.only ? `${options.only},${value}` : value;
    } else return { error: `unknown argument ${arg}` };
  }
  return options;
}

export const USAGE = [
  "Usage: bun run ui-catalog [--only <glob>] [--twice]",
  "",
  "  --only <glob>   only the catalog states whose id matches (record/*, *@min, a,b)",
  "  --twice         shoot every state twice and report crops whose bytes differ",
].join("\n");
