import type { Manifest, ManifestScreen, ManifestState } from "./manifest";
import {
  INSTRUCTIONS,
  NOT_CAPTURABLE_KINDS,
  type NotCapturableKind,
} from "./catalog/not-capturable";
import { compareVersions } from "./status";

/**
 * `manifest.json` → `README.md`. Pure: the README is a function of the run and nothing
 * else, so the images and the text that describes them cannot drift (spec failure 13).
 */

const SCREEN_TITLES: Readonly<Record<string, string>> = {
  shell: "Shell",
  onboarding: "Onboarding",
};

/** `libraryDetail` → `Library detail`, `capturePanel` → `Capture panel`. */
export function screenTitle(id: string): string {
  if (SCREEN_TITLES[id]) return SCREEN_TITLES[id];
  const words = id.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** GitHub's heading anchor for a title. */
function anchor(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9 -]/g, "")
    .replace(/ /g, "-");
}

/** Cell text for an HTML table: escaped, with `inline code` turned into <code>. */
function cell(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, " ")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}

/** The image fills its cell and a click opens the full file. */
function image(file: string | undefined): string {
  if (!file) return "—";
  const href = file.split("\\").join("/");
  return `<a href="${href}"><img src="${href}" width="100%"></a>`;
}

/** Column widths the owner asked for; GitHub keeps `width` on table, th and img. */
const COLUMNS: readonly (readonly [string, number])[] = [
  ["State", 10],
  ["How reached", 30],
  ["Window", 30],
  ["Crop", 30],
];

function tableRow(state: string, how: string, window: string, crop: string): string {
  return `<tr><td><code>${state}</code></td><td>${cell(how)}</td><td>${window}</td><td>${crop}</td></tr>`;
}

function stateTable(rows: readonly string[]): string[] {
  return [
    '<table width="100%">',
    `<thead><tr>${COLUMNS.map(([name, pct]) => `<th width="${pct}%">${name}</th>`).join("")}</tr></thead>`,
    "<tbody>",
    ...rows,
    "</tbody>",
    "</table>",
  ];
}

function stateRows(
  screen: ManifestScreen,
  areaId: string,
  states: readonly ManifestState[],
): string[] {
  const area = screen.areas.find((a) => a.id === areaId)!;
  const rows: string[] = [];
  for (const mapState of area.states) {
    const claim = `${areaId}:${mapState}`;
    const claiming = states.filter((s) => s.demonstrates.includes(claim));
    for (const s of claiming) {
      const crop = s.areasFound.find((f) => f.id === areaId)?.file;
      const gate =
        s.gates.length > 0
          ? ` Gate: ${s.gates.map((g) => `${g.label} = ${g.side}`).join(", ")}.`
          : "";
      if (s.status === "shot" && s.unpublished) {
        rows.push(tableRow(mapState, s.how + gate, cell(`Not published: ${s.unpublished}`), "—"));
      } else if (s.status === "shot") {
        rows.push(tableRow(mapState, s.how + gate, image(s.window?.file), image(crop)));
      } else {
        const what = s.status === "failed" ? "Failed this run" : "Not captured this run";
        rows.push(tableRow(mapState, `${what}: ${s.reason ?? "no reason recorded"}.`, "—", "—"));
      }
    }
    if (claiming.length > 0) continue;
    const reason = screen.notCapturable[claim];
    if (reason) rows.push(tableRow(mapState, `Not capturable: ${reason}.`, "—", "—"));
    else if (screen.notRun.includes(claim))
      rows.push(tableRow(mapState, "Not in this run.", "—", "—"));
    else rows.push(tableRow(mapState, "Not in the catalog yet.", "—", "—"));
  }
  return rows;
}

/** `## Title` in the single README, `# Title` on a screen's own page. */
function screenSection(
  screen: ManifestScreen,
  states: readonly ManifestState[],
  level: 1 | 2,
): string[] {
  const h = "#".repeat(level);
  const sub = "#".repeat(level + 1);
  const out = [`${h} ${screenTitle(screen.id)}`, ""];
  const where =
    screen.kind === "window"
      ? `Window \`${screen.where}\``
      : screen.kind === "route"
        ? `Route \`${screen.where}\``
        : screen.where;
  const size = screen.windowSize
    ? ` Window ${screen.windowSize}.`
    : " Shown at the size main gives it.";
  out.push(
    `${where}.${size}${screen.complete ? "" : " Not every state of this screen was in this run."}`,
    "",
  );
  for (const area of screen.areas) {
    const gates =
      area.gates.length > 0 ? ` — gated by ${area.gates.map((g) => `\`${g}\``).join(", ")}` : "";
    out.push(`${sub} ${area.id}${gates}`, "");
    out.push(...stateTable(stateRows(screen, area.id, states)), "");
    const other = screen.oneSided[area.id];
    if (other) out.push(`Other side of the gate: ${other}.`, "");
  }
  return out;
}

/** Screens that have something to show, in manifest order. */
function shownScreens(manifest: Manifest): ManifestScreen[] {
  return manifest.screens.filter((s) => s.areas.length > 0);
}

function statesOf(manifest: Manifest, screenId: string): ManifestState[] {
  return manifest.states.filter((s) => s.screen === screenId);
}

/** The header paragraph: version, date, SHA, runner label, scale, flags. */
function headerLines(manifest: Manifest): string[] {
  const { app, runner } = manifest;
  const date = manifest.generatedAt.slice(0, 10);
  const flags = manifest.profiles
    .filter((p) => Object.keys(p.flags).length > 0)
    .map(
      (p) =>
        `${Object.entries(p.flags)
          .map(([k, v]) => `${k}=${v}`)
          .join(", ")} (profile \`${p.name}\`)`,
    );
  const scale = runner.scaleFactor !== null ? `scale ${runner.scaleFactor}x` : "scale unknown";
  const lines: string[] = [
    `Generated ${date} from kaipu-record ${app.version} @ ${app.shortSha}${app.dirty ? " (uncommitted changes)" : ""}, ` +
      `on ${runner.label} (macOS ${runner.macos}, ${scale}). Dark, English. ` +
      "Fixtures are neutral generated data. " +
      (flags.length > 0
        ? `Flag overrides used: ${flags.join("; ")}, for the states that say so. `
        : "") +
      "Not a design source: this is what the app renders.",
    "",
  ];
  if (manifest.options.only)
    lines.push(`Partial run: only states matching \`${manifest.options.only}\`.`, "");
  lines.push(`${countsText(manifest)}.`, "");
  if (manifest.failures.length > 0) {
    lines.push("**This run failed:**", "", ...manifest.failures.map((f) => `- ${f}`), "");
  }
  return lines;
}

function counts(manifest: Manifest): { shot: number; skipped: number; failed: number } {
  return {
    shot: manifest.states.filter((s) => s.status === "shot").length,
    skipped: manifest.states.filter((s) => s.status === "notCapturable").length,
    failed: manifest.states.filter((s) => s.status === "failed").length,
  };
}

function countsText(manifest: Manifest): string {
  const { shot, skipped, failed } = counts(manifest);
  return `${shot} states shot, ${skipped} not capturable this run, ${failed} failed`;
}

export const UNCAPTURED_HEADING = "What this run could not capture — and what to do";

interface Uncaptured {
  readonly id: string;
  readonly reason: string;
}

/** Everything this run has no image for, grouped by kind. Built from the manifest alone. */
export function uncapturedByKind(manifest: Manifest): Map<NotCapturableKind, Uncaptured[]> {
  const groups = new Map<NotCapturableKind, Uncaptured[]>(NOT_CAPTURABLE_KINDS.map((k) => [k, []]));
  const add = (kind: NotCapturableKind, id: string, reason: string): void => {
    groups.get(kind)?.push({ id, reason });
  };
  for (const screen of manifest.screens) {
    for (const [claim, why] of Object.entries(screen.notCapturable)) {
      add(screen.notCapturableKinds?.[claim] ?? "needsSetup", claim, why);
    }
  }
  for (const s of manifest.states) {
    if (s.status === "shot" && s.unpublished) add("unpublished", s.id, s.unpublished);
    else if (s.status === "failed") add("runFailure", s.id, s.reason ?? "no reason recorded");
    else if (s.status === "notCapturable") {
      add(s.reasonKind ?? "permission", s.id, s.reason ?? "no reason recorded");
    }
  }
  for (const n of manifest.nativeNotCapturable) add("native", n.title, n.reason);
  return groups;
}

/** Entries to act on: everything except the constant native list. */
export function uncapturedCount(manifest: Manifest): number {
  let total = 0;
  for (const [kind, items] of uncapturedByKind(manifest)) {
    if (kind !== "native") total += items.length;
  }
  return total;
}

function uncapturedSection(manifest: Manifest): string[] {
  const lines = [`## ${UNCAPTURED_HEADING}`, ""];
  for (const [kind, items] of uncapturedByKind(manifest)) {
    if (items.length === 0) continue;
    const { title, next } = INSTRUCTIONS[kind];
    const perState = next.includes("{id}");
    lines.push(`### ${title} (${items.length})`, "");
    if (!perState) lines.push(`**Next:** ${next}`, "");
    for (const item of items) {
      const reason = item.reason.replace(/\.$/, "");
      lines.push(
        perState
          ? `- \`${item.id}\` — ${reason}. **Next:** ${next.replace("{id}", item.id)}`
          : `- \`${item.id}\` — ${reason}.`,
      );
    }
    lines.push("");
  }
  return lines;
}

function tailLines(manifest: Manifest): string[] {
  const lines = uncapturedSection(manifest);
  if (manifest.knownVariable.length > 0) {
    lines.push(
      "## Known-variable areas",
      "",
      "These crops change between two runs on the same commit, for a reason the app owns, so " +
        "`--twice` does not report them:",
      "",
      ...manifest.knownVariable.map(
        (k) =>
          `- ${k.areas.map((a) => `\`${a}\``).join(", ")}` +
          (k.states ? ` (in ${k.states.map((s) => `\`${s}\``).join(", ")})` : "") +
          ` — ${k.reason}.`,
      ),
      "",
    );
  }
  return lines;
}

const finish = (lines: readonly string[]): string => `${lines.join("\n").trimEnd()}\n`;

/** The whole run on one page: what a local run writes. */
export function renderReadme(manifest: Manifest): string {
  const screens = shownScreens(manifest);
  const titles = [...screens.map((s) => screenTitle(s.id)), UNCAPTURED_HEADING];
  const lines = [
    "# Kaipu Record — UI state catalog",
    "",
    ...headerLines(manifest),
    "## Contents",
    "",
    titles.map((t) => `[${t}](#${anchor(t)})`).join(" · "),
    "",
  ];
  for (const screen of screens) {
    lines.push(...screenSection(screen, statesOf(manifest, screen.id), 2));
  }
  lines.push(...tailLines(manifest));
  return finish(lines);
}

/** File name of a screen's page inside a version folder. */
export function screenPageName(screenId: string): string {
  return `${screenId}.md`;
}

/** `versions/<version>/README.md`: that version's header and the links to its screen pages. */
export function renderVersionIndex(manifest: Manifest): string {
  const links = shownScreens(manifest).map(
    (s) => `- [${screenTitle(s.id)}](${screenPageName(s.id)})`,
  );
  return finish([
    `# Kaipu Record ${manifest.app.version} — UI state catalog`,
    "",
    "[← All versions](../../README.md)",
    "",
    ...headerLines(manifest),
    "## Contents",
    "",
    ...links,
    `- [${UNCAPTURED_HEADING}](#${anchor(UNCAPTURED_HEADING)})`,
    ...(manifest.knownVariable.length > 0
      ? ["- [Known-variable areas](#known-variable-areas)"]
      : []),
    "",
    ...tailLines(manifest),
  ]);
}

/** `versions/<version>/<screen>.md`: one screen, with a way back. */
export function renderScreenPage(manifest: Manifest, screenId: string): string {
  const screen = manifest.screens.find((s) => s.id === screenId);
  if (!screen) throw new Error(`no screen ${screenId} in the manifest`);
  return finish([
    `[← Kaipu Record ${manifest.app.version}](README.md)`,
    "",
    ...screenSection(screen, statesOf(manifest, screenId), 1),
  ]);
}

/** Every page of one version folder, by file name; the screen pages are only those with areas. */
export function renderVersionPages(manifest: Manifest): Record<string, string> {
  const pages: Record<string, string> = { "README.md": renderVersionIndex(manifest) };
  for (const screen of shownScreens(manifest)) {
    pages[screenPageName(screen.id)] = renderScreenPage(manifest, screen.id);
  }
  return pages;
}

/** Newest first: by app version, then by date, then by SHA so the order never flaps. */
export function newestFirst(manifests: readonly Manifest[]): Manifest[] {
  return [...manifests].sort(
    (a, b) =>
      compareVersions(b.app.version, a.app.version) ||
      b.generatedAt.localeCompare(a.generatedAt) ||
      a.app.shortSha.localeCompare(b.app.shortSha),
  );
}

/** The repository's root `README.md`: one row per version, newest first. */
export function renderRootIndex(manifests: readonly Manifest[]): string {
  const rows = newestFirst(manifests).map((m) => {
    const { shot, skipped } = counts(m);
    const v = m.app.version;
    return `| [${v}](versions/${v}/README.md) | ${m.generatedAt.slice(0, 10)} | \`${m.app.shortSha}\` | ${shot} shot, ${skipped} not capturable | [${uncapturedCount(m)} to act on](versions/${v}/README.md#${anchor(UNCAPTURED_HEADING)}) |`;
  });
  return finish([
    "# Kaipu Record — UI state catalog",
    "",
    "One folder per app version, newest first. Not a design source: this is what the app renders.",
    "",
    "| Version | Date | SHA | States | Could not capture |",
    "| --- | --- | --- | --- | --- |",
    ...rows,
  ]);
}
