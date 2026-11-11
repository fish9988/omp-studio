// 极简侧栏状态点：去掉刺眼的绿圈对勾与红底叉号，仅用克制的微缩几何点表达活跃与异常状态——
// 进行中是纤细转动的弧，需要介入是带柔光环的琥珀小圆点，失败是柔和暗红小圆点，历史中断是细空心圆环；正常完成与空闲不画图标。
import type { TFunction } from "../../../../shared/i18n/index.ts";
import type { SessionSummary, TaskState } from "../../../../shared/ipc.ts";
import { dotKind, sessionDotKind, type DotKind } from "../../../../shared/ui/sidebar-model.ts";

type Kind = Exclude<DotKind, "none">;

function Glyph({ kind }: { kind: Kind }) {
  switch (kind) {
    case "running":
      return (
        <>
          <circle className="sb-dot-track" cx="8" cy="8" r="5" />
          <circle className="sb-dot-arc" cx="8" cy="8" r="5" pathLength="100" />
        </>
      );
    case "waiting":
      return (
        <>
          <circle className="sb-dot-soft-halo" cx="8" cy="8" r="5.6" />
          <circle className="sb-dot-fill" cx="8" cy="8" r="3.2" />
        </>
      );
    case "done":
      return <circle className="sb-dot-fill" cx="8" cy="8" r="2.8" />;
    case "error":
      return (
        <>
          <circle className="sb-dot-soft-halo" cx="8" cy="8" r="5.2" />
          <circle className="sb-dot-fill" cx="8" cy="8" r="3" />
        </>
      );
    case "interrupted":
      return <circle className="sb-dot-ring" cx="8" cy="8" r="3.2" />;
  }
}

/** 按形状画一个状态图标；none 只留槽位。任务和历史会话共用。`title` = 悬停说明（图标本身只有形状和颜色）。 */
function StatusMark({ kind, label, title }: { kind: DotKind; label: string; title?: string }) {
  if (kind === "none")
    return (
      <span key="none" className="sb-dot sb-dot-none" aria-hidden="true">
        <span className="sb-dot-hollow" />
      </span>
    );
  const mark = (
    <svg className="sb-dot-mark" viewBox="0 0 16 16" aria-hidden="true">
      <Glyph kind={kind} />
    </svg>
  );
  return (
    <span key={kind} className={`sb-dot sb-dot-${kind}`} role="img" aria-label={label} title={title}>
      {/* 运行中的弧转动：转外面这层 HTML 盒子（sidebar.css 的 .sb-dot-turn），SVG 的 transform 动画不能交给合成器 */}
      {kind === "running" ? <span className="sb-dot-turn">{mark}</span> : mark}
    </span>
  );
}

export function StatusDot({ task, t }: { task: TaskState; t: TFunction }) {
  const kind = dotKind(task);
  const label =
    kind === "running"
      ? t("status.running")
      : kind === "waiting"
        ? t("status.waiting")
        : kind === "done"
          ? t("status.done")
          : t("status.error");
  return <StatusMark kind={kind} label={label} />;
}

/** 历史会话的状态图标：完成、失败、中断三种（见 sessionDotKind）；中断悬停说明是怎么回事。 */
export function SessionStatusDot({ session, t }: { session: SessionSummary; t: TFunction }) {
  const kind = sessionDotKind(session);
  if (kind === "interrupted")
    return <StatusMark kind={kind} label={t("status.interrupted")} title={t("status.interrupted")} />;
  return <StatusMark kind={kind} label={kind === "error" ? t("status.error") : t("status.done")} />;
}
