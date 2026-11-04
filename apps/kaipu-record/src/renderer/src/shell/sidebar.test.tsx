import { act, cleanup, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ROUTES } from "@shared/routes";
import {
  __resetReadyCopiesForTests,
  getReadyCopies,
  noteFinishedCopy,
  noteReadyCardsShown,
} from "@renderer/features/video-editor/export/ready-copies";
import { Sidebar } from "./sidebar";

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
    ],
    { initialEntries: [path] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

const libraryLink = (): HTMLElement => screen.getByRole("link", { name: /^Library/ });

afterEach(() => {
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
