import type { AreaId } from "@shared/ui-map";

/** The attribute props `uiArea` returns, for a component that forwards them to its root. */
export type UiAreaProps = { "data-ui-area": AreaId };

/**
 * Marks the root element of a screen or an area declared in `src/shared/ui-map.ts`.
 *
 * Spread it on the root: `<div {...uiArea("record.mic")}>`. It coexists with `data-testid`
 * and is never used for styling; the UI catalog locates and crops areas by this attribute
 * alone (ADR 0046). Pass a string literal so the coverage test can find it.
 */
export function uiArea(id: AreaId): UiAreaProps {
  return { "data-ui-area": id };
}
