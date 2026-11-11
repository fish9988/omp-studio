// 顶栏左侧：任务标题（活跃任务支持点击标题原地重命名，照 Claude Desktop / DSH）。空状态显示"新任务"，设置页显示页面标题。
// 任务标题右边一个"重开会话"按钮（restart-session.ts）：任务忙时置灰，悬停写明原因。
import { useEffect, useRef, useState } from "react";
import { useT } from "../i18n/use-t.ts";
import { withShortcut } from "./platform-keys.ts";
import { Restart } from "../icons.tsx";
import { useMainView, useSelectedTaskId, useTask } from "../store/index.ts";
import { IconButton } from "../ui/controls.tsx";
import { reportError } from "../ui/errors.ts";
import { taskTitle } from "../../../shared/ui/sidebar-model.ts";
import { restartBlockedKey, restartSession } from "./restart-session.ts";

export function TaskCrumb() {
  const t = useT();
  const view = useMainView();
  const taskId = useSelectedTaskId();
  const task = useTask(taskId);
  const [restarting, setRestarting] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const skipBlurRef = useRef(false);

  useEffect(() => {
    setRenaming(false);
  }, [taskId, view]);

  useEffect(() => {
    if (!renaming) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [renaming]);

  if (view === "settings")
    return (
      <div className="crumb" data-testid="topbar-crumb">
        <span className="crumb-title">{t("menu.settings")}</span>
      </div>
    );

  if (taskId === null || task === null)
    return (
      <div className="crumb" data-testid="topbar-crumb">
        <span className="crumb-title">{t("menu.newTask")}</span>
      </div>
    );

  const title = taskTitle(task) || t("task.untitled");
  const blocked = restartBlockedKey(task);
  const restart = () => {
    setRestarting(true);
    void restartSession(t, task).finally(() => setRestarting(false));
  };
  const beginRename = () => {
    skipBlurRef.current = false;
    setDraft(title);
    setRenaming(true);
  };
  const commitRename = () => {
    if (skipBlurRef.current) {
      skipBlurRef.current = false;
      return;
    }
    const next = draft.trim();
    setRenaming(false);
    if (next === "" || next === title) return;
    window.studio.renameTask(task.id, next).catch((error: unknown) => reportError(t, error));
  };

  return (
    <div className="crumb" data-testid="topbar-crumb">
      {renaming ? (
        <input
          ref={inputRef}
          type="text"
          className="crumb-rename-input"
          value={draft}
          aria-label={t("task.renameLabel")}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commitRename}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commitRename();
            } else if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              skipBlurRef.current = true;
              setRenaming(false);
            }
          }}
          data-testid="topbar-rename-input"
        />
      ) : (
        <button
          type="button"
          className="crumb-title crumb-title-btn"
          title={`${title} (${t("task.rename")})`}
          onClick={beginRename}
        >
          {title}
        </button>
      )}
      <IconButton
        className="crumb-restart"
        label={t("task.restart")}
        tip={blocked === null ? withShortcut(t("task.restartTip"), "Ctrl Shift R") : t(blocked)}
        disabled={blocked !== null || restarting}
        testId="topbar-restart"
        onClick={restart}
      >
        <Restart size={14} />
      </IconButton>
    </div>
  );
}
