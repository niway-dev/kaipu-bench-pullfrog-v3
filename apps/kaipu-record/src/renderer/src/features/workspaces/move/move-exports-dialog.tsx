import React from "react";
import { FolderInput } from "lucide-react";
import { useTranslations } from "@kaipu/i18n";
import {
  ModalActions,
  ModalButton,
  ModalIcon,
  ModalOverlay,
  ModalText,
  ModalTitle,
} from "@kaipu/ui";
import { useMoveUi } from "./move-store";

/**
 * "This recording has 2 exports in Work. Move them too?" (ADR 0033, decision 15): Move all 3
 * (primary) or Move only the recording. Mounted once, beside the workspaces provider.
 */
export function MoveExportsDialogHost(): React.JSX.Element | null {
  const t = useTranslations("move");
  const { prompt } = useMoveUi();
  if (!prompt) return null;
  const many = prompt.selected > 1;
  return (
    <ModalOverlay onCancel={() => prompt.answer(null)} labelledBy="move-exports-title">
      <ModalIcon tone="accent">
        <FolderInput size={20} strokeWidth={1.8} />
      </ModalIcon>
      <ModalTitle id="move-exports-title">{t("exportsTitle")}</ModalTitle>
      <ModalText>
        {t(many ? "exportsBodyMany" : "exportsBody", { count: prompt.count, name: prompt.source })}
      </ModalText>
      <ModalActions>
        <ModalButton variant="ghost" onClick={() => prompt.answer("only")}>
          {t(many ? "moveOnlySelection" : "moveOnlyRecording")}
        </ModalButton>
        <ModalButton variant="primary" onClick={() => prompt.answer("all")}>
          {t("moveAll", { count: prompt.count + prompt.selected })}
        </ModalButton>
      </ModalActions>
    </ModalOverlay>
  );
}
