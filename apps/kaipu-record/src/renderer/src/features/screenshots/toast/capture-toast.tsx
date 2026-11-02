import React, { useEffect, useState } from "react";
import { Check, CircleAlert, Copy, FolderOpen, PenLine, X } from "lucide-react";
import { useTranslations } from "@kaipu/i18n";
import type {
  CaptureMode,
  CaptureToastPayload,
  CaptureToastTimer,
} from "@shared/types/screenshot-capture";
import type { CaptureToastBridge } from "@shared/types/electron-api";
import { previewCardSize } from "@shared/capture-preview-layout";
import { detectKeyPlatform, type KeyPlatform } from "../overlay/overlay-keys";
import styles from "./capture-toast.module.css";

const MODE_KEY = {
  frame: "modeFrame",
  window: "modeWindow",
  screen: "modeScreen",
} as const satisfies Record<CaptureMode, string>;

interface CaptureToastProps {
  /** Injected by tests; the window's bridge otherwise. */
  api?: CaptureToastBridge;
  platform?: KeyPlatform;
}

/**
 * The bar's state: each running timer from main is a new `run` (the animation restarts from
 * full over `durationMs`); a stopped timer freezes the current run where it is.
 */
interface BarState {
  run: number;
  durationMs: number;
  running: boolean;
}

/**
 * Root of the capture preview card's window (`?window=capture-toast`, ADR 0042), shown by main
 * after every capture. The screenshot is the card. At rest it shows whether the shot was saved
 * and copied; on hover those states become buttons (Saved reveals the file, Save retries a
 * failed write, Copy copies) next to Edit and Close. A click on the image is Edit too. The card
 * only renders main's payload and reports presses and hover; main runs every action and owns
 * the auto-hide, which the bar at the bottom mirrors (`screenshot:toast-timer`).
 */
export function CaptureToast({
  api = window.electronAPI.captureToast,
  platform: platformProp,
}: CaptureToastProps): React.JSX.Element | null {
  const t = useTranslations("screenshots");
  const [payload, setPayload] = useState<CaptureToastPayload | null>(null);
  const [bar, setBar] = useState<BarState>({ run: 0, durationMs: 0, running: false });
  const platform = platformProp ?? detectKeyPlatform();

  useEffect(() => {
    const unsubscribeShow = api.onShow(setPayload);
    const unsubscribeTimer = api.onTimer(({ remainingMs }: CaptureToastTimer) =>
      setBar((previous) =>
        remainingMs === null
          ? { ...previous, running: false }
          : { run: previous.run + 1, durationMs: remainingMs, running: true },
      ),
    );
    // After subscribing: main sends the current payload in answer.
    api.ready();
    return () => {
      unsubscribeShow();
      unsubscribeTimer();
    };
  }, [api]);

  if (!payload) return null;

  const { imageHeight } = previewCardSize(payload.width, payload.height);
  const workspace = payload.workspace?.name ?? null;
  const pasteKey = platform === "mac" ? "⌘V" : "Ctrl+V";
  const fileApp = platform === "mac" ? "Finder" : "Explorer";

  return (
    <div className={styles.frame}>
      <div
        role="status"
        aria-label={t("toast.label")}
        className={styles.card}
        onPointerEnter={() => api.hover(true)}
        onPointerLeave={() => api.hover(false)}
      >
        <div className={styles.shot} style={{ height: imageHeight }}>
          <button
            type="button"
            className={styles.image}
            aria-label={t("toast.editImage")}
            onClick={() => api.action("edit")}
          >
            <img src={payload.thumbnail} alt="" draggable={false} />
            <span className={styles.edit} aria-hidden>
              <PenLine size={14} strokeWidth={2.2} />
              {t("toast.edit")}
            </span>
          </button>
          <button
            type="button"
            className={styles.close}
            aria-label={t("toast.dismiss")}
            onClick={() => api.action("dismiss")}
          >
            <X size={14} strokeWidth={2.4} aria-hidden />
          </button>
          <div className={styles.pills}>
            {payload.saved ? (
              <button
                type="button"
                className={styles.pill}
                aria-label={t("toast.revealIn", { app: fileApp })}
                onClick={() => api.action("reveal")}
              >
                <Check className={styles.ok} data-rest="" size={12} strokeWidth={3} aria-hidden />
                <FolderOpen
                  className={styles.ok}
                  data-hover=""
                  size={12}
                  strokeWidth={2.2}
                  aria-hidden
                />
                {t("toast.saved")}
              </button>
            ) : (
              <button
                type="button"
                className={styles.pill}
                aria-label={
                  workspace ? t("toast.saveTo", { name: workspace }) : t("toast.saveToLibrary")
                }
                onClick={() => api.action("save")}
              >
                <CircleAlert className={styles.warn} size={12} strokeWidth={2.4} aria-hidden />
                {t("toast.save")}
              </button>
            )}
            {payload.copied ? (
              <button
                type="button"
                className={styles.pill}
                aria-label={t("toast.copyAgain")}
                onClick={() => api.action("copy")}
              >
                <Check className={styles.ok} size={12} strokeWidth={3} aria-hidden />
                <span data-rest="">{t("toast.copiedWith", { key: pasteKey })}</span>
                <span data-hover="">{t("toast.copied")}</span>
              </button>
            ) : (
              <button
                type="button"
                className={styles.pill}
                data-hover-only=""
                aria-label={t("toast.copyAria")}
                onClick={() => api.action("copy")}
              >
                <Copy size={12} strokeWidth={2.2} aria-hidden />
                {t("toast.copy")}
              </button>
            )}
          </div>
        </div>
        <p className={styles.meta}>
          <span>
            {t("toast.meta", {
              width: payload.width,
              height: payload.height,
              mode: t(MODE_KEY[payload.mode]),
            })}
          </span>
          <span className={styles.where}>
            {payload.saved ? (workspace ?? "") : t("toast.notSaved")}
          </span>
        </p>
        <div className={styles.bar} aria-hidden>
          <i
            key={bar.run}
            data-run={bar.run > 0 ? "true" : "false"}
            data-running={bar.running ? "true" : "false"}
            style={{ animationDuration: `${bar.durationMs}ms` }}
          />
        </div>
      </div>
    </div>
  );
}
