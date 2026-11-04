import { WINDOW_KINDS, type WindowKind } from "@shared/ui-map";

/**
 * Which floating window (or the full app) this renderer was loaded as, from its query string:
 * `?mode=capture` is the tray panel, `?window=<kind>` any other window kind. `null` is the
 * full app, also for an unknown `window` value.
 */
export function windowKindFromSearch(search: string): WindowKind | null {
  const params = new URLSearchParams(search);
  const kind = params.get("window");
  const named = WINDOW_KINDS.find((k) => k === kind);
  if (named) return named;
  return params.get("mode") === "capture" ? "capture-panel" : null;
}
