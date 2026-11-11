// 顶栏右侧工具区的工作区变更面板开关：与对话并排查看改动文件与行内 diff，不遮挡主对话流。
import type { TaskId } from "../../../../shared/ipc.ts";
import { useT } from "../../i18n/use-t.ts";
import { ChangesPane } from "../../icons.tsx";
import { IconButton } from "../../ui/controls.tsx";
import { toggleChangesPanel, useChangesPanel } from "./workbench-store.ts";

export function ChangesToggle({ taskId }: { taskId: TaskId }) {
  const t = useT();
  const open = useChangesPanel() === taskId;
  return (
    <IconButton
      label={t("review.panelToggle")}
      tip={t("review.panelToggle")}
      pressed={open}
      expanded={open}
      testId="topbar-changes"
      onClick={() => toggleChangesPanel(taskId)}
    >
      <ChangesPane size={16} />
    </IconButton>
  );
}
