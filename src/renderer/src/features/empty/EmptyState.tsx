// 没选任务时的主区（spec §4.7）：背景字符波纹场 + 贴底的草稿输入框；上方是在剩余空间里竖直居中的 Studio 概览：
// 像素 π + "开始一个任务"（升级后第一次启动附带最近更新）、Bento 用量仪表盘卡片。概览比窗口高时整页滚动，输入框始终贴底。
import { useEffect } from "react";
import { useT } from "../../i18n/use-t.ts";
import { useAppInfo } from "../../store/index.ts";
import { Button } from "../../ui/controls.tsx";
import { describeError } from "../../ui/errors.ts";
import { DraftComposer } from "../composer/index.ts";
import { refreshProjects, useProjectsState } from "../sidebar/projects-store.ts";
import { EmptyMark } from "./EmptyMark.tsx";
import { HomeRippleCanvas } from "./HomeRippleCanvas.tsx";
import { ProjectLabel } from "./ProjectLabel.tsx";
import { UsageCard } from "./UsageCard.tsx";
import { useDraftProject } from "./use-draft-project.ts";
import { WhatsNew } from "./WhatsNew.tsx";
import "./empty.css";

export function EmptyState() {
  const t = useT();
  const { loaded, error } = useProjectsState();
  const project = useDraftProject();
  const appInfo = useAppInfo();
  const whatsNew = appInfo?.whatsNew ?? null;

  // 草稿输入框出现后焦点放进去（程序设置的焦点不显示焦点框，只有键盘操作才显示）。
  useEffect(() => {
    if (!loaded) return;
    const active = document.activeElement;
    if (active === null || active === document.body)
      document.querySelector<HTMLElement>("[data-composer-input]")?.focus({ preventScroll: true });
  }, [loaded]);

  if (!loaded && error === null)
    return <div className="empty" data-testid="empty-state" data-kind="loading" aria-busy="true" />;
  if (!loaded) {
    return (
      <div className="empty" data-testid="empty-state" data-kind="error">
        <div className="empty-card" role="alert">
          <p className="empty-error">{t("empty.loadFailed", { message: describeError(t, error) })}</p>
          <Button variant="primary" onClick={() => void refreshProjects()}>
            {t("common.retry")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="empty" data-testid="empty-state" data-kind={project === null ? "no-project" : "project"}>
      <HomeRippleCanvas />
      <div className="empty-main">
        <div className="empty-head">
          <EmptyMark />
          <h1 className="empty-title">{t("empty.title")}</h1>
          {whatsNew !== null && <WhatsNew summary={whatsNew} />}
        </div>
        <UsageCard />
      </div>
      <div className="empty-draft" data-testid="empty-draft">
        <DraftComposer projectId={project?.id ?? null} projectTools={<ProjectLabel project={project} />} />
      </div>
    </div>
  );
}
