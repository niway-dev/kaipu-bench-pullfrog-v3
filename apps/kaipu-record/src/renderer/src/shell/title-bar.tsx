import React, { useContext } from "react";
import { KaipuLogo } from "@kaipu/brand";
import { WorkspaceSwitcher } from "@renderer/features/workspaces/workspace-switcher";
import { setHeaderEndElement } from "@renderer/features/workspaces/header-slot";
import { useOptionalWorkspaces } from "@renderer/features/workspaces/workspaces-context";
import { hostPlatform } from "@renderer/features/shortcuts/host-platform";
import { OnboardingContext } from "@renderer/features/onboarding/onboarding-context";
import styles from "./title-bar.module.css";

/**
 * The main window's title bar (NIW2-621), drawn by us in the space main frees with
 * `titleBarStyle` (see main/window-chrome.ts):
 *
 * - macOS: traffic lights · logo · "Kaipu Record" · workspace switcher
 * - Windows / Linux: logo · "Kaipu Record" · workspace switcher · native caption buttons
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
      <KaipuLogo use="product" size={20} />
      <span className={styles.name}>Kaipu Record</span>
      {showSwitcher && (
        <>
          <span className={styles.separator} aria-hidden>
            /
          </span>
          <div className={styles.interactive}>
            <WorkspaceSwitcher />
          </div>
          {/* A page that belongs to an item puts its "IN · Work ▾" chip here (header-slot). */}
          <div className={`${styles.end} ${styles.interactive}`} ref={setHeaderEndElement} />
        </>
      )}
    </header>
  );
}
