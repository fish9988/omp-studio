// 右栏工作区变更检视器：在不离开、不遮挡主对话流的前提下查看当前任务的改动文件清单与行内统一 diff，
// 也支持一键跳往文件预览或全屏评审（逐行评论、按块暂存）。
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { GitChangeKind, GitDiffArea } from "../../../../shared/git.ts";
import type { TaskId } from "../../../../shared/ipc.ts";
import {
  flattenGroups,
  groupChanges,
  resolveSelection,
  stepEntry,
  type ReviewEntry,
} from "../../../../shared/ui/review-model.ts";
import { useT } from "../../i18n/use-t.ts";
import { Close, Diff, Eye, Restart } from "../../icons.tsx";
import { useTask } from "../../store/index.ts";
import { openReview } from "../../store/review-store.ts";
import { Button, IconButton } from "../../ui/controls.tsx";
import { explainError } from "../../ui/errors.ts";
import { openFilePreview, setPreviewWidth, usePreviewWidth } from "../file-preview/preview-store.ts";
import { refreshGit } from "../git/git-store.ts";
import { diffKeyOf, useChangeStats, useFileDiff, useReviewStatus } from "../review/use-review-data.ts";
import { WorkbenchStrip } from "./WorkbenchStrip.tsx";
import { closeChangesPanel } from "./workbench-store.ts";
import "../file-preview/file-preview.css";
import "./workbench.css";

const minWidth = 280;
const maxShare = 0.7;
const keyboardStep = 16;

const KIND_BADGE: Record<GitChangeKind, string> = {
  added: "A",
  modified: "M",
  deleted: "D",
  renamed: "R",
  copied: "C",
  typechange: "T",
  untracked: "U",
  conflicted: "!",
};

const GROUP_KEY: Record<GitDiffArea, "review.groupStaged" | "review.groupUnstaged" | "review.groupUntracked"> = {
  staged: "review.groupStaged",
  unstaged: "review.groupUnstaged",
  untracked: "review.groupUntracked",
};

function splitFilePath(filePath: string): { dir: string; name: string } {
  const slash = filePath.lastIndexOf("/");
  if (slash === -1) return { dir: "", name: filePath };
  return { dir: filePath.slice(0, slash + 1), name: filePath.slice(slash + 1) };
}

export function GitChangesPanel({ taskId }: { taskId: TaskId }) {
  const t = useT();
  const task = useTask(taskId);
  const root = useRef<HTMLElement>(null);
  const drag = useRef<{ startX: number; startWidth: number } | null>(null);
  const width = usePreviewWidth();
  const { status, error, stamp, refresh } = useReviewStatus(taskId, task?.status);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const lastIndex = useRef(0);

  const groups = useMemo(() => (status?.kind === "ok" ? groupChanges(status.files) : []), [status]);
  const entries = useMemo(() => flattenGroups(groups), [groups]);
  const entry: ReviewEntry | null = resolveSelection(entries, selectedKey, lastIndex.current);

  useEffect(() => {
    lastIndex.current = entry === null ? 0 : entries.indexOf(entry);
  }, [entries, entry]);

  useEffect(() => {
    if (stamp !== 0) refreshGit(taskId);
  }, [taskId, stamp]);

  const stats = useChangeStats(taskId, status?.kind === "ok" ? stamp : 0);
  const diffState = useFileDiff(taskId, entry, "hunks", false, stamp);

  const totals = useMemo(() => {
    let added = 0;
    let removed = 0;
    for (const counts of stats.values()) {
      added += counts.added;
      removed += counts.removed;
    }
    return { added, removed };
  }, [stats]);

  useLayoutEffect(() => {
    root.current?.focus({ preventScroll: true });
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeChangesPanel();
      return;
    }
    if ((event.key === "ArrowDown" || event.key === "ArrowUp") && !event.altKey && !event.ctrlKey && !event.metaKey) {
      const target = event.target as HTMLElement | null;
      if (target && target.closest(".wb-diff-scroll")) return;
      const next = stepEntry(entries, entry?.key ?? null, event.key === "ArrowDown" ? 1 : -1);
      if (next) {
        event.preventDefault();
        setSelectedKey(next.key);
      }
    }
  };

  const clampWidth = (value: number) => {
    const parent = root.current?.parentElement;
    const max = parent ? parent.clientWidth * maxShare : value;
    return Math.max(minWidth, Math.min(max, value));
  };
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { startX: event.clientX, startWidth: root.current?.offsetWidth ?? minWidth };
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current) setPreviewWidth(clampWidth(drag.current.startWidth + drag.current.startX - event.clientX));
  };
  const onResizerKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const now = root.current?.offsetWidth ?? minWidth;
    setPreviewWidth(clampWidth(now + (event.key === "ArrowLeft" ? keyboardStep : -keyboardStep)));
  };

  const expectedDiffKey = entry ? diffKeyOf(entry.area, "hunks", false, entry.path) : null;
  const diffLoading = entry !== null && diffState.key !== expectedDiffKey;

  return (
    <section
      ref={root}
      className="file-preview wb-changes-panel"
      data-testid="git-changes-panel"
      aria-label={t("review.panelToggle")}
      tabIndex={-1}
      style={width === null ? undefined : { flexBasis: width }}
      onKeyDown={onKeyDown}
    >
      <div
        className="file-preview-resizer"
        role="separator"
        aria-orientation="vertical"
        aria-label={t("review.panelResize")}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => {
          drag.current = null;
        }}
        onKeyDown={onResizerKey}
      />
      <WorkbenchStrip active="changes" taskId={taskId} />
      <header className="file-preview-head wb-changes-head">
        <span className="wb-changes-title" data-testid="wb-changes-count">
          {status?.kind === "ok" ? t("review.changedFilesCount", { count: entries.length }) : t("review.wbChanges")}
        </span>
        {status?.kind === "ok" && (totals.added > 0 || totals.removed > 0) && (
          <span className="wb-changes-totals">
            {totals.added > 0 && <span className="wb-stat-add">+{totals.added}</span>}
            {totals.removed > 0 && <span className="wb-stat-del">−{totals.removed}</span>}
          </span>
        )}
        <span className="file-preview-spacer" />
        {status?.kind === "ok" && (
          <Button size="sm" testId="wb-open-full-review" onClick={() => openReview(taskId)}>
            <Diff size={13} />
            {t("review.fullReview")}
          </Button>
        )}
        <IconButton label={t("review.refresh")} testId="wb-changes-refresh" onClick={refresh}>
          <Restart size={14} />
        </IconButton>
        <IconButton
          label={t("review.panelClose")}
          tip={`${t("review.panelClose")} (Esc)`}
          testId="wb-changes-close"
          onClick={() => closeChangesPanel()}
        >
          <Close size={14} />
        </IconButton>
      </header>

      <div className="wb-changes-body">
        {stamp === 0 ? (
          <div className="wb-changes-empty">{t("review.loading")}</div>
        ) : error !== null ? (
          <div className="wb-changes-empty">{explainError(t, error)}</div>
        ) : status?.kind === "git_missing" ? (
          <div className="wb-changes-empty">{t("review.gitMissing")}</div>
        ) : status?.kind === "not_git" ? (
          <div className="wb-changes-empty">{t("review.notGit")}</div>
        ) : entries.length === 0 ? (
          <div className="wb-changes-empty" data-testid="wb-changes-clean">
            {t("review.noFiles")}
          </div>
        ) : (
          <>
            <div className="wb-file-list" data-testid="wb-file-list">
              {groups.map((group) => (
                <div key={group.area} className="wb-group">
                  <div className="wb-group-head">
                    <span>{t(GROUP_KEY[group.area])}</span>
                    <span className="wb-group-count">{group.entries.length}</span>
                  </div>
                  {group.entries.map((item) => {
                    const { dir, name } = splitFilePath(item.path);
                    const lineCounts = stats.get(item.key);
                    const active = entry?.key === item.key;
                    return (
                      <button
                        key={item.key}
                        type="button"
                        className="wb-file-row"
                        aria-current={active ? "true" : undefined}
                        data-testid="wb-file-row"
                        data-path={item.path}
                        onClick={() => setSelectedKey(item.key)}
                      >
                        <span className="wb-kind" data-kind={item.kind}>
                          {KIND_BADGE[item.kind]}
                        </span>
                        <span className="wb-file-text">
                          {dir !== "" && <span className="wb-file-dir">{dir}</span>}
                          <span className="wb-file-name">{name}</span>
                        </span>
                        {lineCounts && (lineCounts.added > 0 || lineCounts.removed > 0) && (
                          <span className="wb-file-counts">
                            {lineCounts.added > 0 && <span className="wb-stat-add">+{lineCounts.added}</span>}
                            {lineCounts.removed > 0 && <span className="wb-stat-del">−{lineCounts.removed}</span>}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>

            {entry !== null && (
              <div className="wb-diff-pane">
                <div className="wb-diff-head">
                  <span className="wb-diff-path" data-testid="wb-selected-path">
                    {entry.oldPath ? `${entry.oldPath} → ${entry.path}` : entry.path}
                  </span>
                  {entry.kind !== "deleted" && (
                    <IconButton
                      label={t("review.previewFile")}
                      tip={t("review.previewFile")}
                      testId="wb-preview-file"
                      onClick={() => openFilePreview(taskId, entry.path)}
                    >
                      <Eye size={14} />
                    </IconButton>
                  )}
                </div>
                <div className="wb-diff-scroll" data-testid="wb-diff-scroll">
                  {diffLoading ? (
                    <div className="wb-diff-note">{t("review.loading")}</div>
                  ) : diffState.error !== null ? (
                    <div className="wb-diff-note">{explainError(t, diffState.error)}</div>
                  ) : diffState.diff === null ? null : diffState.diff.kind === "binary" ? (
                    <div className="wb-diff-note">{t("review.binary")}</div>
                  ) : diffState.diff.kind === "too_large" ? (
                    <div className="wb-diff-note">{t("review.tooLarge")}</div>
                  ) : diffState.diff.hunks.length === 0 ? (
                    <div className="wb-diff-note">{t("review.noTextChanges")}</div>
                  ) : (
                    diffState.diff.hunks.map((hunk, hunkIdx) => (
                      <div key={`${hunkIdx}:${hunk.header}`} className="wb-hunk">
                        <div className="wb-hunk-head">{hunk.header}</div>
                        <div className="wb-hunk-lines">
                          {hunk.lines.map((line, lineIdx) => (
                            <div key={lineIdx} className="wb-diff-row" data-kind={line.kind}>
                              <span className="wb-line-no">{line.oldNo ?? ""}</span>
                              <span className="wb-line-no">{line.newNo ?? ""}</span>
                              <span className="wb-line-sign">
                                {line.kind === "add" ? "+" : line.kind === "del" ? "−" : " "}
                              </span>
                              <span className="wb-line-code">{line.text}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
