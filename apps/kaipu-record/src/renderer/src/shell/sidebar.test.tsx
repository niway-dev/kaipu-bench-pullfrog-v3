import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ROUTES } from "@shared/routes";
import type { AppSettings } from "@shared/types";
import {
  __resetReadyCopiesForTests,
  getReadyCopies,
  noteFinishedCopy,
  noteReadyCardsShown,
} from "@renderer/features/video-editor/export/ready-copies";
import { Sidebar } from "./sidebar";
import { __resetSidebarModeSnapshotForTests, rememberSidebarMode } from "./sidebar-mode-snapshot";
import { SIDEBAR_ROW_MIN_WINDOW_WIDTH } from "./use-sidebar-mode";

/** The runner's status, set by a test as if an export were encoding. */
const runnerStatus = vi.hoisted(() => {
  let value: "idle" | "exporting" = "idle";
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set(next: "idle" | "exporting") {
      value = next;
      for (const l of listeners) l();
    },
    subscribe(l: () => void) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
});
vi.mock("@renderer/features/video-editor/export/export-runner", async (importOriginal) => {
  const real =
    await importOriginal<typeof import("@renderer/features/video-editor/export/export-runner")>();
  const { useSyncExternalStore } = await import("react");
  return {
    ...real,
    useExportRunner: () => {
      const snapshot = real.useExportRunner();
      const status = useSyncExternalStore(runnerStatus.subscribe, runnerStatus.get);
      return status === "exporting" ? { ...snapshot, status } : snapshot;
    },
  };
});

function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      { path: "/", element: <Sidebar /> },
      { path: ROUTES.screenshots, element: <Sidebar /> },
      { path: ROUTES.library, element: <Sidebar /> },
      { path: ROUTES.libraryDetail, element: <Sidebar /> },
      { path: ROUTES.exportNew, element: <Sidebar /> },
      { path: ROUTES.export, element: <Sidebar /> },
      // Every other page renders the same shell sidebar.
      { path: "*", element: <Sidebar /> },
    ],
    { initialEntries: [path] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

const libraryLink = (): HTMLElement => screen.getByRole("link", { name: /^Library/ });

// The renderer root reads the settings before the first paint (I18nRoot) and leaves the mode
// here; every test starts as a window whose settings said expanded-row.
// A 1440px window, wide enough for the row layout (jsdom's default is 1024).
beforeEach(() => {
  rememberSidebarMode("expanded-row");
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1440 });
});

afterEach(() => {
  __resetSidebarModeSnapshotForTests();
  __resetReadyCopiesForTests();
  runnerStatus.set("idle");
});

describe("Sidebar items", () => {
  it("has no Export item; the other pages keep theirs", () => {
    renderAt("/");
    const labels = screen.getAllByRole("link").map((link) => link.textContent);
    expect(labels).not.toContain("Export");
    expect(labels.slice(0, 7)).toEqual([
      "Record",
      "Screenshot",
      "Editor",
      "Library",
      "Shortcuts",
      "Settings",
      "Cloud",
    ]);
  });

  it("lights the Library on a recording's Export page, and nothing on the bare picker", () => {
    renderAt("/export/asset-1");
    expect(libraryLink()).toHaveAttribute("aria-current", "page");
    cleanup();
    renderAt(ROUTES.exportNew);
    expect(
      screen.getAllByRole("link").filter((l) => l.getAttribute("aria-current") === "page"),
    ).toEqual([]);
  });
});

describe("Sidebar active item", () => {
  // The rail computes `active` itself now (no NavLink), so every route must
  // light exactly the one item it belongs to.
  it.each([
    ["/", "Record"],
    ["/screenshots", "Screenshot"],
    ["/editor", "Editor"],
    ["/editor/video/asset-1", "Editor"],
    ["/editor/image/asset-1", "Editor"],
    ["/library", "Library"],
    ["/library/asset-1", "Library"],
    ["/shortcuts", "Shortcuts"],
    ["/settings", "Settings"],
  ])("%s lights only %s", (path, label) => {
    renderAt(path);
    const current = screen
      .getAllByRole("link")
      .filter((l) => l.getAttribute("aria-current") === "page")
      .map((l) => l.textContent);
    expect(current).toEqual([label]);
  });

  it("/cloud lights Cloud and the account avatar, which opens the same page", () => {
    renderAt("/cloud");
    const current = screen
      .getAllByRole("link")
      .filter((l) => l.getAttribute("aria-current") === "page");
    expect(current.map((l) => l.textContent)).toEqual(["Cloud", ""]);
  });
});

describe("Sidebar Library badge (copies being made or ready)", () => {
  it("counts an export that is encoding, on top of the finished copies", () => {
    renderAt("/");
    act(() => runnerStatus.set("exporting"));
    expect(libraryLink()).toHaveAccessibleName(/1 copy in progress or ready/);
    expect(libraryLink()).toHaveTextContent("1");
    act(() => noteFinishedCopy("copy-1"));
    expect(libraryLink()).toHaveTextContent("2");
  });

  it("counts copies that finished out of sight, and clears when the Library opens", async () => {
    const router = renderAt("/");
    expect(libraryLink()).toHaveTextContent(/^Library$/);
    act(() => noteFinishedCopy("copy-1"));
    expect(libraryLink()).toHaveAccessibleName(/1 copy in progress or ready/);
    expect(libraryLink()).toHaveTextContent("1");

    await act(() => router.navigate(ROUTES.library));
    expect(libraryLink()).toHaveTextContent(/^Library$/);
    // Still pointed at in the Library until the copy itself is opened.
    expect(getReadyCopies().copies).toEqual([{ assetId: "copy-1", announced: true, card: true }]);
  });

  it("opening Export clears it too, since Export points at the copies", async () => {
    const router = renderAt("/");
    act(() => noteFinishedCopy("copy-1"));
    await act(() => router.navigate(ROUTES.exportNew));
    expect(libraryLink()).toHaveTextContent(/^Library$/);
  });

  it("a copy that finishes while the Library is open never badges", () => {
    renderAt(ROUTES.library);
    act(() => noteFinishedCopy("copy-1"));
    expect(libraryLink()).toHaveTextContent(/^Library$/);
  });

  it("leaving the Library retires its Ready to upload cards, not the copies", async () => {
    const router = renderAt(ROUTES.library);
    act(() => noteFinishedCopy("copy-1"));
    expect(getReadyCopies().copies[0]).toMatchObject({ card: true });
    // The Library page had the card on screen.
    act(() => noteReadyCardsShown(["copy-1"]));
    await act(() => router.navigate(ROUTES.screenshots));
    expect(getReadyCopies().copies).toEqual([
      { assetId: "copy-1", announced: true, card: false, shown: true },
    ]);
    // A copy that finishes while away still gets its card on the next visit.
    act(() => noteFinishedCopy("copy-2"));
    await act(() => router.navigate(ROUTES.library));
    expect(getReadyCopies().copies.map((c) => [c.assetId, c.card])).toEqual([
      ["copy-1", false],
      ["copy-2", true],
    ]);
  });

  it("opening the copy's page forgets it", async () => {
    const router = renderAt("/");
    act(() => noteFinishedCopy("copy-1"));
    act(() => noteFinishedCopy("copy-2"));
    expect(libraryLink()).toHaveAccessibleName(/2 copies in progress or ready/);
    await act(() => router.navigate("/library/copy-1"));
    expect(getReadyCopies().copies.map((c) => c.assetId)).toEqual(["copy-2"]);
  });
});

describe("Sidebar modes (NIW2-626)", () => {
  const nav = (): HTMLElement => screen.getByRole("navigation");

  /** The settings the main process holds, as if persisted across a restart. */
  function persisted(sidebarMode: AppSettings["sidebarMode"]) {
    const original = window.electronAPI.getSettings;
    let stored: Partial<AppSettings> = { sidebarMode };
    vi.spyOn(window.electronAPI, "getSettings").mockImplementation(async () => ({
      ...(await original()),
      ...stored,
    }));
    const update = vi.fn(async (patch: Partial<AppSettings>) => {
      stored = { ...stored, ...patch };
      return { ...(await original()), ...stored };
    });
    vi.spyOn(window.electronAPI, "updateSettings").mockImplementation(update);
    return update;
  }

  afterEach(() => vi.restoreAllMocks());

  it("opens expanded, icon and label on one row, before anything was chosen", () => {
    renderAt("/");
    expect(nav()).toHaveAttribute("data-mode", "expanded-row");
  });

  it("opens in the mode stored in the settings (it survives a restart)", async () => {
    persisted("collapsed");
    renderAt("/");
    await waitFor(() => expect(nav()).toHaveAttribute("data-mode", "collapsed"));
    // Icons only, yet every item keeps its name.
    expect(screen.getByRole("link", { name: "Library" })).toBeInTheDocument();
  });

  it("the toggle at the rail's foot cycles expanded → stacked → collapsed → expanded and saves each", async () => {
    const update = persisted("expanded-row");
    renderAt("/");
    await waitFor(() => expect(nav()).toHaveAttribute("data-mode", "expanded-row"));
    fireEvent.click(screen.getByRole("button", { name: /Change sidebar layout to Stacked/ }));
    expect(nav()).toHaveAttribute("data-mode", "stacked");
    fireEvent.click(screen.getByRole("button", { name: /Change sidebar layout to Icons only/ }));
    expect(nav()).toHaveAttribute("data-mode", "collapsed");
    fireEvent.click(screen.getByRole("button", { name: /Change sidebar layout to Expanded/ }));
    expect(nav()).toHaveAttribute("data-mode", "expanded-row");
    expect(update.mock.calls.map(([patch]) => patch)).toEqual([
      { sidebarMode: "stacked" },
      { sidebarMode: "collapsed" },
      { sidebarMode: "expanded-row" },
    ]);
  });

  it("Cmd+\\ cycles the mode on macOS and saves it", async () => {
    const update = persisted("expanded-row");
    renderAt("/");
    await waitFor(() => expect(nav()).toHaveAttribute("data-mode", "expanded-row"));
    fireEvent.keyDown(window, { key: "\\", code: "Backslash", metaKey: true });
    expect(nav()).toHaveAttribute("data-mode", "stacked");
    expect(update).toHaveBeenCalledWith({ sidebarMode: "stacked" });
  });

  it("ignores Ctrl+\\ on macOS, a bare \\ and Cmd+Shift+\\", async () => {
    const update = persisted("expanded-row");
    renderAt("/");
    await waitFor(() => expect(nav()).toHaveAttribute("data-mode", "expanded-row"));
    fireEvent.keyDown(window, { key: "\\", code: "Backslash", ctrlKey: true });
    fireEvent.keyDown(window, { key: "\\", code: "Backslash" });
    fireEvent.keyDown(window, { key: "|", code: "Backslash", metaKey: true, shiftKey: true });
    expect(nav()).toHaveAttribute("data-mode", "expanded-row");
    expect(update).not.toHaveBeenCalled();
  });

  it("shows the shortcut in the toggle's title", async () => {
    persisted("expanded-row");
    renderAt("/");
    await waitFor(() => expect(nav()).toHaveAttribute("data-mode", "expanded-row"));
    expect(screen.getByRole("button", { name: /Change sidebar layout/ })).toHaveAttribute(
      "title",
      expect.stringContaining("⌘\\"),
    );
  });
});

describe("Sidebar shortcut leaves other handlers alone (NIW2-626 review)", () => {
  const nav = (): HTMLElement => screen.getByRole("navigation");
  const press = (target: Element | Window, init: KeyboardEventInit = {}) =>
    fireEvent.keyDown(target, { key: "\\", code: "Backslash", metaKey: true, ...init });

  afterEach(() => {
    document.body.querySelectorAll("[data-extra]").forEach((el) => el.remove());
  });

  function extra<T extends HTMLElement>(html: string): T {
    const host = document.createElement("div");
    host.setAttribute("data-extra", "");
    host.innerHTML = html;
    document.body.append(host);
    return host.querySelector("[data-target]") as T;
  }

  it("does nothing when another handler already took the key", () => {
    renderAt("/");
    const event = new KeyboardEvent("keydown", {
      key: "\\",
      code: "Backslash",
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });
    event.preventDefault();
    act(() => {
      window.dispatchEvent(event);
    });
    expect(nav()).toHaveAttribute("data-mode", "expanded-row");
  });

  it.each([
    ["an input", `<input data-target />`],
    ["a textarea", `<textarea data-target></textarea>`],
    ["a select", `<select data-target><option>a</option></select>`],
    ["a contenteditable", `<div data-target contenteditable="true"></div>`],
  ])("does nothing while typing in %s", (_, html) => {
    renderAt("/");
    press(extra(html));
    expect(nav()).toHaveAttribute("data-mode", "expanded-row");
  });

  it("does nothing while a modal dialog is open, wherever focus is", () => {
    renderAt("/");
    extra(`<div role="dialog" aria-modal="true"><button data-target>ok</button></div>`);
    press(window);
    expect(nav()).toHaveAttribute("data-mode", "expanded-row");
  });

  it("still works from a plain button outside any dialog", () => {
    renderAt("/");
    press(extra(`<button data-target>x</button>`));
    expect(nav()).toHaveAttribute("data-mode", "stacked");
  });
});

describe("Sidebar first paint (NIW2-626 review)", () => {
  it("with a saved collapsed mode known at startup, the very first render is collapsed", () => {
    rememberSidebarMode("collapsed");
    renderAt("/");
    expect(screen.getByRole("navigation")).toHaveAttribute("data-mode", "collapsed");
  });

  it("with the mode not known yet, draws no rail until the settings say which, never expanded-row", async () => {
    __resetSidebarModeSnapshotForTests();
    const original = window.electronAPI.getSettings;
    vi.spyOn(window.electronAPI, "getSettings").mockImplementation(async () => ({
      ...(await original()),
      sidebarMode: "collapsed",
    }));
    const seen: (string | null)[] = [];
    const observer = new MutationObserver(() => {
      seen.push(document.querySelector("nav[data-mode]")?.getAttribute("data-mode") ?? null);
    });
    observer.observe(document.body, { subtree: true, childList: true, attributes: true });
    renderAt("/");
    seen.push(document.querySelector("nav[data-mode]")?.getAttribute("data-mode") ?? null);
    await waitFor(() =>
      expect(screen.getByRole("navigation")).toHaveAttribute("data-mode", "collapsed"),
    );
    observer.disconnect();
    vi.restoreAllMocks();
    expect(seen).not.toContain("expanded-row");
    expect(seen[0]).toBeNull();
  });
});

describe("Sidebar in a narrow window (NIW2-626 review)", () => {
  const nav = (): HTMLElement => screen.getByRole("navigation");
  const startWidth = 1440;
  const resizeTo = (width: number) =>
    act(() => {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
      window.dispatchEvent(new Event("resize"));
    });

  afterEach(() => {
    resizeTo(startWidth);
    vi.restoreAllMocks();
  });

  it("draws a saved expanded-row rail stacked below the threshold, without saving anything", () => {
    const update = vi.spyOn(window.electronAPI, "updateSettings");
    resizeTo(SIDEBAR_ROW_MIN_WINDOW_WIDTH - 1);
    renderAt("/");
    expect(nav()).toHaveAttribute("data-mode", "stacked");
    resizeTo(SIDEBAR_ROW_MIN_WINDOW_WIDTH);
    expect(nav()).toHaveAttribute("data-mode", "expanded-row");
    resizeTo(1180);
    expect(nav()).toHaveAttribute("data-mode", "stacked");
    expect(update).not.toHaveBeenCalled();
  });

  it("leaves collapsed and stacked as they are", () => {
    resizeTo(1180);
    rememberSidebarMode("collapsed");
    renderAt("/");
    expect(nav()).toHaveAttribute("data-mode", "collapsed");
    cleanup();
    rememberSidebarMode("stacked");
    renderAt("/");
    expect(nav()).toHaveAttribute("data-mode", "stacked");
  });

  it("the threshold leaves the editor's minimum content width beside a 200px rail", () => {
    expect(SIDEBAR_ROW_MIN_WINDOW_WIDTH).toBeGreaterThanOrEqual(1180 + (200 - 64));
  });
});
