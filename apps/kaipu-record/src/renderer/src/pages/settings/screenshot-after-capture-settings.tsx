import React from "react";
import { useTranslations } from "@kaipu/i18n";
import { Row } from "@kaipu/ui";
import { Select } from "@renderer/ui/select";
import { useAppSettings } from "./use-app-settings";
import { AppWideBadge } from "./scope/scope-controls";

/** App-wide Capture destination; explicit Copy never opens either surface. */
export function ScreenshotAfterCaptureSettings(): React.JSX.Element {
  const t = useTranslations("settings");
  const { settings, update } = useAppSettings();
  return (
    <Row
      label={t("screenshotAfterCapture")}
      description={t("screenshotAfterCaptureDescription")}
      action={
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <AppWideBadge />
          <Select
            aria-label={t("screenshotAfterCapture")}
            disabled={!settings}
            value={settings?.screenshotAfterCapture ?? "preview"}
            options={[
              { value: "preview", label: t("screenshotAfterCapturePreview") },
              { value: "editor", label: t("screenshotAfterCaptureEditor") },
            ]}
            onChange={(value) => {
              if (value === "preview" || value === "editor") {
                void update({ screenshotAfterCapture: value });
              }
            }}
          />
        </div>
      }
    />
  );
}
