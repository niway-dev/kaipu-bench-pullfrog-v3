import { beforeEach, describe, expect, it, vi } from "vitest";
import { Script } from "node:vm";
import { cursorCapturePage } from "./cursor-capture-page";

const fake = vi.hoisted(() => ({
  handler: null as any,
  frame: { url: "file:///tmp/index.html#screen%3A1%3A0" },
  loadFile: vi.fn(),
  writeFile: vi.fn(),
  quit: vi.fn(),
  sources: [{ id: "screen:1:0", name: "Display" }],
}));
vi.mock("electron", () => ({
  app: { getVersion: () => "test", isPackaged: true, quit: fake.quit },
  BrowserWindow: class {
    webContents = { mainFrame: fake.frame, setWindowOpenHandler: vi.fn(), on: vi.fn() };
    on = vi.fn();
    loadFile = fake.loadFile;
    destroy = vi.fn();
  },
  desktopCapturer: { getSources: async () => fake.sources },
  session: {
    fromPartition: () => ({
      setDisplayMediaRequestHandler: (handler: any) => {
        fake.handler = handler;
      },
    }),
  },
  systemPreferences: { getMediaAccessStatus: () => "granted" },
}));
vi.mock("node:fs/promises", () => ({
  mkdtemp: async () => "/tmp/diagnostic-test",
  writeFile: fake.writeFile,
  rm: vi.fn(),
}));
import { diagnosticSourceId, openCursorCaptureDiagnostic } from "./cursor-capture";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("cursor capture diagnostic isolation", () => {
  it("rejects malformed and unlisted sources", () => {
    expect(diagnosticSourceId("file:///tmp/test#screen%3A1%3A0", ["screen:1:0"])).toBe(
      "screen:1:0",
    );
    for (const url of ["invalid", "file:///test#%zz", "file:///test#window:2:0", "file:///test"]) {
      expect(diagnosticSourceId(url, ["screen:1:0"])).toBeUndefined();
    }
  });
  it("serves only the diagnostic frame and explicitly requested loopback", async () => {
    await openCursorCaptureDiagnostic();
    const callback = vi.fn();
    fake.handler({ frame: fake.frame, videoRequested: true, audioRequested: true }, callback);
    expect(callback).toHaveBeenLastCalledWith({ video: fake.sources[0], audio: "loopback" });
    fake.handler({ frame: fake.frame, videoRequested: true, audioRequested: false }, callback);
    expect(callback).toHaveBeenLastCalledWith({ video: fake.sources[0] });
    fake.handler({ frame: { ...fake.frame }, videoRequested: true }, callback);
    expect(callback).toHaveBeenLastCalledWith({});
    fake.handler({ frame: fake.frame, videoRequested: false }, callback);
    expect(callback).toHaveBeenLastCalledWith({});
  });
  it("embeds source names as data and ships syntactically valid diagnostic JS", () => {
    const page = cursorCapturePage({}, [{ id: "a", name: "</script><script>evil()" }]);
    expect(page.match(/<script>/g)).toHaveLength(1);
    const script = page.split("<script>")[1].split("</script>")[0];
    expect(() => new Script(script)).not.toThrow();
    expect(page).toContain("cursorFree: 'unverified'");
  });
});

describe("diagnostic capture lifecycle", () => {
  async function run(mode: string, failRecorder = false, failAudio = false) {
    const stop = vi.fn();
    const track = {
      kind: "video",
      stop,
      getSettings: () => ({ cursor: "never" }),
      getConstraints: () => ({}),
    };
    const stream = { getTracks: () => [track], getAudioTracks: () => [] };
    const getDisplayMedia = vi.fn(async () => stream);
    const getUserMedia = vi.fn(async (constraints) => {
      if (failAudio && constraints.audio !== false) throw new Error("loopback denied");
      return stream;
    });
    const elements: Record<string, any> = {
      "#source": { add: vi.fn(), value: "screen:1:0" },
      "#mode": { value: mode },
      "#start": {},
      "#video": { pause: vi.fn(), play: vi.fn(async () => {}), removeAttribute: vi.fn() },
      "#report": {},
      "#downloads": { append: vi.fn(), replaceChildren: vi.fn() },
    };
    const page = cursorCapturePage({}, [{ id: "screen:1:0", name: "Display" }]);
    const script = new Script(page.split("<script>")[1].split("</script>")[0]);
    const context = {
      document: { querySelector: (id: string) => elements[id], createElement: () => ({}) },
      navigator: {
        mediaDevices: { getDisplayMedia, getUserMedia, getSupportedConstraints: () => ({}) },
      },
      location: { hash: "" },
      performance: { now: () => 10 },
      URL: { createObjectURL: () => "blob:test", revokeObjectURL: vi.fn() },
      Blob,
      Option: class {},
      Date,
      setTimeout: (fn: () => void) => {
        queueMicrotask(fn);
        return 1;
      },
      clearTimeout: vi.fn(),
      MediaRecorder: class {
        state = "recording";
        mimeType = "video/webm";
        onstop = () => {};
        ondataavailable = (_: unknown) => {};
        constructor() {
          if (failRecorder) throw new Error("encoder unavailable");
        }
        start() {
          this.ondataavailable({ data: new Blob(["video"]) });
        }
        stop() {
          this.state = "inactive";
          this.onstop();
        }
      },
    };
    script.runInNewContext(context);
    await elements["#start"].onclick();
    return {
      stop,
      getDisplayMedia,
      getUserMedia,
      elements,
      result: JSON.parse(elements["#report"].textContent),
    };
  }
  it("requests cursor never without treating reported settings as proof", async () => {
    const capture = await run("never");
    expect(capture.getDisplayMedia).toHaveBeenCalledWith({
      audio: true,
      video: { cursor: "never", frameRate: 30 },
    });
    expect(capture.getUserMedia).not.toHaveBeenCalled();
    expect(capture.result.cursorFree).toBe("unverified");
    expect(capture.result.audioTrackCount).toBe(0);
    expect(capture.result.bytes).toBeGreaterThan(0);
    expect(capture.stop).toHaveBeenCalledOnce();
    expect(capture.elements["#downloads"].append).toHaveBeenCalledTimes(2);
  });
  it("records legacy audio failure and explicitly falls back to video-only", async () => {
    const capture = await run("legacy", false, true);
    expect(capture.getUserMedia).toHaveBeenCalledTimes(2);
    expect(capture.getUserMedia.mock.calls[1][0].audio).toBe(false);
    expect(capture.result.legacyAudioFailure.message).toBe("loopback denied");
    expect(capture.result.bytes).toBeGreaterThan(0);
    expect(capture.stop).toHaveBeenCalledOnce();
  });
  it("keeps the legacy comparison and releases tracks when encoding fails", async () => {
    const capture = await run("legacy", true);
    expect(capture.getDisplayMedia).not.toHaveBeenCalled();
    expect(capture.getUserMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        video: {
          mandatory: {
            chromeMediaSource: "desktop",
            chromeMediaSourceId: "screen:1:0",
            maxFrameRate: 30,
          },
        },
      }),
    );
    expect(capture.result.error.message).toBe("encoder unavailable");
    expect(capture.stop).toHaveBeenCalledOnce();
    expect(capture.elements["#start"].disabled).toBe(false);
  });
});
