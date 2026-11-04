import type { Manifest, ManifestScreen, ManifestState } from "./manifest";

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

function cell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function image(file: string | undefined): string {
  return file ? `![](${file.split("\\").join("/")})` : "—";
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
        rows.push(
          `| \`${mapState}\` | ${cell(s.how + gate)} | ${cell(`Not published: ${s.unpublished}`)} | — |`,
        );
      } else if (s.status === "shot") {
        rows.push(
          `| \`${mapState}\` | ${cell(s.how + gate)} | ${image(s.window?.file)} | ${image(crop)} |`,
        );
      } else {
        const what = s.status === "failed" ? "Failed this run" : "Not captured this run";
        rows.push(
          `| \`${mapState}\` | ${cell(`${what}: ${s.reason ?? "no reason recorded"}.`)} | — | — |`,
        );
      }
    }
    if (claiming.length > 0) continue;
    const reason = screen.notCapturable[claim];
    if (reason) rows.push(`| \`${mapState}\` | ${cell(`Not capturable: ${reason}.`)} | — | — |`);
    else if (screen.notRun.includes(claim))
      rows.push(`| \`${mapState}\` | Not in this run. | — | — |`);
    else rows.push(`| \`${mapState}\` | Not in the catalog yet. | — | — |`);
  }
  return rows;
}

function screenSection(screen: ManifestScreen, states: readonly ManifestState[]): string[] {
  const out = [`## ${screenTitle(screen.id)}`, ""];
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
    out.push(`### ${area.id}${gates}`, "");
    out.push("| State | How reached | Window | Crop |", "| --- | --- | --- | --- |");
    out.push(...stateRows(screen, area.id, states), "");
    const other = screen.oneSided[area.id];
    if (other) out.push(`Other side of the gate: ${other}.`, "");
  }
  return out;
}

export function renderReadme(manifest: Manifest): string {
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
    "# Kaipu Record — UI state catalog",
    "",
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
  const shot = manifest.states.filter((s) => s.status === "shot").length;
  const skipped = manifest.states.filter((s) => s.status === "notCapturable").length;
  const failed = manifest.states.filter((s) => s.status === "failed").length;
  lines.push(`${shot} states shot, ${skipped} not capturable this run, ${failed} failed.`, "");
  if (manifest.failures.length > 0) {
    lines.push("**This run failed:**", "", ...manifest.failures.map((f) => `- ${f}`), "");
  }

  const screens = manifest.screens.filter((s) => s.areas.length > 0);
  const titles = [...screens.map((s) => screenTitle(s.id)), "Not capturable"];
  lines.push("## Contents", "", titles.map((t) => `[${t}](#${anchor(t)})`).join(" · "), "");

  for (const screen of screens) {
    lines.push(
      ...screenSection(
        screen,
        manifest.states.filter((s) => s.screen === screen.id),
      ),
    );
  }

  lines.push(
    "## Not capturable",
    "",
    "These flows exist and have no image, because macOS draws them, not the app's windows:",
    "",
    ...manifest.nativeNotCapturable.map((n) => `- **${n.title}** — ${n.reason}.`),
    "",
  );
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
  return `${lines.join("\n").trimEnd()}\n`;
}
