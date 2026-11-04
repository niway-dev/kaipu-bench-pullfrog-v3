import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ROUTES } from "../src/shared/routes";
import {
  ALL_AREA_IDS,
  UI_MAP,
  WINDOW_KINDS,
  areaStates,
  type ScreenSpec,
} from "../src/shared/ui-map";

/**
 * The map half of the UI catalog's coverage check (ADR 0046). A new route, window kind or
 * area fails here with its name until `src/shared/ui-map.ts` and the renderer agree. The
 * catalog half (every state demonstrated by a catalog entry) arrives with the catalog.
 */

const APP = resolve(__dirname, "..");
const RENDERER = join(APP, "src/renderer");
const SCREENS = Object.entries(UI_MAP as Record<string, ScreenSpec>);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

/** Every area literal the renderer writes: `uiArea("…")` calls and `data-ui-area="…"`. */
function rendererLiterals(): Map<string, string[]> {
  const found = new Map<string, string[]>();
  const pattern =
    /uiArea\(\s*"([A-Za-z]+\.[A-Za-z]+)"\s*\)|data-ui-area=\{?"([A-Za-z]+\.[A-Za-z]+)"/g;
  for (const file of sourceFiles(RENDERER)) {
    if (file.endsWith("lib/ui-area.ts")) continue;
    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(pattern)) {
      const id = match[1] ?? match[2];
      found.set(id, [...(found.get(id) ?? []), file.slice(APP.length + 1)]);
    }
  }
  return found;
}

/** The settings children the router declares, minus the ones that only redirect. */
function settingsChildren(): { paths: string[]; redirects: string[] } {
  const router = readFileSync(join(RENDERER, "src/app/router.tsx"), "utf8");
  const start = router.indexOf("path: ROUTES.settings");
  const block = router.slice(start, router.indexOf('{ path: "*"', start));
  const paths: string[] = [];
  const redirects: string[] = [];
  for (const match of block.matchAll(/path:\s*"([^"]+)",\s*element:\s*(<Navigate\b)?/g)) {
    (match[2] ? redirects : paths).push(match[1]);
  }
  return { paths, redirects };
}

describe("ui-map coverage", () => {
  it("has a screen for every ROUTES entry", () => {
    const covered = new Set(
      SCREENS.flatMap(([, s]) => (s.kind === "route" && s.route ? [s.route as string] : [])),
    );
    const missing = Object.entries(ROUTES)
      .filter(([, path]) => !covered.has(path))
      .map(([name]) => name);
    expect(missing, "ROUTES entries with no screen (or redirect/notCapturable)").toEqual([]);
  });

  it("has a window screen for every WINDOW_KINDS entry", () => {
    const covered = new Set(SCREENS.flatMap(([, s]) => (s.kind === "window" ? [s.window] : [])));
    expect(WINDOW_KINDS.filter((kind) => !covered.has(kind))).toEqual([]);
  });

  it("has a screen for every Settings child route in the router", () => {
    const { paths } = settingsChildren();
    expect(paths.length).toBeGreaterThan(0);
    const covered = new Set(
      SCREENS.flatMap(([, s]) => (s.kind === "route" ? [s.route as string] : [])),
    );
    const missing = paths.filter((p) => !covered.has(`/settings/${p}`));
    expect(missing, "settings children with no screen").toEqual([]);
  });

  it("gives every capturable screen an area", () => {
    const empty = SCREENS.filter(([, s]) => {
      if ("redirect" in s || "notCapturable" in s) return false;
      return Object.keys(s.areas).length === 0;
    }).map(([id]) => id);
    expect(empty).toEqual([]);
  });

  it("gives every area a state", () => {
    expect(ALL_AREA_IDS.filter((id) => areaStates(id).length === 0)).toEqual([]);
  });

  it("only writes area literals the map declares", () => {
    const declared = new Set<string>(ALL_AREA_IDS);
    const unknown = [...rendererLiterals()].filter(([id]) => !declared.has(id));
    expect(unknown.map(([id, files]) => `${id} (${files[0]})`)).toEqual([]);
  });

  it("annotates every declared area somewhere in the renderer", () => {
    const written = rendererLiterals();
    expect(ALL_AREA_IDS.filter((id) => !written.has(id))).toEqual([]);
  });
});
