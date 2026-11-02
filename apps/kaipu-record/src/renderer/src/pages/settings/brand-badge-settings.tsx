import React from "react";
import { useTranslations } from "@kaipu/i18n";
import { Toggle } from "@kaipu/ui";
import { OverrideRow } from "./scope/scope-controls";

/**
 * Opt-in "Made with Kaipu" mark on new recordings — AppSettings.showBrandBadge. Off until the
 * user turns it on: the free app ships no watermark (backlog/free-tier-no-watermark), so this
 * is a signature, not a plan gate. A workspace may override it (ADR 0034): a work workspace
 * with no mark on client videos, a personal one that keeps it.
 */
export function BrandBadgeSettings(): React.JSX.Element {
  const t = useTranslations("settings");
  return (
    <OverrideRow
      settingKey="showBrandBadge"
      fallback={false}
      label={t("brandBadge")}
      description={t("brandBadgeDescription")}
      control={({ value, onChange, disabled }) => (
        <Toggle
          aria-label={t("brandBadge")}
          checked={value}
          disabled={disabled}
          onChange={onChange}
        />
      )}
    />
  );
}
