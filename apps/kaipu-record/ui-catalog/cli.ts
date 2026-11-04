// Only node built-ins and the pure guard before the host check: nothing that can start
// Electron may load on a host that is not a catalog runner (spec failure 1).
import { USAGE, REMOTE_RECIPE, hostNames, isRunner, parseCliArgs, readRunners } from "./guard";

/**
 * `bun run ui-catalog`: the catalog's only entry point on the runner. Checks the host,
 * generates the fixtures if they are missing, clears the output folder and starts the
 * Playwright run (`run.ts`) through the real `node`, exiting with its code.
 *
 * `--prepare-only` (used by `scripts/ui-catalog-remote.sh`) stops before starting the run
 * and writes `<out>/.run.json` for `job.mjs`, which the remote wrapper submits as a launchd
 * job: macOS grants Screen Recording to the job's own `node`, never to an SSH session.
 */
async function main(): Promise<number> {
  const runners = readRunners();
  if (!isRunner(hostNames(), runners.runners)) {
    console.error(REMOTE_RECIPE);
    return 2;
  }
  const options = parseCliArgs(process.argv.slice(2));
  if ("error" in options) {
    console.error(`${options.error}\n\n${USAGE}`);
    return 1;
  }
  if (options.help) {
    console.log(USAGE);
    return 0;
  }

  const { prepareRun } = await import("./prepare");
  const spec = prepareRun({ only: options.only, twice: options.twice, label: runners.label });
  if (options.prepareOnly) {
    console.log(`UI_CATALOG_RUN_SPEC=${spec.file}`);
    return 0;
  }
  const { spawnSync } = await import("node:child_process");
  const result = spawnSync(spec.node, spec.args, {
    cwd: spec.cwd,
    env: { ...process.env, ...spec.env },
    stdio: "inherit",
  });
  console.log(`[ui-catalog] output: ${spec.env.UI_CATALOG_OUT}`);
  return result.status ?? 1;
}

void main().then((code) => process.exit(code));
