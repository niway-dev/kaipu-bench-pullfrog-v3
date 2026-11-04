import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  EditorToolbar,
  EditorToolRail,
  groupClickAction,
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
    for (const name of ["Select", "Box", "Zoom", "Blur", "Audio"]) {
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

  it("a second click on the active Annotate opens the flyout and does not change the tool", () => {
    const props = renderRail({ tool: "box" });
    expect(screen.queryByRole("menu")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Box" }));
    expect(screen.getByRole("menu", { name: "Annotate" })).toBeInTheDocument();
    expect(props.onToolChange).not.toHaveBeenCalled();
  });

  it("a first click on an inactive group arms its variant and opens no flyout", () => {
    renderRail({ tool: "select" });
    fireEvent.click(screen.getByRole("button", { name: "Box" }));
    expect(screen.queryByRole("menu")).toBeNull();
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
      "Box (R) · Click again for all options",
    );
    expect(screen.getByRole("button", { name: "Zoom" }).getAttribute("title")).toMatch(/\(Z\)$/);
    expect(screen.getByRole("button", { name: "Blur" })).toHaveAttribute(
      "title",
      "Blur (B) · Click again for all options",
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
  it("arms Blur first; a second click opens a flyout where Cover is one pick away", () => {
    const props = renderRail();
    fireEvent.click(screen.getByRole("button", { name: "Blur" }));
    expect(props.onToolChange).toHaveBeenLastCalledWith("blur");
    rerenderRail({ tool: "blur" });
    fireEvent.click(screen.getByRole("button", { name: "Blur" }));
    const menu = screen.getByRole("menu", { name: "Privacy" });
    fireEvent.click(within(menu).getByRole("menuitemradio", { name: /Cover/ }));
    expect(props.onToolChange).toHaveBeenLastCalledWith("cover");
    expect(screen.queryByRole("menu")).toBeNull();
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
  // Mute-a-section and mute-everything are both actions: neither is a mode that stays
  // armed, so the Audio button always opens the flyout and the pick runs the action.
  it("opens a flyout with both actions; Mute a section adds a muted section", () => {
    const props = renderRail();
    fireEvent.click(screen.getByRole("button", { name: "Audio" }));
    const menu = screen.getByRole("menu", { name: "Audio" });
    expect(menu.querySelectorAll('[role^="menuitem"]')).toHaveLength(2);
    fireEvent.click(within(menu).getByRole("menuitem", { name: /Mute a section/ }));
    expect(props.onAddMute).toHaveBeenCalledOnce();
    expect(props.onToggleMuteAll).not.toHaveBeenCalled();
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("Mute the whole recording toggles the mute, and shows as checked when muted", () => {
    const props = renderRail();
    fireEvent.click(screen.getByRole("button", { name: "Audio" }));
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: /Mute the whole recording/ }));
    expect(props.onToggleMuteAll).toHaveBeenCalledOnce();
    expect(props.onAddMute).not.toHaveBeenCalled();
  });

  it("is pressed, and its flyout offers Unmute, when the recording is already muted", () => {
    const props = renderRail({ audioMuted: true });
    const audio = screen.getByRole("button", { name: "Audio" });
    expect(audio).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(audio);
    const unmute = screen.getByRole("menuitemcheckbox", { name: /Unmute the recording/ });
    expect(unmute).toHaveAttribute("aria-checked", "true");
    fireEvent.click(unmute);
    expect(props.onToggleMuteAll).toHaveBeenCalledOnce();
  });

  it("has no corner switch button any more", () => {
    renderRail();
    expect(screen.queryByRole("button", { name: /Switch Audio/ })).toBeNull();
  });
});

describe("EditorToolRail — audio follows the recording's muted state", () => {
  it("the Audio button turns pressed when the recording becomes muted (load, undo)", () => {
    renderRail();
    expect(screen.getByRole("button", { name: "Audio" })).toHaveAttribute("aria-pressed", "false");
    rerenderRail({ audioMuted: true });
    expect(screen.getByRole("button", { name: "Audio" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Audio" }).className).toMatch(/toolActive/);
  });
});

describe("EditorToolRail — flyout", () => {
  function openAnnotate(): { button: HTMLElement; menu: HTMLElement; props: EditorToolRailProps } {
    const props = renderRail({ tool: "arrow" });
    const button = screen.getByRole("button", { name: "Arrow" });
    button.focus();
    fireEvent.click(button);
    return { button, menu: screen.getByRole("menu", { name: "Annotate" }), props };
  }

  it("lists every variant with its label and shortcut, the current one marked", () => {
    const { menu } = openAnnotate();
    const items = within(menu).getAllByRole("menuitemradio");
    expect(items.map((i) => i.textContent)).toEqual(["BoxR", "ArrowA", "TextT"]);
    expect(items.map((i) => i.getAttribute("aria-checked"))).toEqual(["false", "true", "false"]);
    expect(items[1]!.className).toMatch(/flyoutCurrent/);
  });

  it("the Privacy flyout lists Blur (B) and Cover (C)", () => {
    renderRail({ tool: "blur" });
    fireEvent.click(screen.getByRole("button", { name: "Blur" }));
    const items = within(screen.getByRole("menu", { name: "Privacy" })).getAllByRole(
      "menuitemradio",
    );
    expect(items.map((i) => i.textContent)).toEqual(["BlurB", "CoverC"]);
  });

  it("picking a variant arms it, closes the flyout and returns focus to the button", () => {
    const { button, menu, props } = openAnnotate();
    fireEvent.click(within(menu).getByRole("menuitemradio", { name: /Text/ }));
    expect(props.onToolChange).toHaveBeenLastCalledWith("text");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(button).toHaveFocus();
  });

  it("closes on Escape without changing the tool, and focus returns to the button", () => {
    const { button, props } = openAnnotate();
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(props.onToolChange).not.toHaveBeenCalled();
    expect(button).toHaveFocus();
  });

  it("closes on a click outside", () => {
    openAnnotate();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("opens with the current variant focused; arrows move between options and wrap", () => {
    const { menu } = openAnnotate();
    const [box, arrow, text] = within(menu).getAllByRole("menuitemradio");
    expect(arrow).toHaveFocus();
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(text).toHaveFocus();
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(box).toHaveFocus();
    fireEvent.keyDown(menu, { key: "ArrowUp" });
    expect(text).toHaveFocus();
  });

  it("Enter on the focused option picks it", async () => {
    const { props } = openAnnotate();
    const user = userEvent.setup();
    await user.keyboard("{ArrowUp}{Enter}");
    expect(props.onToolChange).toHaveBeenLastCalledWith("box");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("clicking the button again closes the flyout", () => {
    const { button } = openAnnotate();
    fireEvent.click(button);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("the corner mark is a glyph, not a second button", () => {
    renderRail();
    // One button per tool, nothing extra over a corner: the mark is a pseudo-element.
    expect(screen.getAllByRole("button")).toHaveLength(5);
    expect(document.querySelectorAll("button button")).toHaveLength(0);
  });
});

describe("groupClickAction", () => {
  it("arms the remembered variant when the group is not active", () => {
    expect(groupClickAction("annotate", "select", "arrow")).toEqual({ kind: "arm", tool: "arrow" });
    expect(groupClickAction("privacy", "box", "cover")).toEqual({ kind: "arm", tool: "cover" });
  });

  it("opens the flyout when the group is already active", () => {
    expect(groupClickAction("annotate", "box", "box")).toEqual({ kind: "open" });
    expect(groupClickAction("privacy", "cover", "cover")).toEqual({ kind: "open" });
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
