import { useTranslations } from "@kaipu/i18n";
import type { VideoSceneController } from "../../use-video-scene";
import { DEFAULT_CURSOR, type CursorSettings } from "../../cursor/cursor-model";
import { HistorySlider } from "../history-slider";
import styles from "./inspector.module.css";

export function CursorInspector({
  controller,
  clicksAvailable,
}: {
  controller: VideoSceneController;
  clicksAvailable: boolean;
}): React.JSX.Element {
  const t = useTranslations("videoEditor");
  const settings = controller.scene.cursor ?? DEFAULT_CURSOR;
  const change = (patch: Partial<CursorSettings>, live = false): void => {
    const scene = controller.scene;
    const next = { ...scene, cursor: { ...DEFAULT_CURSOR, ...scene.cursor, ...patch } };
    if (live) controller.updateLive(next);
    else controller.commit(next);
  };
  const toggle = (key: "visible" | "clickBounce" | "idleHide", label: string, disabled = false) => (
    <label className={styles.cursorToggle}>
      <input
        type="checkbox"
        checked={settings[key]}
        disabled={disabled}
        onChange={(e) => change({ [key]: e.target.checked })}
      />{" "}
      {label}
    </label>
  );
  return (
    <section className={styles.panel} aria-label={t("cursorTitle")}>
      <h2 className={styles.title}>{t("cursorTitle")}</h2>
      {toggle("visible", t("cursorVisible"))}
      <label className={styles.field}>
        {t("cursorStyle")}
        <select
          className={styles.fieldInput}
          aria-label={t("cursorStyle")}
          value={settings.style}
          onChange={(e) => change({ style: e.target.value as CursorSettings["style"] })}
        >
          <option value="arrow">{t("cursorArrow")}</option>
          <option value="dot">{t("cursorDot")}</option>
          <option value="spotlight">{t("cursorSpotlight")}</option>
        </select>
      </label>
      {(["size", "smoothing"] as const).map((key) => (
        <HistorySlider
          key={key}
          label={t(key === "size" ? "cursorSize" : "cursorSmoothing")}
          value={settings[key]}
          min={key === "size" ? 16 : 0}
          max={key === "size" ? 96 : 100}
          step={1}
          onBegin={controller.beginInteract}
          onLive={(v) => change({ [key]: v }, true)}
          onEnd={controller.endInteract}
          onCommit={(v) => change({ [key]: v })}
        />
      ))}
      <label className={styles.field}>
        {t("cursorClickEffect")}
        <select
          className={styles.fieldInput}
          aria-label={t("cursorClickEffect")}
          disabled={!clicksAvailable}
          value={settings.clickEffect}
          onChange={(e) => change({ clickEffect: e.target.value as CursorSettings["clickEffect"] })}
        >
          <option value="none">{t("cursorNone")}</option>
          <option value="circle">{t("cursorCircle")}</option>
          <option value="ripple">{t("cursorRipple")}</option>
        </select>
      </label>
      {toggle("clickBounce", t("cursorBounce"), !clicksAvailable)}
      {toggle("idleHide", t("cursorIdleHide"))}
      {!clicksAvailable && <p className={styles.note}>{t("clicksUnavailableHint")}</p>}
      <p className={styles.note}>{t("cursorShapeLimit")}</p>
      <p className={styles.note}>{t("cursorPrivacyNote")}</p>
    </section>
  );
}
