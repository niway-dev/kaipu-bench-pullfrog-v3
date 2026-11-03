import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { CaptureToastPayload, CaptureToastTimer } from "@shared/types/screenshot-capture";
import type { CaptureToastBridge } from "@shared/types/electron-api";
import { previewCardSize } from "@shared/capture-preview-layout";
import { CaptureToast } from "./capture-toast";

const SAVED: CaptureToastPayload = {
  thumbnail: "data:image/png;base64,AAAA",
  width: 1440,
  height: 900,
  mode: "frame",
  saved: { id: "screenshot-1" },
  copied: true,
  workspace: { id: "ws-personal", name: "Personal" },
};

function fakeApi() {
  let onShow: ((payload: CaptureToastPayload) => void) | null = null;
  let onTimer: ((timer: CaptureToastTimer) => void) | null = null;
  const api = {
    onShow: vi.fn((callback: (payload: CaptureToastPayload) => void) => {
      onShow = callback;
      return () => (onShow = null);
    }),
    onTimer: vi.fn((callback: (timer: CaptureToastTimer) => void) => {
      onTimer = callback;
      return () => (onTimer = null);
    }),
    ready: vi.fn(),
    action: vi.fn(),
    hover: vi.fn(),
  } satisfies CaptureToastBridge;
  const show = (payload: CaptureToastPayload): void => act(() => onShow?.(payload));
  const timer = (value: CaptureToastTimer): void => act(() => onTimer?.(value));
  return { api, show, timer };
}

function renderCard(payload: CaptureToastPayload | null, platform: "mac" | "other" = "mac") {
  const fake = fakeApi();
  const utils = render(<CaptureToast api={fake.api} platform={platform} />);
  if (payload) fake.show(payload);
  return { ...fake, ...utils };
}

const button = (name: string | RegExp): HTMLElement => screen.getByRole("button", { name });

describe("CaptureToast (the capture preview card)", () => {
  afterEach(cleanup);

  it("subscribes before telling main it is ready, and renders nothing until a payload lands", () => {
    const { api, container } = renderCard(null);
    expect(api.onShow).toHaveBeenCalledTimes(1);
    expect(api.onTimer).toHaveBeenCalledTimes(1);
    expect(api.onShow.mock.invocationCallOrder[0]).toBeLessThan(
      api.ready.mock.invocationCallOrder[0]!,
    );
    expect(api.onTimer.mock.invocationCallOrder[0]).toBeLessThan(
      api.ready.mock.invocationCallOrder[0]!,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("explicit Copy keeps the thumbnail and an actionable Edit during confirmation", () => {
    const { container, api } = renderCard({ ...SAVED, presentation: "copied" });
    expect(screen.getByRole("status")).toHaveTextContent("Copied");
    expect(container.querySelector("img")).toHaveAttribute("src", SAVED.thumbnail);
    expect(screen.getByRole("status")).toHaveAttribute("data-confirmation", "true");
    fireEvent.click(button("Edit this screenshot"));
    expect(api.action).toHaveBeenLastCalledWith("edit");
  });

  it("is the screenshot: the image fills an area sized from the shot's aspect ratio", () => {
    const { container } = renderCard(SAVED);
    const img = container.querySelector("img");
    expect(img).toHaveAttribute("src", SAVED.thumbnail);
    expect(img?.parentElement?.parentElement).toHaveStyle({
      height: `${previewCardSize(1440, 900).imageHeight}px`,
    });
  });

  it("saved and copied: both states, the paste hint, the size, mode and workspace", () => {
    renderCard(SAVED);
    expect(button("Saved · show the file in Finder")).toHaveTextContent("Saved");
    expect(button("Copied · copy again")).toHaveTextContent("Copied · ⌘V");
    expect(screen.getByText("1440 × 900 · Frame")).toBeInTheDocument();
    expect(screen.getByText("Personal")).toBeInTheDocument();
  });

  it("names Ctrl+V and Explorer off macOS", () => {
    renderCard(SAVED, "other");
    expect(button("Copied · copy again")).toHaveTextContent("Copied · Ctrl+V");
    expect(button("Saved · show the file in Explorer")).toBeInTheDocument();
  });

  it("not copied (Capture with manual copy): a Copy button, shown on hover only", () => {
    renderCard({ ...SAVED, copied: false });
    const copy = button("Copy to the clipboard");
    expect(copy).toHaveTextContent("Copy");
    expect(copy).toHaveAttribute("data-hover-only");
    expect(screen.queryByRole("button", { name: "Copied · copy again" })).not.toBeInTheDocument();
  });

  it("main re-sending the payload after a Copy turns Copy into Copied", () => {
    const { show } = renderCard({ ...SAVED, copied: false });
    show(SAVED);
    expect(button("Copied · copy again")).toBeInTheDocument();
  });

  it("a failed vault write: Save to the workspace, and 'Not saved' in the meta line", () => {
    const { show } = renderCard({ ...SAVED, saved: null });
    expect(button("Not saved · save to Personal")).toHaveTextContent("Save");
    expect(screen.getByText("Not saved")).toBeInTheDocument();
    show({ ...SAVED, saved: null, workspace: null });
    expect(button("Not saved · save to the Library")).toBeInTheDocument();
    show(SAVED);
    expect(button("Saved · show the file in Finder")).toBeInTheDocument();
  });

  it("reports the pointer entering and leaving the card", () => {
    const { api } = renderCard(SAVED);
    const card = screen.getByRole("status");
    fireEvent.pointerEnter(card);
    expect(api.hover).toHaveBeenLastCalledWith(true);
    fireEvent.pointerLeave(card);
    expect(api.hover).toHaveBeenLastCalledWith(false);
  });

  it("sends the right action for every control; the image itself is Edit", () => {
    const { api, show } = renderCard(SAVED);
    fireEvent.click(button("Edit this screenshot"));
    expect(api.action).toHaveBeenLastCalledWith("edit");
    fireEvent.click(button("Saved · show the file in Finder"));
    expect(api.action).toHaveBeenLastCalledWith("reveal");
    fireEvent.click(button("Copied · copy again"));
    expect(api.action).toHaveBeenLastCalledWith("copy");
    fireEvent.click(button("Dismiss"));
    expect(api.action).toHaveBeenLastCalledWith("dismiss");

    show({ ...SAVED, saved: null, copied: false });
    fireEvent.click(button("Not saved · save to Personal"));
    expect(api.action).toHaveBeenLastCalledWith("save");
    fireEvent.click(button("Copy to the clipboard"));
    expect(api.action).toHaveBeenLastCalledWith("copy");
  });

  it("the bar mirrors main's timer: a new run per start, frozen while stopped", () => {
    const { timer, container } = renderCard(SAVED);
    const bar = (): HTMLElement => container.querySelector("[aria-hidden] > i") as HTMLElement;
    expect(bar()).toHaveAttribute("data-run", "false");

    timer({ remainingMs: 10_000 });
    const first = bar();
    expect(first).toHaveAttribute("data-running", "true");
    expect(first.style.animationDuration).toBe("10000ms");

    timer({ remainingMs: null });
    // Same element, paused where it was.
    expect(bar()).toBe(first);
    expect(bar()).toHaveAttribute("data-running", "false");

    timer({ remainingMs: 10_000 });
    // A restart is a fresh element, so the animation starts again from full.
    expect(bar()).not.toBe(first);
    expect(bar()).toHaveAttribute("data-running", "true");
  });
});
