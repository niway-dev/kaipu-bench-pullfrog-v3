import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OnboardingContext } from "@renderer/features/onboarding/onboarding-context";
import { HeaderActions, HeaderEnd } from "@renderer/features/workspaces/header-slot";
import { TitleBar } from "./title-bar";
import {
  __resetSidebarModeSnapshotForTests,
  registerRail,
  rememberSidebarMode,
} from "./sidebar-mode-snapshot";

const workspaces = vi.hoisted(() => ({ present: true }));
vi.mock("@renderer/features/workspaces/workspaces-context", () => ({
  useOptionalWorkspaces: () => (workspaces.present ? {} : null),
}));
vi.mock("@renderer/features/workspaces/workspace-switcher", () => ({
  WorkspaceSwitcher: () => <button type="button">switcher</button>,
}));

function setPlatform(platform: string): void {
  Object.defineProperty(window, "electronAPI", { value: { platform }, configurable: true });
}

afterEach(() => {
  cleanup();
  __resetSidebarModeSnapshotForTests();
  workspaces.present = true;
  setPlatform("darwin");
});

describe("TitleBar", () => {
  it("shows the name and the workspace switcher", () => {
    render(<TitleBar />);
    expect(screen.getByText("Kaipu Record")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "switcher" })).toBeInTheDocument();
  });

  // The CSS leaves the OS controls' side empty by platform: the traffic lights on the left,
  // the Windows / Linux overlay on the right.
  it.each(["darwin", "win32", "linux"])("tells the CSS it runs on %s", (platform) => {
    setPlatform(platform);
    render(<TitleBar />);
    expect(screen.getByRole("banner")).toHaveAttribute("data-platform", platform);
  });

  it("keeps the bar but drops the switcher where there is no workspace to switch", () => {
    render(<TitleBar workspace={false} />);
    expect(screen.getByText("Kaipu Record")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "switcher" })).toBeNull();
  });

  it("drops the switcher outside the workspaces provider", () => {
    workspaces.present = false;
    render(<TitleBar />);
    expect(screen.queryByRole("button", { name: "switcher" })).toBeNull();
  });

  it("drops the switcher while onboarding covers the window", () => {
    render(
      <OnboardingContext.Provider value={{ isOpen: true, open: () => {} }}>
        <TitleBar />
      </OnboardingContext.Provider>,
    );
    expect(screen.queryByRole("button", { name: "switcher" })).toBeNull();
  });

  // NIW2-619: the editor's actions sit in the bar's right side, left of the item chip.
  it("renders a page's actions on the right, before its item chip", () => {
    render(
      <>
        <TitleBar />
        <HeaderEnd>
          <span>chip</span>
        </HeaderEnd>
        <HeaderActions>
          <button type="button">Export</button>
        </HeaderActions>
      </>,
    );
    const bar = screen.getByRole("banner");
    const exportButton = screen.getByRole("button", { name: "Export" });
    const chip = screen.getByText("chip");
    expect(bar.contains(exportButton)).toBe(true);
    expect(
      exportButton.compareDocumentPosition(chip) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("removes the actions with the page that rendered them", () => {
    const view = render(
      <>
        <TitleBar />
        <HeaderActions>
          <button type="button">Export</button>
        </HeaderActions>
      </>,
    );
    act(() => view.rerender(<TitleBar />));
    expect(screen.queryByRole("button", { name: "Export" })).toBeNull();
  });
});

describe("TitleBar sidebar toggle (NIW2-626)", () => {
  const toggle = () => screen.getByRole("button", { name: /(Collapse|Expand) sidebar/ });

  function withRail(mode: "stacked" | "collapsed") {
    rememberSidebarMode(mode);
    const updateSettings = vi.fn(async () => ({}));
    Object.defineProperty(window, "electronAPI", {
      value: { platform: "darwin", updateSettings },
      configurable: true,
    });
    const unregister = registerRail();
    return { updateSettings, unregister };
  }

  it("sits right after the logo, before the name", () => {
    withRail("stacked");
    const { container } = render(<TitleBar />);
    const bar = container.querySelector("header")!;
    const order = [...bar.querySelectorAll("svg, button, span")].map((el) =>
      el.matches("button") ? "toggle" : el.textContent === "Kaipu Record" ? "name" : null,
    );
    const toggleAt = order.indexOf("toggle");
    expect(toggleAt).toBeGreaterThanOrEqual(0);
    expect(toggleAt).toBeLessThan(order.indexOf("name"));
    expect(bar.firstElementChild?.nextElementSibling).toContainElement(toggle());
  });

  it("is clickable inside the draggable bar and never collapses with a crowded bar", () => {
    withRail("stacked");
    render(<TitleBar />);
    expect(toggle().closest('[class*="interactive"]')).not.toBeNull();
    expect(toggle().closest("[data-collapse]")).toBeNull();
  });

  it("names what it does, shows the shortcut, and switches and saves the mode", () => {
    const { updateSettings } = withRail("stacked");
    render(<TitleBar />);
    expect(toggle()).toHaveAccessibleName("Collapse sidebar");
    expect(toggle()).toHaveAttribute("title", expect.stringContaining("⌘\\"));
    fireEvent.click(toggle());
    expect(toggle()).toHaveAccessibleName("Expand sidebar");
    expect(updateSettings).toHaveBeenCalledWith({ sidebarMode: "collapsed" });
  });

  it("is absent where no rail is drawn (sign-in, error screen, onboarding)", () => {
    const { unregister } = withRail("stacked");
    unregister();
    render(<TitleBar />);
    expect(screen.queryByRole("button", { name: /sidebar/i })).toBeNull();
  });
});
