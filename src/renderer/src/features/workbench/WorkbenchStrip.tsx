// 右栏统一工作台切换条：文件 | 变更 | 子代理 | 浏览器，在四类右栏面板顶部共用，单击直达。
import type { TaskId } from "../../../../shared/ipc.ts";
import { useT } from "../../i18n/use-t.ts";
import { Diff, Folder, Globe, Users } from "../../icons.tsx";
import { switchWorkbenchTab, type WorkbenchTab } from "./workbench-store.ts";
import "./workbench.css";

export function WorkbenchStrip({ active, taskId }: { active: WorkbenchTab; taskId: TaskId | null }) {
  const t = useT();
  if (taskId === null) return null;

  const items = [
    { id: "files" as const, label: t("review.wbFiles"), icon: <Folder size={13} /> },
    { id: "changes" as const, label: t("review.wbChanges"), icon: <Diff size={13} /> },
    { id: "agents" as const, label: t("review.wbAgents"), icon: <Users size={13} /> },
    { id: "browser" as const, label: t("review.wbBrowser"), icon: <Globe size={13} /> },
  ];

  return (
    <nav className="wb-strip" aria-label={t("review.wbLabel")} data-testid="workbench-strip">
      {items.map((item) => {
        const current = active === item.id;
        return (
          <button
            key={item.id}
            type="button"
            className="wb-strip-btn"
            aria-current={current ? "page" : undefined}
            data-active={current ? "" : undefined}
            data-testid={`wb-tab-${item.id}`}
            onClick={() => {
              if (!current) switchWorkbenchTab(item.id, taskId);
            }}
          >
            {item.icon}
            <span className="wb-strip-label">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
