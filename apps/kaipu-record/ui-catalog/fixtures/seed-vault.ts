import { copyFile, mkdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { FIXTURE_FILES, FIXTURES_DIR, type RecordingCut } from "./make-fixtures";

/**
 * The neutral workspace every catalog profile opens (spec "Fixtures"): six recordings cut
 * from the countdown, three screenshots, a GIF, three tags, one saved edit session and one
 * recording with a webcam track. Names are generic on purpose: images leave the machine,
 * and a real workspace, person or product name in a fixture would leak with them.
 *
 * `createdAt` is the run's start minus a fixed offset, so "2 hours ago" reads the same in
 * every run (spec failure 10). Asset ids are fixed so a catalog state can navigate to an
 * item before anything is listed.
 */

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export const WORKSPACE_NAME = "Demo workspace";
export const WORKSPACE_ID = "ui-catalog-demo-workspace";
const DEVICE_ID = "ui-catalog";

/** Fixed ids the catalog navigates by (`/library/:assetId`, `/editor/video/:assetId`). */
export const ASSETS = {
  walkthrough: "c0a1a10c-0000-4000-8000-000000000001",
  teamNotes: "c0a1a10c-0000-4000-8000-000000000002",
  releaseDemo: "c0a1a10c-0000-4000-8000-000000000003",
  onboardingFlow: "c0a1a10c-0000-4000-8000-000000000004",
  bugReport: "c0a1a10c-0000-4000-8000-000000000005",
  weeklySync: "c0a1a10c-0000-4000-8000-000000000006",
  cursorDemo: "c0a1a10c-0000-4000-8000-000000000007",
  lightCopy: "c0a1a10c-0000-4000-8000-000000000008",
  settingsShot: "c0a1a10c-0000-4000-8000-000000000101",
  dashboardShot: "c0a1a10c-0000-4000-8000-000000000102",
  dialogShot: "c0a1a10c-0000-4000-8000-000000000103",
  loopGif: "c0a1a10c-0000-4000-8000-000000000201",
} as const;

/**
 * The second workspace a state creates (`workspaces.create`). Main puts its folder next to the
 * default one, which is a throwaway folder in the system temp dir, so the new folder lands
 * in the temp dir itself and outlives the run: the runner removes it (`run.ts`).
 */
export const SECOND_WORKSPACE = {
  name: "Client work",
  folder: "Kaipu Record — Client work",
} as const;

/**
 * The vault item ids (a bare file stem) the catalog passes to preload methods that take one
 * (`markOpenedInEditor`, `copyScreenshotById`).
 */
export const ITEM_IDS = {
  settingsShot: "Settings page",
  dialogShot: "Error dialog",
  walkthrough: "Walkthrough 1",
  teamNotes: "Team notes",
  bugReport: "Bug report",
  weeklySync: "Weekly sync",
  onboardingFlow: "Onboarding flow",
  releaseDemo: "Release demo",
} as const;

const TAGS = [
  { id: "c0a1a10c-0000-4000-8000-0000000000a1", name: "Demo", color: "lagoon" },
  { id: "c0a1a10c-0000-4000-8000-0000000000a2", name: "Internal", color: "amber" },
  { id: "c0a1a10c-0000-4000-8000-0000000000a3", name: "Release", color: "iris" },
] as const;
type TagName = (typeof TAGS)[number]["name"];

interface RecordingFixture {
  stem: string;
  assetId: string;
  title: string;
  cut: RecordingCut;
  ago: number;
  tags?: TagName[];
  /** A saved edit session (a zoom and a muted range): the "edited" look in the library. */
  edited?: boolean;
  /** A webcam track (ADR 0037): the editor's camera lane has content. */
  webcam?: boolean;
  /** A native cursor track: what a take recorded with `native-cursor-capture` on carries. */
  cursorTrack?: boolean;
  /** An export: the asset it was made from. */
  derivedFrom?: string;
  /** An export: the preset it was made with (the sidecar's `exportPreset`). */
  exportPreset?: string;
}

const RECORDINGS: readonly RecordingFixture[] = [
  {
    stem: "Walkthrough 1",
    assetId: ASSETS.walkthrough,
    title: "Walkthrough 1",
    cut: 12,
    ago: 2 * HOUR,
    tags: ["Demo"],
  },
  {
    stem: "Team notes",
    assetId: ASSETS.teamNotes,
    title: "Team notes",
    cut: 9,
    ago: DAY,
    tags: ["Internal"],
    edited: true,
  },
  {
    stem: "Release demo",
    assetId: ASSETS.releaseDemo,
    title: "Release demo",
    cut: 7,
    ago: 3 * DAY,
    tags: ["Release", "Demo"],
    webcam: true,
  },
  {
    stem: "Onboarding flow",
    assetId: ASSETS.onboardingFlow,
    title: "Onboarding flow",
    cut: 5,
    ago: 5 * DAY,
  },
  { stem: "Bug report", assetId: ASSETS.bugReport, title: "Bug report", cut: 4, ago: 8 * DAY },
  { stem: "Weekly sync", assetId: ASSETS.weeklySync, title: "Weekly sync", cut: 3, ago: 14 * DAY },
  // A copy of “Walkthrough 1”, with its own copy (the GIF): both "copies" panels have content.
  {
    stem: "Walkthrough 1 (light)",
    assetId: ASSETS.lightCopy,
    title: "Walkthrough 1 (light)",
    cut: 12,
    ago: 90 * 60_000,
    derivedFrom: ASSETS.walkthrough,
    exportPreset: "light",
  },
];

/** Seeded only where the cursor flag is on: it stands for a take recorded with it. */
const CURSOR_RECORDING: RecordingFixture = {
  stem: "Cursor demo",
  assetId: ASSETS.cursorDemo,
  title: "Cursor demo",
  cut: 9,
  ago: 30 * 60_000,
  cursorTrack: true,
};

const SCREENSHOTS = [
  {
    stem: "Settings page",
    assetId: ASSETS.settingsShot,
    title: "Settings page",
    file: 0,
    ago: 4 * HOUR,
  },
  {
    stem: "Dashboard draft",
    assetId: ASSETS.dashboardShot,
    title: "Dashboard draft",
    file: 1,
    ago: 2 * DAY,
    tags: ["Internal"] as TagName[],
  },
  {
    stem: "Error dialog",
    assetId: ASSETS.dialogShot,
    title: "Error dialog",
    file: 2,
    ago: 6 * DAY,
  },
] as const;

export interface SeedOptions {
  /** The run's start; every `createdAt` is this minus a fixed offset. */
  now: number;
  /**
   * Which items: `demo` (the full set), `empty` (only the workspace identity), `missing` (no
   * folder at all: the workspace reads as not connected, like an unplugged drive).
   */
  content: "demo" | "empty" | "missing";
  /** Add the native-cursor recording (profiles with the cursor flag on). */
  cursorRecording?: boolean;
  /**
   * Make "Check and fix files" find something: `fixable`, a recording whose file name does
   * not match its title; `attention`, a recording whose record cannot be read.
   */
  reconcile?: "fixable" | "attention";
  fixturesDir?: string;
}

function tagIdsOf(names: readonly TagName[] = []): { tagIds?: string[]; tagNames?: string[] } {
  if (names.length === 0) return {};
  const tags = names.map((name) => TAGS.find((t) => t.name === name)!);
  return { tagIds: tags.map((t) => t.id), tagNames: tags.map((t) => t.name) };
}

async function writeJson(file: string, value: unknown): Promise<void> {
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

/** A cursor that circles the centre of the display, with two clicks: a visible drawn cursor. */
function cursorTrackJson(seconds: number): unknown {
  const t: number[] = [];
  const x: number[] = [];
  const y: number[] = [];
  for (let ms = 0; ms <= seconds * 1000; ms += 50) {
    const angle = (ms / 4000) * 2 * Math.PI;
    t.push(ms);
    x.push(Number((0.5 + 0.18 * Math.cos(angle)).toFixed(4)));
    y.push(Number((0.5 + 0.22 * Math.sin(angle)).toFixed(4)));
  }
  return {
    version: 1,
    display: { id: "1", width: 1920, height: 1080, scaleFactor: 1 },
    anchor: "exact",
    clicksAvailable: true,
    t,
    x,
    y,
    clicks: [
      { t: 2000, x: 0.68, y: 0.5, button: 0 },
      { t: 6000, x: 0.32, y: 0.5, button: 0 },
    ],
  };
}

async function seedRecording(
  vaultDir: string,
  meta: string,
  fixtures: string,
  now: number,
  item: RecordingFixture,
): Promise<void> {
  const media = path.join(vaultDir, `${item.stem}.mp4`);
  await copyFile(path.join(fixtures, FIXTURE_FILES.cut(item.cut)), media);
  await copyFile(path.join(fixtures, FIXTURE_FILES.thumbnail), path.join(meta, `${item.stem}.jpg`));
  const createdAt = now - item.ago;
  await writeJson(path.join(meta, `${item.stem}.json`), {
    sidecarVersion: 2,
    assetId: item.assetId,
    title: item.title,
    durationSeconds: item.cut,
    createdAt,
    ...(item.derivedFrom ? { derivedFromAssetId: item.derivedFrom } : {}),
    ...(item.exportPreset ? { exportPreset: item.exportPreset } : {}),
    ...tagIdsOf(item.tags),
    capture: {
      mode: "screen",
      cursorPixels: item.cursorTrack ? "excluded" : "embedded",
      width: 1920,
      height: 1080,
      ratio: null,
    },
    ...(item.webcam
      ? {
          webcam: {
            startOffsetMs: 0,
            offsetQuality: "exact",
            width: 640,
            height: 480,
            fps: 30,
          },
        }
      : {}),
  });
  if (item.webcam) {
    await copyFile(
      path.join(fixtures, FIXTURE_FILES.webcam),
      path.join(meta, `${item.stem}.webcam.mp4`),
    );
  }
  if (item.cursorTrack) {
    await writeJson(path.join(meta, `${item.stem}.cursor.json`), cursorTrackJson(item.cut));
  }
  if (item.edited) {
    const savedAt = createdAt + HOUR;
    await writeJson(path.join(meta, `${item.stem}.edit.json`), {
      version: 1,
      scene: {
        items: [{ id: "clip-1", kind: "clip", sourceStart: 0, sourceEnd: item.cut }],
        // A box over the first six seconds and a blur from 1 s to 4 s: the editor's annotation
        // and privacy lanes have content to select.
        overlays: [
          {
            id: "box-1",
            kind: "box",
            start: 0.5,
            end: 6,
            color: "#ff3b6b",
            x: 0.12,
            y: 0.18,
            w: 0.3,
            h: 0.22,
            stroke: 3,
            seed: 7,
          },
        ],
        zoomSegments: [
          {
            id: "zoom-1",
            start: 2,
            end: 5,
            scale: 2,
            smoothing: 70,
            mode: "fixed",
            origin: "manual",
            trigger: null,
            anchor: { x: 0.5, y: 0.5 },
          },
        ],
        redactions: [
          {
            id: "blur-1",
            kind: "blur",
            start: 1,
            end: 4,
            rect: { x: 0.55, y: 0.55, w: 0.3, h: 0.2 },
            intensity: 70,
            style: "gaussian",
          },
        ],
        zoomSensitivity: 55,
        audioMuted: false,
        mutedRanges: [{ id: "mute-1", sourceStart: 6, sourceEnd: 7.5 }],
        webcam: null,
      },
    });
    const source = await stat(media);
    await writeJson(path.join(meta, `${item.stem}.edit.meta.json`), {
      sourceSizeBytes: source.size,
      sourceMtimeMs: source.mtimeMs,
      assetIds: [],
      savedAt,
      exportedSavedAt: null,
    });
  }
}

/** Build the catalog's workspace in `vaultDir` (an empty, throwaway folder). */
export async function seedCatalogVault(vaultDir: string, options: SeedOptions): Promise<void> {
  const { now } = options;
  if (options.content === "missing") {
    await rm(vaultDir, { recursive: true, force: true });
    return;
  }
  const fixtures = options.fixturesDir ?? FIXTURES_DIR;
  const meta = path.join(vaultDir, ".kaipu");
  await mkdir(path.join(meta, "workspace"), { recursive: true });
  // The registry adopts this identity on first launch, so the app calls the folder by this
  // name instead of the folder's random temp name or "Default workspace".
  await writeJson(path.join(meta, "workspace", "identity.json"), {
    version: 1,
    id: WORKSPACE_ID,
    name: WORKSPACE_NAME,
    color: "lagoon",
    initials: "DW",
    createdAt: now - 30 * DAY,
  });
  if (options.content === "empty") return;

  await writeJson(path.join(meta, "tags.json"), {
    version: 1,
    tags: TAGS.map((tag, index) => ({
      id: tag.id,
      name: tag.name,
      slug: tag.name.toLowerCase(),
      color: tag.color,
      createdAt: now - (20 - index) * DAY,
      updatedAt: now - (20 - index) * DAY,
      createdOn: DEVICE_ID,
      updatedOn: DEVICE_ID,
      deletedAt: null,
    })),
  });

  const recordings = options.cursorRecording ? [CURSOR_RECORDING, ...RECORDINGS] : RECORDINGS;
  for (const item of recordings) await seedRecording(vaultDir, meta, fixtures, now, item);

  for (const shot of SCREENSHOTS) {
    await copyFile(
      path.join(fixtures, FIXTURE_FILES.screens[shot.file]),
      path.join(vaultDir, `${shot.stem}.png`),
    );
    await writeJson(path.join(meta, `${shot.stem}.json`), {
      sidecarVersion: 2,
      assetId: shot.assetId,
      title: shot.title,
      createdAt: now - shot.ago,
      ...tagIdsOf("tags" in shot ? shot.tags : []),
    });
  }

  if (options.reconcile === "fixable") {
    await copyFile(path.join(fixtures, FIXTURE_FILES.cut(4)), path.join(vaultDir, "clip-0001.mp4"));
    await writeJson(path.join(meta, "clip-0001.json"), {
      sidecarVersion: 2,
      assetId: "c0a1a10c-0000-4000-8000-000000000301",
      title: "Planning call",
      durationSeconds: 4,
      createdAt: now - 12 * DAY,
    });
  } else if (options.reconcile === "attention") {
    await copyFile(
      path.join(fixtures, FIXTURE_FILES.cut(4)),
      path.join(vaultDir, "Planning call.mp4"),
    );
    await writeFile(path.join(meta, "Planning call.json"), "{ not json\n");
  }

  await copyFile(path.join(fixtures, FIXTURE_FILES.gif), path.join(vaultDir, "Loop preview.gif"));
  await copyFile(path.join(fixtures, FIXTURE_FILES.thumbnail), path.join(meta, "Loop preview.jpg"));
  await writeJson(path.join(meta, "Loop preview.json"), {
    sidecarVersion: 2,
    assetId: ASSETS.loopGif,
    title: "Loop preview",
    durationSeconds: 4,
    createdAt: now - 10 * DAY,
    derivedFromAssetId: ASSETS.lightCopy,
    gifWidth: 480,
    gifHeight: 270,
    gifFps: 10,
  });
}
