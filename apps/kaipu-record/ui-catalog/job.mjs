// The launchd job's program (scripts/ui-catalog-remote.sh). Plain JavaScript so the job is
// `node job.mjs` and nothing else: macOS grants Screen Recording to the job's responsible
// process, the mise `node` the owner granted, and a shell or bun in between would take
// that place. It runs the spec `cli.ts --prepare-only` wrote, prints a sentinel line with
// the exit code for the wrapper to poll, and then idles: `launchctl submit` keeps a job
// alive, so a job that exits is relaunched, and the wrapper removes it once it has read
// the sentinel.
import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const specFile = process.argv[2];
if (!specFile) {
  console.error("usage: node job.mjs <out>/.run.json");
  process.exit(1);
}
const idle = () => setInterval(() => {}, 3_600_000);
// launchd relaunches a job whose program ended; a relaunch must not start a second run.
const started = `${specFile}.started`;
if (existsSync(started)) {
  console.log("UI_CATALOG_EXIT=125 (relaunched by launchd; the run already happened)");
  idle();
} else {
  writeFileSync(started, `${process.pid}\n`);
  run();
}

function run() {
  const spec = JSON.parse(readFileSync(specFile, "utf8"));
  const child = spawn(spec.node, spec.args, {
    cwd: spec.cwd,
    env: { ...process.env, ...spec.env },
    stdio: ["ignore", "inherit", "inherit"],
  });
  // A failed start (ENOENT, EACCES) emits "error" and never "exit"; without a
  // listener it would crash the job and launchd would relaunch it with a wrong reason.
  child.on("error", (error) => {
    console.log(error);
    console.log(`UI_CATALOG_EXIT=127 (the run did not start: ${error.code ?? error.message})`);
    idle();
  });
  child.on("exit", (code, signal) => {
    console.log(`UI_CATALOG_EXIT=${code ?? (signal ? 128 : 1)}`);
    idle();
  });
}
