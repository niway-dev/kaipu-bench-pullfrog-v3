import React, { useContext } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { KaipuLogo } from "@kaipu/brand";
import { useTranslations } from "@kaipu/i18n";
import { WorkspaceSwitcher } from "@renderer/features/workspaces/workspace-switcher";
import {
  setHeaderActionsElement,
  setHeaderEndElement,
} from "@renderer/features/workspaces/header-slot";
import { useOptionalWorkspaces } from "@renderer/features/workspaces/workspaces-context";
import { hostPlatform } from "@renderer/features/shortcuts/host-platform";
import { OnboardingContext } from "@renderer/features/onboarding/onboarding-context";
import { toggleSidebarMode } from "./sidebar-mode-snapshot";
import { sidebarToggleHint, useSidebarToggle } from "./use-sidebar-mode";
import styles from "./title-bar.module.css";

/**
 * The main window's title bar (NIW2-621), drawn by us in the space main frees with
 * `titleBarStyle` (see main/window-chrome.ts):
 *
 * - macOS: traffic lights · logo · sidebar toggle · "Kaipu Record" · workspace switcher … page
 *   actions · item chip
 * - Windows / Linux: logo · sidebar toggle · "Kaipu Record" · workspace switcher … page
 *   actions · item chip · native caption buttons
 *
 * The OS draws its controls over this bar, so the bar only leaves their side empty: a fixed
 * inset for the traffic lights, `env(titlebar-area-*)` for the Windows overlay. The bar drags
 * the window; anything clickable in it opts out with `no-drag`.
 *
 * `workspace` is false where there is no workspace to switch (the sign-in page, the error
 * screen); the bar still draws, so the window keeps a handle to drag it by. Onboarding sits
 * below the bar and hides the switcher too: its menu would open under the takeover.
 */
export function TitleBar({ workspace = true }: { workspace?: boolean }): React.JSX.Element {
  const workspaces = useOptionalWorkspaces();
  const onboarding = useContext(OnboardingContext)?.isOpen ?? false;
  const showSwitcher = workspace && workspaces !== null && !onboarding;
  return (
    <header className={styles.bar} data-platform={hostPlatform()}>
      <KaipuLogo use="product" size={28} />
      <SidebarToggle />
      <span className={styles.name}>Kaipu Record</span>
      {showSwitcher && (
        <>
          <span className={styles.separator} aria-hidden>
            /
          </span>
          <div className={styles.interactive}>
            <WorkspaceSwitcher />
          </div>
          {/* A page's own actions, right-aligned (the video editor's, NIW2-619), then the
              "IN · Work ▾" chip of a page that belongs to an item (header-slot). */}
          <div
            className={`${styles.actions} ${styles.interactive}`}
            ref={setHeaderActionsElement}
          />
          <div className={`${styles.end} ${styles.interactive}`} ref={setHeaderEndElement} />
        </>
      )}
    </header>
  );
}

/**
 * Collapse or expand the rail (NIW2-626), beside the logo where the owner wants it. Drawn only
 * while a rail is on screen, and never part of the crowded-bar collapse rules below: it is the
 * way to make room. Names what it will do; the title carries the shortcut.
 */
function SidebarToggle(): React.JSX.Element | null {
  const t = useTranslations("nav");
  const { mode, shown } = useSidebarToggle();
  if (!shown || !mode) return null;
  const collapse = mode === "stacked";
  const label = t(collapse ? "sidebarCollapse" : "sidebarExpand");
  const Icon = collapse ? PanelLeftClose : PanelLeftOpen;
  return (
    <div className={styles.interactive}>
      <button
        type="button"
        className={styles.sidebarToggle}
        aria-label={label}
        title={`${label} (${sidebarToggleHint(window.electronAPI.platform)})`}
        onClick={toggleSidebarMode}
      >
        <Icon size={16} strokeWidth={1.8} aria-hidden />
      </button>
    </div>
  );
}
