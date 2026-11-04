/**
 * Flows the app has that no image can show, because macOS draws them and `page.screenshot`
 * only draws a window's web contents (spec decision 15). The README lists them so a reader
 * knows they exist.
 */
export const NATIVE_NOT_CAPTURABLE: readonly { readonly title: string; readonly reason: string }[] =
  [
    {
      title: "Screenshot selector (Frame, Window, Screen)",
      reason: "the system `screencapture` selector draws it, not the app (ADR 0022)",
    },
    {
      title: "Permission dialogs",
      reason: "macOS's own prompts for screen recording, microphone, camera and accessibility",
    },
    {
      title: "Folder and file pickers",
      reason: "native dialogs: add a workspace, import a video, choose an export destination",
    },
    {
      title: "Menu-bar tray menu",
      reason: "a native menu; the panel it opens is under Floating windows (capturePanel)",
    },
    {
      title: "Traffic lights and window chrome",
      reason: "composited by macOS over the hidden title bar, outside the web contents",
    },
    {
      title: "Settings → Developer",
      reason: "a DEV-only page, absent from the production build the catalog runs",
    },
  ];
