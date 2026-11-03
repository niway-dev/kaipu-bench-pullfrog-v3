/**
 * When a renderer's page is gone for good: a main-frame, cross-document navigation (a
 * reload, or a load of another page), the renderer process dying, or the webContents being
 * destroyed. The page that held a take, an export or a subscription never comes back to
 * end it, so main ends it here. An in-page route change (`isSameDocument`) and a subframe
 * navigation keep the page.
 */
export interface RendererContents {
  readonly id: number;
  removeListener?(event: string, fn: (...args: any[]) => void): unknown;
  on(event: "did-start-navigation", fn: (details: NavigationDetails) => void): unknown;
  on(event: "render-process-gone", fn: () => void): unknown;
  once(event: "destroyed", fn: () => void): unknown;
}

export interface NavigationDetails {
  isMainFrame: boolean;
  isSameDocument: boolean;
}

/** Calls `fn` every time the page `contents` shows is gone (it may run more than once). */
export function onPageGone(contents: RendererContents, fn: () => void): () => void {
  const navigation = (details: NavigationDetails) => {
    if (details.isMainFrame && !details.isSameDocument) fn();
  };
  contents.on("did-start-navigation", navigation);
  contents.on("render-process-gone", fn);
  contents.once("destroyed", fn);
  return () => {
    contents.removeListener?.("did-start-navigation", navigation);
    contents.removeListener?.("render-process-gone", fn);
    contents.removeListener?.("destroyed", fn);
  };
}
