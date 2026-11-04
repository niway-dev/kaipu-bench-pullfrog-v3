import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  EditorToolbar,
  EditorToolRail,
  toolForGroupClick,
  type EditorToolbarProps,
  type EditorToolRailProps,
} from "./editor-toolbar";

function renderToolbar(overrides: Partial<EditorToolbarProps> = {}): EditorToolbarProps {
  const props: EditorToolbarProps = {
    canUndo: true,
    canRedo: true,
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    onSplit: vi.fn(),
    splitDisabled: false,
    onDeleteSelected: vi.fn(),
    deleteDisabled: false,
    onAddImage: vi.fn(),
    onExport: vi.fn(),
    exportDisabled: false,
    ...overrides,
  };
  render(<EditorToolbar {...props} />);
  return props;
}

/** The drawing and camera tools now live in the vertical rail beside the preview. */
function renderRail(overrides: Partial<EditorToolRailProps> = {}): EditorToolRailProps {
  const props: EditorToolRailProps = {
    tool: "select",
    onToolChange: vi.fn(),
    onAddZoom: vi.fn(),
    privacyDisabled: false,
    onAddMute: vi.fn(),
    onToggleMuteAll: vi.fn(),
    audioMuted: false,
    ...overrides,
  };
  const view = render(<EditorToolRail {...props} />);
  rerenderRail = (next) => view.rerender(<EditorToolRail {...props} {...next} />);
  return props;
}
let rerenderRail: (next: Partial<EditorToolRailProps>) => void = () => {};

describe("EditorToolbar", () => {
  it("renders the six actions", () => {
    renderToolbar();
    for (const name of ["Undo", "Redo", "Add image", "Split here", "Delete segment", "Export"]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
  });

  it("fires onExport on click, and is disabled per exportDisabled", () => {
    const props = renderToolbar();
    fireEvent.click(screen.getByRole("button", { name: "Export" }));
    expect(props.onExport).toHaveBeenCalledOnce();

    renderToolbar({ exportDisabled: true });
    const exportButtons = screen.getAllByRole("button", { name: "Export" });
    expect(exportButtons[exportButtons.length - 1]).toBeDisabled();
  });

  it("the rail holds five tools: Select, Annotate, Zoom, Privacy and Audio", () => {
    renderRail();
    // Annotate shows its current variant (Box), Privacy its own (Blur), Audio its
    // own (Mute a section); the other variants are not separate buttons any more.
    const groups = [...document.querySelectorAll("[data-tool-group]")].map((el) =>
      el.getAttribute("data-tool-group"),
    );
    expect(groups).toEqual(["select", "annotate", "zoom", "privacy", "audio"]);
    for (const name of ["Select", "Box", "Zoom", "Blur", "Mute a section"]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
    expect(screen.queryByRole("button", { name: "Arrow" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Cover" })).toBeNull();
  });

  it("marks the groups that have variants, and only those", () => {
    renderRail();
    const marked = [...document.querySelectorAll("[data-variants]")].map((el) =>
      el.getAttribute("data-tool-group"),
    );
    expect(marked).toEqual(["annotate", "privacy", "audio"]);
  });

  it("highlights the active tool on its group's button", () => {
    renderRail({ tool: "arrow" });
    expect(screen.getByRole("button", { name: "Arrow" }).className).toMatch(/toolActive/);
    expect(screen.getByRole("button", { name: "Select" }).className).not.toMatch(/toolActive/);
  });

  it("a first click on Annotate arms its first variant", () => {
    const props = renderRail();
    fireEvent.click(screen.getByRole("button", { name: "Box" }));
    expect(props.onToolChange).toHaveBeenCalledWith("box");
  });

  it("a second click on the active Annotate cycles box → arrow → text → box", () => {
    const props = renderRail({ tool: "box" });
    fireEvent.click(screen.getByRole("button", { name: "Box" }));
    expect(props.onToolChange).toHaveBeenLastCalledWith("arrow");
    rerenderRail({ tool: "arrow" });
    fireEvent.click(screen.getByRole("button", { name: "Arrow" }));
    expect(props.onToolChange).toHaveBeenLastCalledWith("text");
    rerenderRail({ tool: "text" });
    fireEvent.click(screen.getByRole("button", { name: "Text" }));
    expect(props.onToolChange).toHaveBeenLastCalledWith("box");
  });

  it("remembers the last variant: back on Select, Annotate still shows Text and re-arms it", () => {
    const props = renderRail({ tool: "text" });
    rerenderRail({ tool: "select" });
    const annotate = screen.getByRole("button", { name: "Text" });
    expect(annotate.className).not.toMatch(/toolActive/);
    fireEvent.click(annotate);
    expect(props.onToolChange).toHaveBeenLastCalledWith("text");
  });
  it("fires the matching callback on click", () => {
    const props = renderToolbar();
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(props.onUndo).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Redo" }));
    expect(props.onRedo).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Split here" }));
    expect(props.onSplit).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Delete segment" }));
    expect(props.onDeleteSelected).toHaveBeenCalledOnce();
  });

  it("clicking Add image opens the hidden file input, and picking a file fires onAddImage", () => {
    const props = renderToolbar();
    const input = screen.getByTestId("slide-image-input") as HTMLInputElement;
    const clickSpy = vi.spyOn(input, "click");

    fireEvent.click(screen.getByRole("button", { name: "Add image" }));
    expect(clickSpy).toHaveBeenCalledOnce();

    const file = new File(["fake-bytes"], "slide.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [file] } });
    expect(props.onAddImage).toHaveBeenCalledWith(file);
    expect(input.value).toBe("");
  });

  it("disables buttons per props, and a disabled button fires no callback", () => {
    const props = renderToolbar({
      canUndo: false,
      canRedo: false,
      splitDisabled: true,
      deleteDisabled: true,
    });
    const undoBtn = screen.getByRole("button", { name: "Undo" });
    const redoBtn = screen.getByRole("button", { name: "Redo" });
    const splitBtn = screen.getByRole("button", { name: "Split here" });
    const deleteBtn = screen.getByRole("button", { name: "Delete segment" });

    expect(undoBtn).toBeDisabled();
    expect(redoBtn).toBeDisabled();
    expect(splitBtn).toBeDisabled();
    expect(deleteBtn).toBeDisabled();

    fireEvent.click(undoBtn);
    fireEvent.click(redoBtn);
    fireEvent.click(splitBtn);
    fireEvent.click(deleteBtn);
    expect(props.onUndo).not.toHaveBeenCalled();
    expect(props.onRedo).not.toHaveBeenCalled();
    expect(props.onSplit).not.toHaveBeenCalled();
    expect(props.onDeleteSelected).not.toHaveBeenCalled();
  });
});

describe("EditorToolRail — v2 camera group", () => {
  it("the Zoom button fires onAddZoom", () => {
    const props = renderRail();
    fireEvent.click(screen.getByRole("button", { name: "Zoom" }));
    expect(props.onAddZoom).toHaveBeenCalledTimes(1);
  });
});

describe("EditorToolbar — v2 tooltip shortcuts (PR 10 polish)", () => {
  it("appends the shortcut to every button with one, without changing its accessible name", () => {
    // The convention spans both pieces of the chrome since the tools moved into
    // the rail; rendering one would silently stop covering half the buttons.
    renderRail();
    renderToolbar();
    expect(screen.getByRole("button", { name: "Select" })).toHaveAttribute("title", "Select (V)");
    // A group with variants names the next one after the shortcut.
    expect(screen.getByRole("button", { name: "Box" })).toHaveAttribute(
      "title",
      "Box (R) · Click again for Arrow",
    );
    expect(screen.getByRole("button", { name: "Zoom" }).getAttribute("title")).toMatch(/\(Z\)$/);
    expect(screen.getByRole("button", { name: "Blur" })).toHaveAttribute(
      "title",
      "Blur (B) · Click again for Cover",
    );
    expect(screen.getByRole("button", { name: "Undo" })).toHaveAttribute("title", "Undo (⌘Z)");
    expect(screen.getByRole("button", { name: "Redo" })).toHaveAttribute("title", "Redo (⇧⌘Z)");
    expect(screen.getByRole("button", { name: "Split here" })).toHaveAttribute(
      "title",
      "Split here (S)",
    );
    expect(screen.getByRole("button", { name: "Delete segment" })).toHaveAttribute(
      "title",
      "Delete segment (⌫)",
    );
  });

  it("prints Windows key names, never macOS glyphs, when the bridge reports win32", () => {
    const api = window.electronAPI as { platform: string };
    const original = api.platform;
    api.platform = "win32";
    try {
      renderToolbar();
      expect(screen.getByRole("button", { name: "Undo" })).toHaveAttribute(
        "title",
        "Undo (Ctrl+Z)",
      );
      expect(screen.getByRole("button", { name: "Redo" })).toHaveAttribute(
        "title",
        "Redo (Ctrl+Shift+Z)",
      );
      expect(screen.getByRole("button", { name: "Delete segment" })).toHaveAttribute(
        "title",
        "Delete segment (Del)",
      );
    } finally {
      api.platform = original;
    }
  });
});

describe("EditorToolRail — v2 privacy tools", () => {
  it("arms Blur first, and a second click on the active group switches to Cover and back", () => {
    const props = renderRail();
    fireEvent.click(screen.getByRole("button", { name: "Blur" }));
    expect(props.onToolChange).toHaveBeenLastCalledWith("blur");
    rerenderRail({ tool: "blur" });
    fireEvent.click(screen.getByRole("button", { name: "Blur" }));
    expect(props.onToolChange).toHaveBeenLastCalledWith("cover");
    rerenderRail({ tool: "cover" });
    expect(screen.getByRole("button", { name: "Cover" })).toHaveAttribute(
      "title",
      "Cover (C) · Click again for Blur",
    );
    fireEvent.click(screen.getByRole("button", { name: "Cover" }));
    expect(props.onToolChange).toHaveBeenLastCalledWith("blur");
  });

  it("follows the keyboard: C from anywhere shows Cover on the Privacy button", () => {
    renderRail();
    rerenderRail({ tool: "cover" });
    const privacy = screen.getByRole("button", { name: "Cover" });
    expect(privacy).toHaveAttribute("data-tool-group", "privacy");
    expect(privacy.className).toMatch(/toolActive/);
  });

  it("disables them over a slide", () => {
    renderRail({ privacyDisabled: true });
    expect(screen.getByRole("button", { name: "Blur" })).toBeDisabled();
  });
});

describe("EditorToolRail — audio", () => {
  // Mute-a-section is an action and mute-everything a toggle, so neither is ever the
  // "active" tool a second click could cycle; the corner switch picks the variant.
  it("adds a muted section at the playhead", () => {
    const props = renderRail();
    fireEvent.click(screen.getByRole("button", { name: "Mute a section" }));
    expect(props.onAddMute).toHaveBeenCalledOnce();
    expect(props.onToggleMuteAll).not.toHaveBeenCalled();
  });

  it("the corner switch turns the Audio tool into mute-everything, and back", () => {
    const props = renderRail();
    fireEvent.click(
      screen.getByRole("button", { name: "Switch Audio to: Mute the whole recording" }),
    );
    const mute = screen.getByRole("button", { name: "Mute the whole recording" });
    expect(mute).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(mute);
    expect(props.onToggleMuteAll).toHaveBeenCalledOnce();
    expect(props.onAddMute).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Switch Audio to: Mute a section" }));
    expect(screen.getByRole("button", { name: "Mute a section" })).toBeInTheDocument();
  });

  it("opens on mute-everything, pressed, when the recording is already muted", () => {
    // The same control both states — a second button would let the two disagree.
    const props = renderRail({ audioMuted: true });
    const unmute = screen.getByRole("button", { name: "Unmute the recording" });
    expect(unmute).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(unmute);
    expect(props.onToggleMuteAll).toHaveBeenCalledOnce();
  });
});

describe("EditorToolRail — audio follows the recording's muted state", () => {
  it("switches to mute-everything, pressed, when the recording becomes muted (load, undo)", () => {
    renderRail();
    expect(screen.getByRole("button", { name: "Mute a section" })).toBeInTheDocument();
    rerenderRail({ audioMuted: true });
    expect(screen.getByRole("button", { name: "Unmute the recording" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});

describe("toolForGroupClick", () => {
  it("arms the remembered variant when the group is not active", () => {
    expect(toolForGroupClick("annotate", "select", "arrow")).toBe("arrow");
    expect(toolForGroupClick("privacy", "box", "cover")).toBe("cover");
  });

  it("cycles to the next variant when the group is already active", () => {
    expect(toolForGroupClick("annotate", "box", "box")).toBe("arrow");
    expect(toolForGroupClick("annotate", "text", "text")).toBe("box");
    expect(toolForGroupClick("privacy", "blur", "blur")).toBe("cover");
    expect(toolForGroupClick("privacy", "cover", "cover")).toBe("blur");
  });
});

describe("EditorToolRail — recorded cursor", () => {
  it("has no Cursor button when the recording cannot redraw its cursor", () => {
    renderRail();
    expect(screen.queryByRole("button", { name: "Cursor" })).toBeNull();
  });

  it("opens the cursor settings, and Select stops reading as active while they are open", () => {
    const onOpenCursor = vi.fn();
    renderRail({ tool: "select", onOpenCursor, cursorSelected: true });
    const cursor = screen.getByRole("button", { name: "Cursor" });
    expect(cursor).toHaveAttribute("aria-pressed", "true");
    expect(cursor.className).toMatch(/toolActive/);
    expect(screen.getByRole("button", { name: "Select" }).className).not.toMatch(/toolActive/);
    fireEvent.click(cursor);
    expect(onOpenCursor).toHaveBeenCalledOnce();
  });
});
