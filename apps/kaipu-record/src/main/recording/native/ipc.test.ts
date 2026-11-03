import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NATIVE_CAPTURE_CHANNELS as channels } from "../../../shared/native-capture";
const fake = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => any>(),
  validate: vi.fn(),
  spawn: vi.fn(),
}));
vi.mock("electron", () => ({
  app: { on: vi.fn(), getAppPath: () => "/app" },
  ipcMain: { handle: (name: string, handler: any) => fake.handlers.set(name, handler) },
}));
vi.mock("./session", () => ({
  nativeHelperPath: () => "/helper",
  validateNativeHelper: fake.validate,
  spawnNativeVideo: fake.spawn,
}));
import { registerNativeCaptureTransport } from "./ipc";

describe("native IPC session ownership", () => {
  let contents: EventEmitter & { id: number; mainFrame: object; isDestroyed: () => boolean };
  let reader: {
    next: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
    cancel: ReturnType<typeof vi.fn>;
  };
  const call = (method: keyof typeof channels, sender = contents) =>
    fake.handlers.get(channels[method])!(
      { sender, senderFrame: sender.mainFrame },
      { displayId: 3, width: 320, height: 180, frameRate: 30, videoBitrate: 1000000 },
    );
  beforeEach(() => {
    vi.clearAllMocks();
    fake.handlers.clear();
    vi.spyOn(process, "platform", "get").mockReturnValue("darwin");
    vi.spyOn(process, "argv", "get").mockReturnValue([
      "electron",
      "--experimental-native-recording",
    ]);
    contents = Object.assign(new EventEmitter(), {
      id: 1,
      mainFrame: {},
      isDestroyed: () => false,
    });
    reader = { next: vi.fn(), stop: vi.fn(), cancel: vi.fn() };
    fake.spawn.mockReturnValue(reader);
    fake.validate.mockResolvedValue(undefined);
    registerNativeCaptureTransport(() => contents as any);
  });
  it("rejects another sender and subframe", async () => {
    await expect(
      call("open", Object.assign(new EventEmitter(), { mainFrame: {} }) as any),
    ).rejects.toThrow("Unauthorized");
    await expect(
      fake.handlers.get(channels.open)!({ sender: contents, senderFrame: {} }),
    ).rejects.toThrow("Unauthorized");
    expect(fake.spawn).not.toHaveBeenCalled();
  });
  it("keeps hash routes and subframes alive; cancels cross-document main navigation", async () => {
    await call("open");
    contents.emit("did-start-navigation", { isMainFrame: true, isSameDocument: true });
    contents.emit("did-start-navigation", { isMainFrame: false, isSameDocument: false });
    expect(reader.cancel).not.toHaveBeenCalled();
    contents.emit("did-start-navigation", { isMainFrame: true, isSameDocument: false });
    expect(reader.cancel).toHaveBeenCalledOnce();
    expect(contents.listenerCount("did-start-navigation")).toBe(0);
  });
  it("rejects double open, detaches and allows another session after read failure", async () => {
    await call("open");
    await expect(call("open")).rejects.toThrow("already open");
    reader.next.mockRejectedValueOnce(new Error("native failed"));
    await expect(call("next")).rejects.toThrow("native failed");
    expect(reader.cancel).toHaveBeenCalledOnce();
    expect(contents.listenerCount("destroyed")).toBe(0);
    await call("open");
    expect(fake.spawn).toHaveBeenCalledTimes(2);
  });
  it("does not spawn after cancel invalidates an open awaiting capability", async () => {
    let resolve!: () => void;
    fake.validate.mockImplementationOnce(
      () =>
        new Promise<void>((done) => {
          resolve = done;
        }),
    );
    const opening = call("open");
    await call("cancel");
    resolve();
    await expect(opening).rejects.toThrow("unavailable");
    expect(fake.spawn).not.toHaveBeenCalled();
  });
  it("opens only when the flag or the command-line switch asks for it", async () => {
    vi.spyOn(process, "argv", "get").mockReturnValue(["electron"]);
    const capability = (requested?: boolean) =>
      fake.handlers.get(channels.capability)!(
        { sender: contents, senderFrame: contents.mainFrame },
        requested,
      );
    expect(await capability()).toMatchObject({ transportAvailable: false });
    await expect(call("open")).rejects.toThrow("unavailable");
    expect(await capability(true)).toMatchObject({ transportAvailable: true });
    await call("open");
    expect(fake.spawn).toHaveBeenCalledOnce();
    await call("cancel");
    // The flag turned off before the next take: no helper.
    expect(await capability(false)).toMatchObject({ transportAvailable: false });
    await expect(call("open")).rejects.toThrow("unavailable");
    expect(fake.spawn).toHaveBeenCalledOnce();
  });
  it("does not spawn when the page reloads while open is still awaiting", async () => {
    let resolve!: () => void;
    fake.validate.mockImplementationOnce(
      () =>
        new Promise<void>((done) => {
          resolve = done;
        }),
    );
    const opening = call("open");
    contents.emit("did-start-navigation", { isMainFrame: true, isSameDocument: false });
    resolve();
    await expect(opening).rejects.toThrow("unavailable");
    expect(fake.spawn).not.toHaveBeenCalled();
    expect(contents.listenerCount("did-start-navigation")).toBe(0);
  });
  it("hands the renderer's request to the helper unchanged", async () => {
    await call("open");
    expect(fake.spawn).toHaveBeenCalledWith("/helper", {
      displayId: 3,
      width: 320,
      height: 180,
      frameRate: 30,
      videoBitrate: 1000000,
    });
  });
});
