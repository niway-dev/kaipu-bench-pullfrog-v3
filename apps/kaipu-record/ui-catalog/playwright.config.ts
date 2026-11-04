import { defineConfig } from "@playwright/test";
import { REMOTE_RECIPE, hostNames, isRunner, readRunners } from "./guard";

// The same host guard as cli.ts, for anyone who starts Playwright with this config directly:
// the tests launch Electron, which never runs outside the catalog runner (ADR 0044).
if (!isRunner(hostNames(), readRunners().runners)) {
  console.error(REMOTE_RECIPE);
  process.exit(2);
}

/*
 * The UI state catalog (spec NIW2-625). Start it with `bun run ui-catalog`, never with this
 * config directly: cli.ts checks the host first, generates the fixtures and clears the output
 * folder. Run through `node` by path, for the reason given in ../playwright.config.ts.
 *
 * One worker: one Electron app at a time. No retries: a state that cannot be reached is
 * reported, not re-tried. No Playwright artifacts: the catalog writes its own images.
 */
export default defineConfig({
  testDir: ".",
  testMatch: "run.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  // Playwright empties its outputDir on every run; keep it apart from the catalog's folder.
  outputDir: "../test-results/ui-catalog-runner",
  use: { trace: "off", screenshot: "off", video: "off" },
});
