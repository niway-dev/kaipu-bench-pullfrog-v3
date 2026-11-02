import { stat } from "node:fs/promises";
import { join } from "node:path";
import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { createMainTranslator } from "@kaipu/i18n/main";
import { IPC_CHANNELS } from "@shared/types";
import type {
  LocationCheck,
  MoveItemRef,
  MoveItemsResult,
  WorkspaceBusy,
  WorkspaceAddResult,
  WorkspaceCreateResult,
  WorkspaceEditResult,
  WorkspacePrepareResult,
  WorkspaceRemoveResult,
  WorkspacesState,
  WorkspaceStamp,
  WorkspaceSwitchResult,
  WorkspaceView,
} from "@shared/types/workspaces";
import { getAppSettings } from "../infrastructure/settings-store";
import { dragLedger } from "../library/drag-ledger";
import { LibraryVault } from "../library/library-vault";
import { loadDeviceId } from "../library/tag-repository";
import { vaultActivity } from "../library/vault-activity";
import { refusalOfError, runMoveGroup } from "./move-group";
import { healMoves, moveItem, type MoveSide } from "./move-item";
import { uuidv7 } from "../library/tag-repository";
import { defaultVaultDirectory, forgetCachedPreferences } from "../library/vault-location";
import { StaleWorkspaceError, WorkspaceGate } from "./gate";
import { WorkspaceRegistry, type WorkspaceEntry } from "./registry";
import { PrepareRequests } from "./prepare-windows";
import { switchWorkspace } from "./switch-transaction";
import { APP_TITLE, composeWindowTitle } from "./window-title";
import { toWorkspaceView } from "./workspace-view";

/**
 * Workspaces in the main process (ADR 0032): the registry, the gate every item-scoped call
 * runs through, and the switch transaction with its IPC. `initWorkspaces()` runs once in
 * `app.whenReady`, before any window exists, so the preload can read the stamp at load.
 */

/** How long a window may take to prepare (an unsaved editor waits on the user's answer). */
const PREPARE_TIMEOUT_MS = 120_000;

let registry: WorkspaceRegistry | null = null;
let gate: WorkspaceGate | null = null;

export interface WorkspaceHost {
  /** What is writing into the active workspace (the switch lock). A move is added here. */
  busy(): "recording" | "exporting" | null;
  /** Dismiss the capture toast and drop the retained quiet-capture bytes. */
  dropPendingCaptures(): void;
  /** Re-list every window's library (`library:changed`). */
  broadcastLibraryChanged(): void;
}

let host: WorkspaceHost | null = null;

/** The group move running now, if any: it holds the switch lock from its first item to its last. */
let moveRun: { stop: boolean } | null = null;

/** What locks the switcher right now. */
function busyNow(): WorkspaceBusy | null {
  return host?.busy() ?? (moveRun ? "moving" : null);
}

function requireRegistry(): WorkspaceRegistry {
  if (!registry) throw new Error("workspaces: not initialized");
  return registry;
}

export function workspaceGate(): WorkspaceGate {
  if (!gate) throw new Error("workspaces: not initialized");
  return gate;
}

export async function initWorkspaces(): Promise<void> {
  registry = await WorkspaceRegistry.open({
    preferencesFile: join(app.getPath("userData"), "preferences.json"),
    defaultDirectory: defaultVaultDirectory(),
    newId: () => uuidv7(),
    onPreferencesWritten: forgetCachedPreferences,
  });
  gate = new WorkspaceGate(registry.active().id);
  // The preload reads the stamp once, synchronously, before the page's scripts run, so it
  // is answered from here, before any window can exist.
  ipcMain.on(IPC_CHANNELS.workspacesStampSync, (event) => {
    event.returnValue = workspaceGate().stamp satisfies WorkspaceStamp;
  });
  if (registry.readOnly) {
    console.warn("[workspaces] preferences.json does not parse: running read-only until restart");
  }
  // A move the app died in is finished before anything lists either workspace.
  await healPendingMoves();
}

function movesJournalDir(): string {
  return join(app.getPath("userData"), "workspace-moves");
}

/** The folder a workspace of a move lives in now, or null while it is not connected. */
async function resolveMoveSide(side: MoveSide): Promise<string | null> {
  const reg = requireRegistry();
  if (!reg.get(side.workspaceId)) return null;
  const { availability, id } = await reg.availability(side.workspaceId);
  if (availability.state !== "available") return null;
  return reg.get(id)?.path ?? null;
}

/**
 * Finish every move the app died in (ADR 0033, decision 6). At startup and before each group.
 * An entry whose workspace is not connected waits for a later run.
 */
async function healPendingMoves(): Promise<void> {
  try {
    const report = await healMoves({ journalDir: movesJournalDir(), resolve: resolveMoveSide });
    if (report.healed > 0) host?.broadcastLibraryChanged();
    if (report.quarantined.length > 0) {
      console.error(
        `[workspaces] ${report.quarantined.length} interrupted move(s) need a look; journal kept in`,
        movesJournalDir(),
      );
    }
  } catch (error) {
    console.error("[workspaces] healing interrupted moves failed", error);
  }
}

let deviceId: Promise<string> | null = null;

/**
 * `workspaces:move-items`: a group of single moves from the active workspace to `targetId`,
 * one after another (ADR 0033, decision 14). Runs inside the workspace gate, so the window's
 * stamp must still be current, and holds the switch lock from the first item to the last.
 */
async function moveItems(
  sender: Electron.WebContents,
  stamp: unknown,
  input: unknown,
): Promise<MoveItemsResult> {
  const reg = requireRegistry();
  const { items: rawItems, targetId } = (input ?? {}) as { items?: unknown; targetId?: unknown };
  const items: MoveItemRef[] = Array.isArray(rawItems)
    ? rawItems.filter(
        (item): item is MoveItemRef =>
          !!item &&
          typeof (item as MoveItemRef).id === "string" &&
          typeof (item as MoveItemRef).assetId === "string",
      )
    : [];
  const target = typeof targetId === "string" ? targetId : "";
  const refuseAll = (reason: MoveItemsResult["failed"][number]["reason"]): MoveItemsResult => ({
    targetId: target,
    moved: [],
    failed: items.map((item) => ({ id: item.id, reason })),
    skipped: [],
  });
  if (moveRun) return refuseAll("busy");
  if (!workspaceGate().isCurrent(stamp)) return refuseAll("stale");
  if (vaultActivity.inMaintenance) return refuseAll("maintenance");

  const run = { stop: false };
  moveRun = run;
  void broadcastState();
  try {
    return await workspaceGate().run(stamp, () =>
      vaultActivity.run("library", async () => {
        await healPendingMoves();
        const source = reg.active();
        // A rejected read is not kept: the next group asks again.
        deviceId ??= loadDeviceId(app.getPath("userData")).catch((error: unknown) => {
          deviceId = null;
          throw error;
        });
        const device = await deviceId;
        const result = await runMoveGroup(
          items,
          async (item) => {
            // Checked per item, when its turn comes (decision 14).
            if (host?.busy()) return { ok: false, reason: "busy" };
            if (target === source.id) return { ok: false, reason: "same-workspace" };
            const entry = reg.get(target);
            if (!entry) return { ok: false, reason: "target-unavailable" };
            const directory = await resolveMoveSide({ workspaceId: target, directory: "" });
            if (directory === null) return { ok: false, reason: "target-unavailable" };
            const outcome = await moveItem(
              {
                source: { workspaceId: source.id, directory: source.path },
                target: { workspaceId: target, directory },
                id: item.id,
                expectedAssetId: item.assetId,
              },
              { journalDir: movesJournalDir(), deviceId: () => device, dragLedger },
            );
            return outcome.ok
              ? { ok: true, newId: outcome.newId }
              : { ok: false, reason: outcome.reason };
          },
          {
            targetId: target,
            stopped: () => run.stop,
            onProgress: (progress) => {
              if (!sender.isDestroyed()) {
                sender.send(IPC_CHANNELS.workspacesMoveProgress, progress);
              }
            },
          },
        );
        return result;
      }),
    );
  } catch (error) {
    console.error("[workspaces] group move refused", error);
    return refuseAll(refusalOfError(error));
  } finally {
    moveRun = null;
    host?.broadcastLibraryChanged();
    void broadcastState();
  }
}

export function activeWorkspace(): WorkspaceEntry {
  return requireRegistry().active();
}

/** Owns the cloud entries without a workspace id (spec decision 3): only it lists them. */
export function ownsLegacyCloud(): boolean {
  const reg = requireRegistry();
  return reg.active().id === reg.state.legacyCloudOwnerId;
}

/** The workspace's name for a label, only once a second one exists (window title, tray). */
function prefixName(): string | null {
  const reg = requireRegistry();
  return reg.entries().length > 1 ? reg.active().name : null;
}

/** The capture target was unplugged or replaced: refuse, never save anywhere else. */
export class WorkspaceNotConnectedError extends Error {
  constructor(readonly workspaceName: string) {
    const t = createMainTranslator(getAppSettings().locale);
    super(t("workspaces.notConnectedError", { name: workspaceName }));
    this.name = "WorkspaceNotConnectedError";
  }
}

/**
 * The active workspace, checked to be connected, for a capture that is about to start.
 * Throws `WorkspaceNotConnectedError` otherwise; a switch in progress counts as stale.
 */
export async function requireCaptureWorkspace(): Promise<WorkspaceEntry> {
  const reg = requireRegistry();
  if (workspaceGate().switching) throw new StaleWorkspaceError();
  const active = reg.active();
  const { availability, id } = await reg.availability(active.id);
  if (workspaceGate().adopt(active.id, id, reg.active().id)) void broadcastState();
  if (availability.state !== "available") throw new WorkspaceNotConnectedError(active.name);
  return reg.active();
}

/** Every workspace whose folder is reachable, for the startup and quit sweeps. */
export async function availableWorkspacePaths(): Promise<string[]> {
  const reg = requireRegistry();
  const paths: string[] = [];
  // A copy: a probe may update an entry (a pending one adopting its folder's id).
  for (const entry of reg.entries().slice()) {
    const { availability } = await reg.availability(entry.id);
    if (availability.state === "available") paths.push(entry.path);
  }
  return paths;
}

async function listState(): Promise<WorkspacesState> {
  const reg = requireRegistry();
  const views: WorkspaceView[] = [];
  for (const entry of reg.entries().slice()) {
    const { availability, id } = await reg.availability(entry.id);
    // A pending active entry that adopted its folder's id: windows must take the new stamp.
    if (workspaceGate().adopt(entry.id, id, reg.active().id)) void broadcastState();
    const count =
      availability.state === "available"
        ? await new LibraryVault(entry.path).countMedia().catch(() => null)
        : null;
    // Which volume the folder is on: "Move to" says whether a move copies or is instant.
    const device =
      availability.state === "available"
        ? await stat(entry.path).then(
            (info) => String(info.dev),
            () => null,
          )
        : null;
    views.push(toWorkspaceView(reg.get(id) ?? entry, availability, count, device));
  }
  const { activeId, hintDismissedAt } = reg.state;
  return {
    activeId,
    generation: workspaceGate().stamp.generation,
    hintDismissed: hintDismissedAt !== undefined,
    busy: busyNow(),
    readOnly: reg.readOnly,
    workspaces: views,
  };
}

function sendToAll(channel: string, payload?: unknown): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send(channel, payload);
  }
}

async function broadcastState(): Promise<void> {
  sendToAll(IPC_CHANNELS.workspacesChanged, await listState());
}

/** The main window's title follows the active workspace and the page's own title. */
export function attachWindowTitle(window: BrowserWindow): void {
  let pageTitle = APP_TITLE;
  const apply = (): void => {
    if (!window.isDestroyed()) window.setTitle(composeWindowTitle(pageTitle, prefixName()));
  };
  window.on("page-title-updated", (event, title) => {
    event.preventDefault();
    pageTitle = title;
    apply();
  });
  titleAppliers.add(apply);
  window.on("closed", () => titleAppliers.delete(apply));
  apply();
}

const titleAppliers = new Set<() => void>();

function refreshTitles(): void {
  for (const apply of titleAppliers) apply();
}

const prepareRequests = new PrepareRequests(IPC_CHANNELS.workspacesPrepare, PREPARE_TIMEOUT_MS);

async function runSwitch(id: string): Promise<WorkspaceSwitchResult> {
  const reg = requireRegistry();
  const result = await switchWorkspace(
    {
      gate: workspaceGate(),
      activeId: () => reg.active().id,
      isKnown: (candidate) => reg.get(candidate) !== undefined,
      readOnly: () => reg.readOnly,
      availability: (candidate) => reg.availability(candidate),
      busy: busyNow,
      prepareWindows: () => prepareRequests.prepare(BrowserWindow.getAllWindows()),
      abortWindows: () => sendToAll(IPC_CHANNELS.workspacesPrepareAbort),
      dropPendingCaptures: () => host?.dropPendingCaptures(),
      persistActive: (target) => reg.setActive(target),
      afterCommit: () => {
        refreshTitles();
        void broadcastState();
        host?.broadcastLibraryChanged();
      },
    },
    id,
  );
  // A refused switch still re-lists, so a LOCKED or NOT CONNECTED menu shows why.
  if (!result.ok) void broadcastState();
  return result;
}

/** Folder picker for Add workspace; initializes or adopts the folder, then switches to it. */
async function addWorkspace(
  sender: Electron.WebContents,
  request: { activate?: unknown } = {},
): Promise<WorkspaceAddResult> {
  const reg = requireRegistry();
  if (reg.readOnly) return { ok: false, reason: "read-only" };
  const window = BrowserWindow.fromWebContents(sender);
  const t = createMainTranslator(getAppSettings().locale);
  const options: Electron.OpenDialogOptions = {
    title: t("dialogs.addWorkspace"),
    buttonLabel: t("dialogs.addWorkspaceButton"),
    properties: ["openDirectory", "createDirectory"],
  };
  const picked = window
    ? await dialog.showOpenDialog(window, options)
    : await dialog.showOpenDialog(options);
  const chosen = picked.filePaths[0];
  if (picked.canceled || !chosen) return { ok: false, reason: "cancelled" };

  const outcome = await reg.add(chosen);
  if (!outcome.ok) {
    if (outcome.reason !== "read-only") {
      const message = { type: "error" as const, message: t("dialogs.folderUnusable") };
      const detail = t(
        outcome.reason === "unreadable"
          ? "dialogs.workspaceUnreadableDetail"
          : "dialogs.folderUnusableDetail",
      );
      await (window
        ? dialog.showMessageBox(window, { ...message, detail })
        : dialog.showMessageBox({ ...message, detail }));
    }
    return { ok: false, reason: outcome.reason === "read-only" ? "read-only" : "not-writable" };
  }
  // Adding a workspace answers the "New: workspaces" hint too.
  await reg.dismissHint();
  const { availability } = await reg.availability(outcome.entry.id);
  // Then make it the active one, through the same transaction as any other switch. A
  // refusal (a recording running) leaves it registered and inactive. "Move to ▸ New
  // workspace…" keeps it inactive: the item goes there, the user stays here.
  if (request.activate !== false) await runSwitch(outcome.entry.id);
  await broadcastState();
  return { ok: true, workspace: toWorkspaceView(outcome.entry, availability, null) };
}

/**
 * New workspace: a new folder next to the Default workspace's, only Kaipu's files in it, then
 * the same switch as any other. A refused switch (a recording running) leaves it registered.
 */
async function createWorkspace(input: unknown): Promise<WorkspaceCreateResult> {
  const reg = requireRegistry();
  const { name, color, activate } = (input ?? {}) as {
    name?: unknown;
    color?: unknown;
    activate?: unknown;
  };
  if (typeof name !== "string") return { ok: false, reason: "invalid-name" };
  if (typeof color !== "string") return { ok: false, reason: "invalid-color" };
  const outcome = await reg.create({ name, color });
  if (!outcome.ok) return outcome;
  await reg.dismissHint();
  const { availability } = await reg.availability(outcome.entry.id);
  // "Move to ▸ New workspace…" creates it inactive: the item goes there, the user stays here.
  const switchResult: WorkspaceSwitchResult =
    activate === false ? { ok: true } : await runSwitch(outcome.entry.id);
  await broadcastState();
  return {
    ok: true,
    workspace: toWorkspaceView(outcome.entry, availability, null),
    switchResult,
  };
}

async function editWorkspace(input: unknown): Promise<WorkspaceEditResult> {
  const reg = requireRegistry();
  const { id, name, color } = (input ?? {}) as { id?: unknown; name?: unknown; color?: unknown };
  if (typeof id !== "string") return { ok: false, reason: "unknown" };
  const outcome = await reg.edit(id, {
    ...(typeof name === "string" ? { name } : {}),
    ...(typeof color === "string" ? { color } : {}),
  });
  if (!outcome.ok) return outcome;
  const { availability } = await reg.availability(outcome.entry.id);
  // The window title shows the active workspace's name, and the tiles show the initials.
  refreshTitles();
  await broadcastState();
  return {
    ok: true,
    workspace: toWorkspaceView(outcome.entry, availability, null),
    savedToFolder: outcome.savedToFolder,
  };
}

export function registerWorkspaceHandlers(deps: WorkspaceHost): void {
  host = deps;
  ipcMain.handle(IPC_CHANNELS.workspacesList, () => listState());
  ipcMain.handle(IPC_CHANNELS.workspacesSwitch, (_event, id: unknown) =>
    typeof id === "string" ? runSwitch(id) : { ok: false, reason: "unknown" },
  );
  ipcMain.handle(IPC_CHANNELS.workspacesAdd, (event, options: unknown) =>
    addWorkspace(event.sender, (options ?? {}) as { activate?: unknown }),
  );
  ipcMain.handle(IPC_CHANNELS.workspacesMoveItems, (event, stamp: unknown, input: unknown) =>
    moveItems(event.sender, stamp, input),
  );
  ipcMain.handle(IPC_CHANNELS.workspacesCancelMove, () => {
    if (moveRun) moveRun.stop = true;
  });
  ipcMain.handle(IPC_CHANNELS.workspacesCreate, (_event, input: unknown) => createWorkspace(input));
  ipcMain.handle(IPC_CHANNELS.workspacesEdit, (_event, input: unknown) => editWorkspace(input));
  ipcMain.handle(
    IPC_CHANNELS.workspacesCheckLocation,
    (_event, name: unknown): Promise<LocationCheck> =>
      typeof name === "string"
        ? requireRegistry().checkNewLocation(name)
        : Promise.resolve({ path: null, state: "parent-missing" }),
  );
  ipcMain.handle(
    IPC_CHANNELS.workspacesRemove,
    async (_event, id: unknown): Promise<WorkspaceRemoveResult> => {
      if (typeof id !== "string") return { ok: false, reason: "unknown" };
      const result = await requireRegistry().remove(id);
      if (result.ok) {
        refreshTitles();
        await broadcastState();
      }
      return result;
    },
  );
  ipcMain.handle(IPC_CHANNELS.workspacesOpenFolder, async (_event, id: unknown) => {
    const entry = typeof id === "string" ? requireRegistry().get(id) : undefined;
    if (!entry) return;
    // shell.openPath never creates the folder: a missing one reports an error string.
    const error = await shell.openPath(entry.path);
    if (error) console.error("failed to open the workspace folder", error);
  });
  ipcMain.handle(IPC_CHANNELS.workspacesDismissHint, async () => {
    await requireRegistry().dismissHint();
    await broadcastState();
  });
  ipcMain.on(IPC_CHANNELS.workspacesPrepareResult, (_event, result: WorkspacePrepareResult) => {
    if (!result || typeof result.requestId !== "number") return;
    prepareRequests.answer(result.requestId, result.ok === true);
  });
}

/** Re-list the switcher in every window (the lock changed: a take started or ended). */
export function notifyWorkspaceBusyChanged(): void {
  if (registry && gate) void broadcastState();
}
