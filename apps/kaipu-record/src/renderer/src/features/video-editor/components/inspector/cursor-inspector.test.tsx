import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { useVideoScene } from "../../use-video-scene";
import { initialScene } from "../../scene";
import { parseSession, serializeSession } from "../../session";
import { CursorInspector } from "./cursor-inspector";
function Harness({ clicks = true }: { clicks?: boolean }) {
  const controller = useVideoScene(initialScene(3));
  return (
    <>
      <CursorInspector controller={controller} clicksAvailable={clicks} />
      <button onClick={controller.undo}>undo</button>
      <button onClick={controller.redo}>redo</button>
      <output data-testid="saved">{serializeSession(controller.scene)}</output>
    </>
  );
}
it("inspector changes round-trip through persistence and undo/redo, including one slider gesture", () => {
  render(<Harness />);
  fireEvent.change(screen.getByRole("combobox", { name: "Pointer style" }), {
    target: { value: "dot" },
  });
  const slider = screen.getByRole("slider", { name: "Size" });
  fireEvent.pointerDown(slider);
  fireEvent.change(slider, { target: { value: "48" } });
  fireEvent.change(slider, { target: { value: "64" } });
  fireEvent.pointerUp(slider);
  const saved = () => parseSession(screen.getByTestId("saved").textContent!)!.scene.cursor;
  expect(saved()).toMatchObject({ style: "dot", size: 64 });
  fireEvent.click(screen.getByText("undo"));
  expect(saved()).toMatchObject({ style: "dot", size: 32 });
  fireEvent.click(screen.getByText("redo"));
  expect(saved()?.size).toBe(64);
  fireEvent.click(screen.getByRole("checkbox", { name: "Show cursor" }));
  expect(saved()?.visible).toBe(false);
});
it("disables click controls when the hook did not capture clicks and explains shapes", () => {
  render(<Harness clicks={false} />);
  expect(screen.getByRole("combobox", { name: "Click effect" })).toBeDisabled();
  expect(screen.getByRole("checkbox", { name: "Click bounce" })).toBeDisabled();
  expect(screen.getByText(/Pointer shapes were not recorded/)).toBeInTheDocument();
});
