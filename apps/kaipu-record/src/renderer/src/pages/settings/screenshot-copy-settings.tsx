import React from "react";
import { useTranslations } from "@kaipu/i18n";
import { Toggle } from "@kaipu/ui";
import { OverrideRow } from "./scope/scope-controls";

/**
 * Auto-copy vs explicit Copy for screenshots — AppSettings.screenshotCopy, which a workspace may
 * override (ADR 0034). Deliberately independent of the save toggle above it: a capture can be
 * kept, or pasted, or both, or neither, and the editor honours all four.
 */
export function ScreenshotCopySettings(): React.JSX.Element {
  const t = useTranslations("settings");
  return (
    <OverrideRow
      settingKey="screenshotCopy"
      fallback="auto"
      label={t("screenshotCopy")}
      description={t("screenshotCopyDescription")}
      control={({ value, onChange, disabled }) => (
        <Toggle
          aria-label={t("screenshotCopy")}
          checked={value === "auto"}
          disabled={disabled}
          onChange={(checked) => onChange(checked ? "auto" : "manual")}
        />
      )}
    />
  );
}
