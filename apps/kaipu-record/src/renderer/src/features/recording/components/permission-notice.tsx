import React from "react";
import { ShieldAlert } from "lucide-react";
import styles from "./permission-notice.module.css";
import type { UiAreaProps } from "@renderer/lib/ui-area";

interface PermissionNoticeProps {
  label: string;
  onOpenSettings: () => void;
  ui?: UiAreaProps;
}

/** Inline "permission is off" affordance that deep-links to System Settings. */
export function PermissionNotice({
  label,
  onOpenSettings,
  ui,
}: PermissionNoticeProps): React.JSX.Element {
  return (
    <div {...ui} className={styles.notice}>
      <ShieldAlert size={15} className={styles.icon} />
      <span className={styles.label}>{label}</span>
      <button type="button" className={styles.button} onClick={onOpenSettings}>
        Open Settings
      </button>
    </div>
  );
}
