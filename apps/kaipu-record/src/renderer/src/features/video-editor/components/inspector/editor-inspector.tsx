/**
 * The right-hand properties column. Picks the one panel that applies to the current
 * selection — never shows controls that do not apply (UI spec § 7). Every selection
 * kind resolves to a panel now (zoom, redaction, annotation — plus the annotation
 * defaults while a drawing tool is armed), and everything else falls through to the
 * Detection panel, so the column is never empty. Clip selections keep the timeline.
 */
import type { ReactNode } from "react";
import { useTranslations } from "@kaipu/i18n";
import type { EditorTool } from "../../annotations/video-tools";
import styles from "./editor-inspector.module.css";
import { uiArea } from "@renderer/lib/ui-area";

type HintKey = "hintSelect" | "hintBox" | "hintArrow" | "hintText" | "hintBlur" | "hintCover";

/** One line per tool (UI spec § 3.2). Exhaustive on purpose: a new EditorTool stops
 *  compiling until its hint exists. Zoom is an action, not a tool, so it has none here;
 *  its `hintZoom` copy is the rail button's title. */
const TOOL_HINT: Record<EditorTool, HintKey> = {
  select: "hintSelect",
  box: "hintBox",
  arrow: "hintArrow",
  text: "hintText",
  blur: "hintBlur",
  cover: "hintCover",
};

/**
 * The inspector's empty state (Kaipu Black, NIW2-619): with nothing selected, the first
 * line says what to do next — "Click a segment on the timeline to edit it." with Select,
 * or how to draw with a drawing tool. It replaces the hint row that sat above the
 * inspector, under the editor's actions.
 */
export function InspectorEmptyState({ tool }: { tool: EditorTool }): React.JSX.Element {
  const t = useTranslations("videoEditor");
  return (
    <p className={styles.empty} data-testid="inspector-empty">
      {t(TOOL_HINT[tool])}
    </p>
  );
}

export function EditorInspector({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <aside
      {...uiArea("editorVideo.inspector")}
      className={styles.column}
      data-testid="editor-inspector"
    >
      {children}
    </aside>
  );
}
