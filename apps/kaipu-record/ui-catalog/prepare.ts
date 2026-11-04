import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ensureFixtures } from "./fixtures/make-fixtures";
import { RUN_ENV } from "./run-env";

const APP_ROOT = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(APP_ROOT, "..", "..");

export interface RunSpec {
  /** Where the spec was written (`<out>/.run.json`). */
  file: string;
  /** The real `node` binary, by its resolved path. */
  node: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
}

/**
 * The real `node`, not bun's shim. `bun run` puts a `node` that is bun ahead on PATH, and
 * Playwright under bun registers its tests twice and runs none (../playwright.config.ts).
 * Resolved to its real path because macOS ties the Screen Recording grant to that file.
 */
export function findNode(pathEnv: string = process.env.PATH ?? ""): string {
  for (const dir of pathEnv.split(path.delimiter)) {
    const candidate = path.join(dir, "node");
    if (!existsSync(candidate)) continue;
    const real = realpathSync(candidate);
    if (/bun(-node)?$/.test(path.basename(real)) || real.includes(`${path.sep}.bun${path.sep}`)) {
      continue;
    }
    if (/bun-node-/.test(dir)) continue;
    return real;
  }
  throw new Error("no real node on PATH (only bun's shim); install Node 24 (mise) first");
}

/**
 * Everything before the Playwright run: fixtures, a clean output folder named after the
 * commit, and the command plus environment that start it.
 */
export function prepareRun(options: { only?: string; twice: boolean; label: string }): RunSpec {
  ensureFixtures();
  const sha = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  }).trim();
  const out = path.join(REPO_ROOT, ".evidence", "ui-catalog", sha.slice(0, 8));
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  const env: Record<string, string> = {
    [RUN_ENV.outDir]: out,
    [RUN_ENV.sha]: sha,
    [RUN_ENV.startedAt]: String(Date.now()),
    [RUN_ENV.runnerLabel]: options.label,
    [RUN_ENV.twice]: options.twice ? "1" : "0",
    ...(options.only ? { [RUN_ENV.only]: options.only } : {}),
  };
  const spec: RunSpec = {
    file: path.join(out, ".run.json"),
    node: findNode(),
    args: [
      path.join(APP_ROOT, "node_modules", "@playwright", "test", "cli.js"),
      "test",
      "-c",
      path.join(APP_ROOT, "ui-catalog", "playwright.config.ts"),
    ],
    cwd: APP_ROOT,
    env,
  };
  writeFileSync(spec.file, `${JSON.stringify(spec, null, 2)}\n`);
  return spec;
}
