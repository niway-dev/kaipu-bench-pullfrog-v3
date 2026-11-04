import React from "react";
import { NavLink, Outlet } from "react-router-dom";
import {
  AppWindow,
  Camera,
  Code,
  Folder,
  Monitor,
  Settings,
  SlidersHorizontal,
  Video,
} from "lucide-react";
import { useTranslations } from "@kaipu/i18n";
import { cx } from "@renderer/ui/cx";
import { ScopeDot, ScopeLegend, ScopeSelector } from "./scope/scope-controls";
import { SettingsScopeProvider } from "./scope/settings-scope";
import styles from "./settings-layout.module.css";
import { uiArea } from "@renderer/lib/ui-area";

type SettingsNavKey =
  | "general"
  | "permissions"
  | "recordingQuality"
  | "recording"
  | "screenshots"
  | "workspaces"
  | "app"
  | "developer";

const NAV: ReadonlyArray<{
  to: string;
  labelKey: SettingsNavKey;
  Icon: typeof Settings;
  /** The page holds settings a workspace may override (ADR 0034): it gets the blue dot. */
  perWorkspace?: boolean;
}> = [
  { to: "general", labelKey: "general", Icon: Settings },
  { to: "permissions", labelKey: "permissions", Icon: Monitor },
  {
    to: "recording-quality",
    labelKey: "recordingQuality",
    Icon: SlidersHorizontal,
    perWorkspace: true,
  },
  { to: "recording", labelKey: "recording", Icon: Video, perWorkspace: true },
  { to: "screenshots", labelKey: "screenshots", Icon: Camera, perWorkspace: true },
  { to: "workspaces", labelKey: "workspaces", Icon: Folder },
  { to: "app", labelKey: "app", Icon: AppWindow },
  // Dev-only page; `import.meta.env.DEV` is a build-time literal, so prod strips it.
  ...(import.meta.env.DEV ? [{ to: "developer", labelKey: "developer" as const, Icon: Code }] : []),
];

/**
 * Settings shell: a secondary nav on the left, the selected page on the right. Each page
 * surfaces only settings wired end to end (IPC + persistence); cloud account, save mode and
 * capacity live in their own rail section (/cloud), not here.
 */
export function SettingsLayout(): React.JSX.Element {
  return (
    <SettingsScopeProvider>
      <SettingsLayoutBody />
    </SettingsScopeProvider>
  );
}

function SettingsLayoutBody(): React.JSX.Element {
  const t = useTranslations("settings");
  return (
    <div className={styles.layout}>
      <nav {...uiArea("shell.settingsNav")} className={styles.nav} aria-label={t("title")}>
        <ScopeSelector />
        <ul className={styles.navList}>
          {NAV.map(({ to, labelKey, Icon, perWorkspace }) => (
            <li key={to}>
              <NavLink
                to={to}
                className={({ isActive }) => cx(styles.navItem, isActive && styles.navItemActive)}
              >
                <Icon size={16} strokeWidth={1.8} aria-hidden />
                {t(labelKey)}
                {perWorkspace && <ScopeDot />}
              </NavLink>
            </li>
          ))}
        </ul>
        <ScopeLegend />
        <p className={styles.navNote}>{t("navCloudNote")}</p>
      </nav>
      <div className={styles.content}>
        <Outlet />
      </div>
    </div>
  );
}
