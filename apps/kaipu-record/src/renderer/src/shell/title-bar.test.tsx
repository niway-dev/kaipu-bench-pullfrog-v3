import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OnboardingContext } from "@renderer/features/onboarding/onboarding-context";
import { TitleBar } from "./title-bar";

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
});
