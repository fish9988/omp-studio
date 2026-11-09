// 用户消息气泡右下角的操作栏与原位编辑框（复刻 dsh-claude-style features/message-actions）：
// 鼠标悬停在任意一轮用户消息（如第 10 轮中的第 5 轮）上时，在气泡右下方显示：
//   · ↩ 撤回回退：就地回退到该轮之前（该轮及后续所有轮次清除），并将该轮原文放回底部输入框；
//   · ✎ 编辑重发：将该气泡原位切换为编辑框（取消 / 保存并发送），保存后自动砍掉后续轮次并重发修改后的消息；
//   · 🔀 从此分叉：保留原会话不动，从该轮之前复制历史新建分叉会话。
import { useState } from "react";
import type { TaskId } from "../../../../shared/ipc.ts";
import { userCardFromEnd } from "../../../../shared/tsp/session-tree.ts";
import { currentLocale } from "../../store/settings-store.ts";
import { useTaskIdle } from "../../store/tasks-store.ts";
import { Branch, Pencil } from "../../icons.tsx";
import { reportErrorNow } from "../../ui/errors.ts";
import { branchToNode, forkFromMessage } from "../conversation/fork-actions.ts";
import { focusIndexFromEnd } from "../conversation/tree-focus.ts";
import { pushToast } from "../dialogs/toast-store.ts";
import { peekTspDocument, peekTspNode } from "./tsp-store.ts";

async function resolveUserEntryId(taskId: TaskId, sf: string, cardId: string): Promise<string | null> {
  const doc = peekTspDocument(taskId);
  const fromEnd = doc === null ? null : userCardFromEnd(doc, sf, cardId);
  if (fromEnd === null) return null;
  const { nodes } = await window.studio.getSessionTree(taskId);
  const idx = focusIndexFromEnd(nodes, fromEnd);
  return idx !== null ? (nodes[idx]?.entryId ?? null) : null;
}

export function readUserCardText(taskId: TaskId, sf: string, cardId: string): string {
  const card = peekTspNode(taskId, sf, cardId);
  if (!card) return "";
  for (const cid of card.c) {
    const child = peekTspNode(taskId, sf, cid);
    if (child?.k === "md" && typeof child.p["text"] === "string") {
      return child.p["text"];
    }
  }
  return "";
}

export function UserMessageActions({
  taskId,
  sf,
  cardId,
  editing,
  rawView = false,
  onToggleRawView,
  onStartEdit,
  onCloseEdit,
}: {
  taskId: TaskId;
  sf: string;
  cardId: string;
  editing: boolean;
  rawView?: boolean | undefined;
  onToggleRawView?: (() => void) | undefined;
  onStartEdit(initialText: string): void;
  onCloseEdit(): void;
}) {
  const idle = useTaskIdle(taskId);
  const [busy, setBusy] = useState(false);
  const zh = currentLocale() === "zh-CN";

  if (editing) return null;

  const guardBusy = (): boolean => {
    if (!idle) {
      pushToast({
        level: "info",
        message: zh ? "当前轮次还在运行，请等停止后再回退或编辑" : "Wait for the current turn to finish first",
      });
      return false;
    }
    return !busy;
  };

  const onRetract = async () => {
    if (!guardBusy()) return;
    setBusy(true);
    try {
      const entryId = await resolveUserEntryId(taskId, sf, cardId);
      if (entryId === null) return;
      await branchToNode(taskId, entryId);
      pushToast({
        level: "info",
        message: zh ? "已回退到此轮，原文已放回输入框" : "Rewound; message restored to composer",
      });
    } catch (error) {
      reportErrorNow(error);
    } finally {
      setBusy(false);
    }
  };

  const onEditClick = () => {
    if (!guardBusy()) return;
    const text = readUserCardText(taskId, sf, cardId);
    onStartEdit(text);
    void onCloseEdit;
  };

  const onFork = async () => {
    if (!guardBusy()) return;
    setBusy(true);
    try {
      const entryId = await resolveUserEntryId(taskId, sf, cardId);
      if (entryId === null) return;
      await forkFromMessage(taskId, entryId);
    } catch (error) {
      reportErrorNow(error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="tsp-user-actions" data-testid="user-message-actions">
      {onToggleRawView !== undefined && (
        <button
          type="button"
          className="tsp-user-action-btn"
          aria-pressed={rawView}
          title={
            rawView
              ? zh
                ? "切换为 Markdown 渲染视图"
                : "Show rendered Markdown view"
              : zh
                ? "查看原始纯文本（保留标签与符号）"
                : "Show raw plain text"
          }
          aria-label={rawView ? (zh ? "切换为渲染视图" : "Rendered view") : zh ? "查看原文" : "Raw text"}
          onClick={onToggleRawView}
          data-testid="user-msg-raw-toggle"
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            {rawView ? (
              <>
                <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                <circle cx="12" cy="12" r="3" />
              </>
            ) : (
              <>
                <polyline points="16 18 22 12 16 6" />
                <polyline points="8 6 2 12 8 18" />
              </>
            )}
          </svg>
        </button>
      )}
      <button
        type="button"
        className="tsp-user-action-btn"
        disabled={busy}
        title={zh ? "撤回并回退到此轮（清除此轮及后续对话，原文放回输入框）" : "Retract & rewind to this turn"}
        aria-label={zh ? "撤回并回退到此轮" : "Retract & rewind to this turn"}
        onClick={() => void onRetract()}
        data-testid="user-msg-retract"
      >
        <svg
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
          <path d="M5.5 4L2.5 7l3 3" />
          <path d="M3 7h7a3.5 3.5 0 1 1 0 7H6" />
        </svg>
      </button>
      <button
        type="button"
        className="tsp-user-action-btn"
        disabled={busy}
        title={zh ? "编辑此条消息并重新发送（清除后续轮次）" : "Edit this message and resend"}
        aria-label={zh ? "编辑此条消息" : "Edit this message"}
        onClick={onEditClick}
        data-testid="user-msg-edit"
      >
        <Pencil size={14} />
      </button>
      <button
        type="button"
        className="tsp-user-action-btn"
        disabled={busy}
        title={zh ? "从此处分叉出新会话（保留原会话不动）" : "Fork a new session from here"}
        aria-label={zh ? "从此处分叉" : "Fork from here"}
        onClick={() => void onFork()}
        data-testid="user-msg-fork"
      >
        <Branch size={14} />
      </button>
    </div>
  );
}

export function UserMessageEditor({
  taskId,
  sf,
  cardId,
  initialText,
  onCancel,
}: {
  taskId: TaskId;
  sf: string;
  cardId: string;
  initialText: string;
  onCancel(): void;
}) {
  const [text, setText] = useState(initialText);
  const [saving, setSaving] = useState(false);
  const zh = currentLocale() === "zh-CN";

  const onSaveAndSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    try {
      const entryId = await resolveUserEntryId(taskId, sf, cardId);
      if (entryId === null) {
        onCancel();
        return;
      }
      await window.studio.branchTask(taskId, entryId);
      onCancel();
      await window.studio.sendPrompt(taskId, { text: trimmed, whenBusy: "steer" });
    } catch (error) {
      setSaving(false);
      reportErrorNow(error);
    }
  };

  return (
    <div className="tsp-user-editor" data-testid="user-message-editor">
      <textarea
        className="tsp-user-editor-input"
        value={text}
        rows={Math.min(10, Math.max(2, text.split("\n").length))}
        disabled={saving}
        autoFocus
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            void onSaveAndSend();
          }
        }}
        data-testid="user-message-editor-input"
      />
      <div className="tsp-user-editor-row">
        <button
          type="button"
          className="tsp-user-editor-cancel"
          disabled={saving}
          onClick={onCancel}
          data-testid="user-message-editor-cancel"
        >
          {zh ? "取消" : "Cancel"}
        </button>
        <button
          type="button"
          className="tsp-user-editor-save"
          disabled={saving || text.trim() === ""}
          onClick={() => void onSaveAndSend()}
          data-testid="user-message-editor-save"
        >
          {zh ? "保存并发送" : "Save & send"}
        </button>
      </div>
    </div>
  );
}
