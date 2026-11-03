import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DEFAULT_SETTINGS } from "@shared/types";
import { ScreenshotAfterCaptureSettings } from "./screenshot-after-capture-settings";

const scope = vi.hoisted(() => ({ multi: true }));
vi.mock("./scope/settings-scope", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./scope/settings-scope")>()),
  useSettingsScope: () => ({ multi: scope.multi }),
}));

describe("ScreenshotAfterCaptureSettings", () => {
  const scrollIntoView = Element.prototype.scrollIntoView;
  beforeAll(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });
  afterAll(() => {
    Element.prototype.scrollIntoView = scrollIntoView;
  });
  it("loads the preview default and persists the editor destination", async () => {
    const user = userEvent.setup();
    window.electronAPI.getSettings = vi.fn().mockResolvedValue(DEFAULT_SETTINGS);
    const update = vi
      .fn()
      .mockResolvedValue({ ...DEFAULT_SETTINGS, screenshotAfterCapture: "editor" });
    window.electronAPI.updateSettings = update;
    render(<ScreenshotAfterCaptureSettings />);
    const select = screen.getByRole("combobox", { name: "After capturing" });
    await waitFor(() => expect(select).not.toBeDisabled());
    expect(select).toHaveTextContent("Show preview");
    select.focus();
    await user.keyboard("[Space]");
    await screen.findByRole("option", { name: "Open editor" });
    await user.keyboard("[End][Enter]");
    expect(update).toHaveBeenCalledWith({ screenshotAfterCapture: "editor" });
    await waitFor(() => expect(select).toHaveTextContent("Open editor"));
  });

  it.each([true, false])(
    "marks the app-wide scope only when several workspaces exist (%s)",
    (multi) => {
      scope.multi = multi;
      window.electronAPI.getSettings = vi.fn().mockResolvedValue(DEFAULT_SETTINGS);
      render(<ScreenshotAfterCaptureSettings />);
      expect(screen.queryByText("App-wide") !== null).toBe(multi);
    },
  );

  it("reflects a stored editor choice", async () => {
    window.electronAPI.getSettings = vi
      .fn()
      .mockResolvedValue({ ...DEFAULT_SETTINGS, screenshotAfterCapture: "editor" });
    render(<ScreenshotAfterCaptureSettings />);
    await waitFor(() => expect(screen.getByRole("combobox")).toHaveTextContent("Open editor"));
  });
});
