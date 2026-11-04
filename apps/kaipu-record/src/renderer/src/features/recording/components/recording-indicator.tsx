import React from "react";
import { useTranslations } from "@kaipu/i18n";
import { formatElapsed } from "@renderer/features/recording/elapsed";
import styles from "./recording-indicator.module.css";
import type { UiAreaProps } from "@renderer/lib/ui-area";

interface RecordingIndicatorProps {
  /** Pulsing red while recording, steady amber while paused. */
  paused: boolean;
  /** Captured seconds so far (formatted to HH:MM:SS here). */
  elapsedSeconds: number;
  /** `bar` is the Record page's full-width header; `banner` is the compact Capture Panel pill. */
  variant: "bar" | "banner";
  ui?: UiAreaProps;
}

/**
 * Single source of truth for the "● Recording / Paused + timer" strip shown both
 * on the Record page and in the Capture Panel. The two only differ in chrome, so
 * the visual variant is a prop rather than two near-identical copies.
 */
export function RecordingIndicator({
  paused,
  elapsedSeconds,
  variant,
  ui,
}: RecordingIndicatorProps): React.JSX.Element {
  const t = useTranslations("record");
  return (
    <div {...ui} className={styles[variant]} data-paused={paused || undefined}>
      <span className={styles.dot} data-paused={paused || undefined} />
      <span className={styles.label}>{paused ? t("pausedState") : t("recordingState")}</span>
      <span className={styles.timer}>{formatElapsed(elapsedSeconds * 1000)}</span>
    </div>
  );
}
