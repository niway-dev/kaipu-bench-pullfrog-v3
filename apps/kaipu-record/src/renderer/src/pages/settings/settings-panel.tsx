import React from "react";
import type { OverridableKey } from "@shared/settings-scope";
import { ScopeLine, ScopeNotice, ScopedTitle, SectionBanner } from "./scope/scope-controls";
import styles from "./settings-page.module.css";

/**
 * One settings page: title, subtitle, then its titled sections. `scope` says whether the page's
 * settings change with the workspace (ADR 0034): a per-workspace page names whose values it
 * shows, says what the folder's own settings are doing, and counts what differs from the
 * default for the `keys` it holds.
 */
export function SettingsPanel({
  title,
  subtitle,
  scope,
  keys,
  children,
}: {
  title: string;
  subtitle: string;
  scope?: "workspace" | "global";
  keys?: readonly OverridableKey[];
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <h2 className={styles.pageTitle}>
          {scope ? <ScopedTitle scope={scope}>{title}</ScopedTitle> : title}
        </h2>
        <p className={styles.pageSubtitle}>{subtitle}</p>
        {scope === "workspace" && <ScopeLine />}
      </div>
      <div className={styles.sections}>
        {scope === "workspace" && <ScopeNotice />}
        {scope === "workspace" && keys && <SectionBanner keys={keys} />}
        {children}
      </div>
    </div>
  );
}

export function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className={styles.section}>
      <h3 className={styles.sectionTitle}>{title}</h3>
      <div className={styles.sectionBody}>{children}</div>
    </div>
  );
}
