/** Environment variables `cli.ts` hands the Playwright run (`run.ts`). */
export const RUN_ENV = {
  only: "UI_CATALOG_ONLY",
  twice: "UI_CATALOG_TWICE",
  outDir: "UI_CATALOG_OUT",
  sha: "UI_CATALOG_SHA",
  startedAt: "UI_CATALOG_STARTED_AT",
  runnerLabel: "UI_CATALOG_RUNNER_LABEL",
} as const;
