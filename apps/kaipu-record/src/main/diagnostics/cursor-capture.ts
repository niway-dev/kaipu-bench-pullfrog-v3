import { app, BrowserWindow, desktopCapturer, session, systemPreferences } from "electron";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cursorCapturePage } from "./cursor-capture-page";

export const CURSOR_CAPTURE_DIAGNOSTIC_FLAG = "--cursor-capture-diagnostic";

/** Only a source enumerated by main can be selected by this experiment. */
export function diagnosticSourceId(url: string, ids: string[]): string | undefined {
  try {
    const id = decodeURIComponent(new URL(url).hash.slice(1));
    return ids.includes(id) ? id : undefined;
  } catch {
    return undefined;
  }
}

export async function openCursorCaptureDiagnostic(): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "kaipu-cursor-diagnostic-"));
  const page = join(directory, "index.html");
  // Non-persistent session: never replace the normal recorder's permission/selection policy.
  const diagnosticSession = session.fromPartition(`cursor-diagnostic-${Date.now()}`);
  const window = new BrowserWindow({
    width: 1000,
    height: 850,
    title: "Cursor capture diagnostic",
    webPreferences: {
      session: diagnosticSession,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event) => event.preventDefault());
  window.on("closed", () => {
    diagnosticSession.setDisplayMediaRequestHandler(null);
    void rm(directory, { recursive: true, force: true });
    app.quit();
  });
  try {
    const screenPermissionBeforeEnumeration =
      process.platform === "darwin" ? systemPreferences.getMediaAccessStatus("screen") : "unknown";
    let sourceEnumerationError: string | undefined;
    const sources = await desktopCapturer
      .getSources({
        types: ["screen", "window"],
        thumbnailSize: { width: 0, height: 0 },
      })
      .catch((error: unknown) => {
        sourceEnumerationError = error instanceof Error ? error.message : String(error);
        return [];
      });
    diagnosticSession.setDisplayMediaRequestHandler(
      (request, callback) => {
        const id = diagnosticSourceId(
          request.frame?.url ?? "",
          sources.map((source) => source.id),
        );
        const source = sources.find((source) => source.id === id);
        if (request.frame !== window.webContents.mainFrame || !request.videoRequested || !source) {
          callback({});
          return;
        }
        callback({
          video: source,
          ...(request.audioRequested ? { audio: "loopback" as const } : {}),
        });
      },
      { useSystemPicker: false },
    );
    await writeFile(
      page,
      cursorCapturePage(
        {
          schemaVersion: 1,
          screenPermissionBeforeEnumeration,
          sourceEnumerationError,
          appVersion: app.getVersion(),
          packaged: app.isPackaged,
          platform: process.platform,
          architecture: process.arch,
          versions: process.versions,
          screenPermissionAfterEnumeration:
            process.platform === "darwin"
              ? systemPreferences.getMediaAccessStatus("screen")
              : "unknown",
          warning:
            "Settings are diagnostic data, not proof that cursor pixels are excluded or system audio is audible.",
        },
        sources.map(({ id, name }) => ({ id, name })),
      ),
    );
    await window.loadFile(page);
  } catch (error) {
    window.destroy();
    throw error;
  }
}
