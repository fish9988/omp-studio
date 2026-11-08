// 输入框工具栏的「✨ 优化提示词」按钮：调用主进程 enhancePrompt（复用配置的辅助 LLM 与思考强度），
// 将口语化草稿重写为结构化工程提示词，并支持一键还原原草稿。
import { useState } from "react";
import type { TaskId } from "../../../../shared/ipc.ts";
import { useT } from "../../i18n/use-t.ts";
import { reportError } from "../../ui/errors.ts";
import { pushToast } from "../dialogs/toast-store.ts";
import { setDraftText } from "./draft-store.ts";

function SparkleIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg
      className={spinning ? "enhance-sparkle is-spinning" : "enhance-sparkle"}
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M8 1.5l1.6 4.1 4.1 1.6-4.1 1.6L8 12.9 6.4 8.8 2.3 7.2l4.1-1.6L8 1.5z" />
      <path d="M13 11.5l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6.6-1.4z" />
    </svg>
  );
}

export function EnhancePromptButton({
  draftKey,
  text,
  taskId,
  disabled = false,
  onFocusField,
}: {
  draftKey: TaskId;
  text: string;
  taskId: TaskId | null;
  disabled?: boolean;
  onFocusField?: () => void;
}) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [backup, setBackup] = useState<{ original: string; enhanced: string } | null>(null);

  const hasText = text.trim().length > 0;
  const canUndo = backup !== null && text === backup.enhanced;

  const onEnhance = async () => {
    if (busy || !hasText || disabled) return;
    const original = text;
    setBusy(true);
    try {
      const enhanced = await window.studio.enhancePrompt(original, taskId);
      if (enhanced && enhanced.trim() !== "") {
        setDraftText(draftKey, enhanced);
        setBackup({ original, enhanced });
        pushToast({ level: "info", message: t("composer.enhanceDone") });
        onFocusField?.();
      }
    } catch (error) {
      reportError(t, error);
    } finally {
      setBusy(false);
    }
  };

  const onUndo = () => {
    if (!backup) return;
    setDraftText(draftKey, backup.original);
    setBackup(null);
    onFocusField?.();
  };

  return (
    <span className="enhance-prompt-group" data-testid="enhance-prompt-group">
      {canUndo && (
        <button
          type="button"
          className="ui-chip enhance-undo-btn"
          title={t("composer.enhanceUndoTip")}
          onClick={onUndo}
          data-testid="enhance-prompt-undo"
        >
          <span>{t("composer.enhanceUndo")}</span>
        </button>
      )}
      <button
        type="button"
        className="ui-chip enhance-prompt-btn"
        disabled={busy || !hasText || disabled}
        title={t("composer.enhanceTip")}
        aria-label={t("composer.enhance")}
        onClick={() => void onEnhance()}
        data-busy={busy ? "" : undefined}
        data-testid="enhance-prompt-btn"
      >
        <SparkleIcon spinning={busy} />
      </button>
    </span>
  );
}
