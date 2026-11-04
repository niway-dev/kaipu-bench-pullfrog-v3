import { describe, expect, it } from "vitest";
import { isSidebarToggleKey, nextSidebarMode, sidebarToggleHint } from "./use-sidebar-mode";

const key = (init: KeyboardEventInit) =>
  new KeyboardEvent("keydown", { key: "\\", code: "Backslash", ...init });

describe("sidebar mode toggle", () => {
  it("switches between expanded (stacked) and collapsed", () => {
    expect(nextSidebarMode("stacked")).toBe("collapsed");
    expect(nextSidebarMode("collapsed")).toBe("stacked");
  });

  it("is Cmd+\\ on macOS and Ctrl+\\ on Windows", () => {
    expect(isSidebarToggleKey(key({ metaKey: true }), "darwin")).toBe(true);
    expect(isSidebarToggleKey(key({ ctrlKey: true }), "darwin")).toBe(false);
    expect(isSidebarToggleKey(key({ ctrlKey: true }), "win32")).toBe(true);
    expect(isSidebarToggleKey(key({ metaKey: true }), "win32")).toBe(false);
    expect(sidebarToggleHint("darwin")).toBe("⌘\\");
    expect(sidebarToggleHint("win32")).toBe("Ctrl+\\");
  });

  it("matches the physical key on a layout that types another character there", () => {
    expect(isSidebarToggleKey(key({ key: "ç", metaKey: true }), "darwin")).toBe(true);
  });

  it("leaves Shift and Alt combinations alone", () => {
    expect(isSidebarToggleKey(key({ metaKey: true, shiftKey: true }), "darwin")).toBe(false);
    expect(isSidebarToggleKey(key({ metaKey: true, altKey: true }), "darwin")).toBe(false);
  });
});
