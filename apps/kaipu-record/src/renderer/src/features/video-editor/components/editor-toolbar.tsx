import { useRef, useState } from "react";
import {
  ArrowUpRight,
  Download,
  Droplet,
  EyeOff,
  ImagePlus,
  Mouse,
  MousePointer2,
  Redo2,
  Scissors,
  Square,
  RectangleHorizontal,
  Trash2,
  Type,
  Undo2,
  Volume2,
  VolumeOff,
  VolumeX,
  ZoomIn,
} from "lucide-react";
import { useTranslations } from "@kaipu/i18n";
import {
  type EditorTool,
  isPrivacyTool,
  type PrivacyTool,
  type VideoTool,
} from "../annotations/video-tools";
import { formatAccelerator } from "@renderer/features/shortcuts/keyboard-accelerator";
import { isWindowsHost } from "@renderer/features/shortcuts/host-platform";
import styles from "./editor-toolbar.module.css";

/** Accepted image types for the "Add image" tool — matches SlideAssetStore's decode path. */
const SLIDE_IMAGE_TYPES = "image/png,image/jpeg,image/webp";

type ToolLabelKey = "toolSelect" | "toolBox" | "toolArrow" | "toolText";

/** Blur uses the screenshot editor's Droplet on purpose (UI spec § 3.1: same icon, same behavior). */
const PRIVACY_META: Record<
  PrivacyTool,
  { labelKey: "toolBlur" | "toolCover"; Icon: typeof Square }
> = {
  blur: { labelKey: "toolBlur", Icon: Droplet },
  cover: { labelKey: "toolCover", Icon: RectangleHorizontal },
};

const TOOL_META: Record<VideoTool, { labelKey: ToolLabelKey; Icon: typeof Square }> = {
  select: { labelKey: "toolSelect", Icon: MousePointer2 },
  box: { labelKey: "toolBox", Icon: Square },
  arrow: { labelKey: "toolArrow", Icon: ArrowUpRight },
  text: { labelKey: "toolText", Icon: Type },
};

/**
 * One-letter shortcuts (plans/video-editor-v2/08 § PR 10 polish). Plain keyboard
 * symbols, not prose — same treatment as the done-step's literal "⌘⇧P" — so they are
 * not i18n keys; every button's `title` appends "(<key>)" to its translated label.
 * The page's key handler (toolForShortcut) binds the same letters to the same tools,
 * straight to the variant, whatever the group's button currently shows.
 */
const TOOL_SHORTCUT: Record<EditorTool, string> = {
  select: "V",
  box: "R",
  arrow: "A",
  text: "T",
  blur: "B",
  cover: "C",
};
const ZOOM_SHORTCUT = "Z";
const SPLIT_SHORTCUT = "S";

/**
 * The drawing modes that share one rail button (Kaipu Black, NIW2-619). The button
 * shows its group's current variant; a second click on the active group moves to the
 * next one, in this order.
 */
export const TOOL_GROUPS = {
  annotate: ["box", "arrow", "text"],
  privacy: ["blur", "cover"],
} as const satisfies Record<string, readonly EditorTool[]>;
export type ToolGroup = keyof typeof TOOL_GROUPS;

function variantsOf(group: ToolGroup): readonly EditorTool[] {
  return TOOL_GROUPS[group];
}

/**
 * What a click on a group's button arms. A group that is not active arms the variant
 * it shows (`remembered`: the last one used, or the first); the active group cycles to
 * its next variant. Pure and exported so the policy is testable on its own.
 */
export function toolForGroupClick(
  group: ToolGroup,
  current: EditorTool,
  remembered: EditorTool,
): EditorTool {
  const variants = variantsOf(group);
  const at = variants.indexOf(current);
  if (at === -1) return remembered;
  return variants[(at + 1) % variants.length]!;
}

function nextVariant(group: ToolGroup, tool: EditorTool): EditorTool {
  const variants = variantsOf(group);
  return variants[(variants.indexOf(tool) + 1) % variants.length]!;
}

/** The Audio tool's two jobs. Neither is a drawing mode, so there is no "active" Audio
 *  tool for a second click to cycle; the corner switch picks the variant instead. */
type AudioVariant = "muteSection" | "muteAll";

/**
 * Undo/redo/delete as the host prints them: "⌘Z" / "⌘⇧Z" / "⌫" on macOS, and
 * "Ctrl+Z" / "Ctrl+Shift+Z" / "Del" on Windows. These match the page's key handler
 * (Cmd-or-Ctrl+Z, plus Shift for redo; Delete or Backspace), which binds no Ctrl+Y.
 */
function editShortcuts(): { undo: string; redo: string; remove: string } {
  return {
    undo: formatAccelerator("CommandOrControl+Z"),
    redo: formatAccelerator("CommandOrControl+Shift+Z"),
    remove: isWindowsHost() ? "Del" : "⌫",
  };
}

export interface EditorToolbarProps {
  canUndo: boolean;
  canRedo: boolean;
  onUndo(): void;
  onRedo(): void;
  /** Split the clip under the playhead. Disabled when the playhead isn't inside a clip. */
  onSplit(): void;
  splitDisabled: boolean;
  /** Delete the selected segment. Disabled when nothing is selected. */
  onDeleteSelected(): void;
  deleteDisabled: boolean;
  /** Insert an image slide at the playhead's nearest item boundary. */
  onAddImage(file: File): void;
  /** Run the export pipeline. Disabled while exporting or when the timeline is empty. */
  onExport(): void;
  /** Status chips (the original-untouched pill, the autosave state), between the
   *  actions and Export. */
  children?: React.ReactNode;
  exportDisabled: boolean;
}

/**
 * The tools, as one 44 px column to the right of the preview (NIW2-611 put it there;
 * Kaipu Black, NIW2-619, folds it into five tools):
 *
 * Select · Annotate (box, arrow, text) · Zoom · Privacy (blur, cover) · Audio (mute a
 * section, mute everything)
 *
 * A group's button shows its current variant's icon and a corner mark that it has
 * more. The webcam and cursor buttons follow, below a rule, only for a recording that
 * has a webcam or a redrawable cursor.
 */
export interface EditorToolRailProps {
  /** Silence a stretch of audio at the playhead. */
  onAddMute(): void;
  /** Silence the whole recording; the export then drops the audio track. */
  onToggleMuteAll(): void;
  audioMuted: boolean;
  /** Current tool (annotation or privacy). */
  tool: EditorTool;
  onToolChange(tool: EditorTool): void;
  /** Add a zoom at the playhead, or select the one already there (video-editor v2). */
  onAddZoom(): void;
  /** Blur/Cover need footage: disabled while the playhead is on a slide. */
  privacyDisabled: boolean;
  /** "Hide webcam here" (ADR 0038). Absent for a recording without a webcam: no button. */
  onHideWebcam?(): void;
  /** Open the recorded cursor's settings. Absent when the recording cannot redraw its
   *  cursor (it is baked into the video): no button. */
  onOpenCursor?(): void;
  /** The cursor's settings are open; the Select tool then shows as not active. */
  cursorSelected?: boolean;
}

function toolLabelKey(tool: EditorTool): ToolLabelKey | "toolBlur" | "toolCover" {
  return isPrivacyTool(tool) ? PRIVACY_META[tool].labelKey : TOOL_META[tool].labelKey;
}

function toolIcon(tool: EditorTool): typeof Square {
  return isPrivacyTool(tool) ? PRIVACY_META[tool].Icon : TOOL_META[tool].Icon;
}

export function EditorToolRail({
  tool,
  onToolChange,
  onAddZoom,
  privacyDisabled,
  onAddMute,
  onToggleMuteAll,
  audioMuted,
  onHideWebcam,
  onOpenCursor,
  cursorSelected = false,
}: EditorToolRailProps): React.JSX.Element {
  const t = useTranslations("videoEditor");
  // The variant each group shows while another tool is active: the last one used.
  // Updated during render (React's "store information from previous renders"), so a
  // tool armed from the keyboard shows on its group's button on the same paint.
  const [remembered, setRemembered] = useState<Record<ToolGroup, EditorTool>>({
    annotate: "box",
    privacy: "blur",
  });
  for (const group of Object.keys(TOOL_GROUPS) as ToolGroup[]) {
    if (variantsOf(group).includes(tool) && remembered[group] !== tool) {
      setRemembered({ ...remembered, [group]: tool });
    }
  }
  const [audio, setAudio] = useState<AudioVariant>(audioMuted ? "muteAll" : "muteSection");
  // When the recording becomes muted (a session that loads muted, an undo), show the
  // pressed mute-everything variant: otherwise nothing on the rail says it is muted.
  const [wasMuted, setWasMuted] = useState(audioMuted);
  if (audioMuted !== wasMuted) {
    setWasMuted(audioMuted);
    if (audioMuted) setAudio("muteAll");
  }

  const groupButton = (group: ToolGroup, disabled = false): React.JSX.Element => {
    const active = variantsOf(group).includes(tool);
    const shown = active ? tool : remembered[group];
    const Icon = toolIcon(shown);
    const label = t(toolLabelKey(shown));
    const next = t(toolLabelKey(nextVariant(group, shown)));
    return (
      <button
        type="button"
        data-tool-group={group}
        data-variants={variantsOf(group).length}
        title={`${label} (${TOOL_SHORTCUT[shown]}) · ${t("toolCycle", { next })}`}
        aria-label={label}
        aria-pressed={active}
        disabled={disabled}
        className={`${styles.tool} ${active ? styles.toolActive : ""}`}
        onClick={() => onToolChange(toolForGroupClick(group, tool, remembered[group]))}
      >
        <Icon size={19} />
      </button>
    );
  };

  const audioLabel =
    audio === "muteSection" ? t("toolMute") : audioMuted ? t("toolUnmuteAll") : t("toolMuteAll");
  const otherAudio: AudioVariant = audio === "muteSection" ? "muteAll" : "muteSection";
  const otherAudioLabel = otherAudio === "muteSection" ? t("toolMute") : t("toolMuteAll");

  return (
    <div className={styles.rail} role="toolbar" aria-orientation="vertical">
      <button
        type="button"
        data-tool-group="select"
        title={`${t("toolSelect")} (${TOOL_SHORTCUT.select})`}
        aria-label={t("toolSelect")}
        className={`${styles.tool} ${tool === "select" && !cursorSelected ? styles.toolActive : ""}`}
        onClick={() => onToolChange("select")}
      >
        <MousePointer2 size={19} />
      </button>
      {groupButton("annotate")}
      {/* Zoom is an ACTION, not a drawing mode: it adds a zoom at the playhead (or
          selects the one there) and the camera box on the preview re-aims it. */}
      <button
        type="button"
        data-tool-group="zoom"
        title={`${t("hintZoom")} (${ZOOM_SHORTCUT})`}
        aria-label={t("toolZoom")}
        className={styles.tool}
        onClick={onAddZoom}
      >
        <ZoomIn size={19} />
      </button>
      {groupButton("privacy", privacyDisabled)}
      <div className={styles.toolSlot}>
        <button
          type="button"
          data-tool-group="audio"
          data-variants={2}
          title={audio === "muteSection" ? t("hintMute") : audioLabel}
          aria-label={audioLabel}
          aria-pressed={audio === "muteAll" ? audioMuted : undefined}
          className={`${styles.tool} ${audio === "muteAll" && audioMuted ? styles.toolActive : ""}`}
          onClick={audio === "muteSection" ? onAddMute : onToggleMuteAll}
        >
          {audio === "muteSection" ? (
            <VolumeX size={19} />
          ) : audioMuted ? (
            <VolumeOff size={19} />
          ) : (
            <Volume2 size={19} />
          )}
        </button>
        <button
          type="button"
          className={styles.variantSwitch}
          title={t("audioCycle", { next: otherAudioLabel })}
          aria-label={t("audioCycle", { next: otherAudioLabel })}
          onClick={() => setAudio(otherAudio)}
        />
      </div>
      {(onHideWebcam || onOpenCursor) && <span className={styles.railSeparator} aria-hidden />}
      {/* An action like Zoom: a hidden webcam section from the playhead on. */}
      {onHideWebcam && (
        <button
          type="button"
          title={t("hintHideWebcam")}
          aria-label={t("webcamHideHere")}
          className={styles.tool}
          onClick={onHideWebcam}
        >
          <EyeOff size={19} />
        </button>
      )}
      {/* The recorded pointer, redrawn by the editor. A mouse, not an arrow, so it never
          reads as a second Select tool. */}
      {onOpenCursor && (
        <button
          type="button"
          title={t("hintCursor")}
          aria-label={t("cursorTitle")}
          aria-pressed={cursorSelected}
          className={`${styles.tool} ${cursorSelected ? styles.toolActive : ""}`}
          onClick={onOpenCursor}
        >
          <Mouse size={19} />
        </button>
      )}
    </div>
  );
}

/**
 * Undo/redo, image, split and delete, the status chips and Export: the editor's
 * actions, in one row. The page renders it into the title bar's right side (Kaipu
 * Black, NIW2-619); it used to be a card above the inspector (NIW2-611).
 */
export function EditorToolbar({
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onSplit,
  splitDisabled,
  onDeleteSelected,
  deleteDisabled,
  onAddImage,
  onExport,
  children,
  exportDisabled,
}: EditorToolbarProps): React.JSX.Element {
  const t = useTranslations("videoEditor");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const shortcuts = editShortcuts();

  return (
    <div className={styles.toolbar}>
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.iconBtn}
          title={`${t("undo")} (${shortcuts.undo})`}
          aria-label={t("undo")}
          disabled={!canUndo}
          onClick={onUndo}
        >
          <Undo2 size={18} />
        </button>
        <button
          type="button"
          className={styles.iconBtn}
          title={`${t("redo")} (${shortcuts.redo})`}
          aria-label={t("redo")}
          disabled={!canRedo}
          onClick={onRedo}
        >
          <Redo2 size={18} />
        </button>
        <span className={styles.divider} />
        <input
          ref={fileInputRef}
          type="file"
          data-testid="slide-image-input"
          accept={SLIDE_IMAGE_TYPES}
          className={styles.hiddenInput}
          onChange={(event) => {
            const file = event.target.files?.[0];
            // Reset so choosing the same file again still fires a change event.
            event.target.value = "";
            if (file) onAddImage(file);
          }}
        />
        <button
          type="button"
          className={styles.iconBtn}
          title={t("addImage")}
          aria-label={t("addImage")}
          onClick={() => fileInputRef.current?.click()}
        >
          <ImagePlus size={18} />
        </button>
        <button
          type="button"
          className={styles.iconBtn}
          title={`${t("splitHere")} (${SPLIT_SHORTCUT})`}
          aria-label={t("splitHere")}
          disabled={splitDisabled}
          onClick={onSplit}
        >
          <Scissors size={18} />
        </button>
        <button
          type="button"
          className={styles.iconBtn}
          title={`${t("deleteSegment")} (${shortcuts.remove})`}
          aria-label={t("deleteSegment")}
          disabled={deleteDisabled}
          onClick={onDeleteSelected}
        >
          <Trash2 size={18} />
        </button>
      </div>
      {children && <div className={styles.status}>{children}</div>}
      <button
        type="button"
        className={styles.exportBtn}
        disabled={exportDisabled}
        onClick={onExport}
      >
        <Download size={16} />
        {t("export")}
      </button>
    </div>
  );
}
