import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Kaipu Black editor layout (NIW2-619): the exact lane heights, the gap between lanes,
 * the rail width and where the picture sits. jsdom has no layout engine, so these read
 * the real stylesheets; the harness screenshots are the visual proof.
 */
const dir = path.dirname(new URL(import.meta.url).pathname);
const css = (file: string): string => readFileSync(path.join(dir, file), "utf8");

/** Declarations of one top-level rule, comments stripped (they quote old values). */
function rule(source: string, selector: string): string {
  const match = source.match(new RegExp(`(?:^|\\n)\\${selector}\\s*\\{([^}]*)\\}`));
  if (!match) throw new Error(`no rule for ${selector}`);
  return match[1]!.replace(/\/\*[\s\S]*?\*\//g, "");
}

describe("timeline lanes (15% lower than NIW2-611)", () => {
  it.each([
    ["zoom-lane.module.css", ".lane", "26px"],
    ["privacy-lane.module.css", ".lane", "20px"],
    ["audio-lane.module.css", ".lane", "29px"],
    ["timeline-strip.module.css", ".track", "46px"],
  ])("%s %s is %s tall", (file, selector, height) => {
    expect(rule(css(file), selector)).toMatch(new RegExp(`(?:^|[\\s;])height:\\s*${height};`));
  });

  it("leaves 3px between lanes", () => {
    expect(rule(css("timeline-strip.module.css"), ".timelineBody")).toMatch(/row-gap:\s*3px;/);
  });
});

describe("tool rail and picture", () => {
  it("the rail is 44px wide", () => {
    expect(rule(css("editor-toolbar.module.css"), ".rail")).toMatch(/(?:^|\s)width:\s*44px;/);
  });

  it("the tool flyout uses the panel surface, a strong 1px line, a 6px radius and the popover shadow", () => {
    const flyout = rule(css("editor-toolbar.module.css"), ".flyout");
    expect(flyout).toMatch(/background:\s*var\(--bg-panel\)/);
    expect(flyout).toMatch(/border:\s*1px solid var\(--line-strong\)/);
    expect(flyout).toMatch(/border-radius:\s*6px/);
    expect(flyout).toMatch(/box-shadow:\s*var\(--shadow-popover\)/);
  });

  it("the current flyout option takes the accent colour", () => {
    expect(rule(css("editor-toolbar.module.css"), ".flyoutCurrent")).toMatch(
      /color:\s*var\(--accent-primary\)/,
    );
  });

  it("nothing paints a hover fill in a corner of a rail button", () => {
    const toolbar = css("editor-toolbar.module.css");
    expect(toolbar).not.toMatch(/variantSwitch/);
  });

  it("the picture is centred with a 12px margin", () => {
    const region = rule(
      css("../../../pages/video-editor/video-editor-page.module.css"),
      ".videoRegion",
    );
    expect(region).toMatch(/justify-items:\s*center;/);
    expect(region).toMatch(/padding:\s*12px;/);
  });
});
