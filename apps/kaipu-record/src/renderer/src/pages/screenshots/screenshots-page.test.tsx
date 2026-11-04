import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { ScreenshotsPage } from "./screenshots-page";

function renderPage() {
  const router = createMemoryRouter([{ path: "/screenshots", element: <ScreenshotsPage /> }], {
    initialEntries: ["/screenshots"],
  });
  render(<RouterProvider router={router} />);
}

describe("ScreenshotsPage header (NIW2-626)", () => {
  it("is titled by what it does, with no eyebrow repeating the rail and no generic subtitle", () => {
    renderPage();
    expect(
      screen.getByRole("heading", { level: 1, name: "Take a screenshot" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.queryByText("SCREENSHOTS")).toBeNull();
    expect(screen.queryByText(/mark what matters with boxes, arrows and text/)).toBeNull();
  });
});
