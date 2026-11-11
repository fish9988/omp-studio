// 右侧工作台（文件、变更、子代理、浏览器四模式共用右栏）的变更面板状态与单栏互斥切换。
import type { TaskId } from "../../../../shared/ipc.ts";
import { createStore, useStoreValue } from "../../store/create-store.ts";
import { closeAgentsPanel, openAgentsPanel } from "../agents/agents-store.ts";
import { closeBrowserPanel, openBrowserPanel } from "../browser/browser-store.ts";
import { closeFilePreview, openFilesPanel } from "../file-preview/preview-store.ts";

export type WorkbenchTab = "files" | "changes" | "agents" | "browser";

const changesStore = createStore<TaskId | null>(null);
let returnFocus: HTMLElement | null = null;

window.studio.onTaskRemoved((taskId) => {
  if (changesStore.get() === taskId) changesStore.set(null);
});

export function openChangesPanel(taskId: TaskId): void {
  if (changesStore.get() === taskId) return;
  closeFilePreview();
  closeAgentsPanel(false);
  closeBrowserPanel(false);
  if (changesStore.get() === null) {
    const active = document.activeElement;
    returnFocus = active instanceof HTMLElement && active !== document.body ? active : null;
  }
  changesStore.set(taskId);
}

export function toggleChangesPanel(taskId: TaskId): void {
  if (changesStore.get() === taskId) closeChangesPanel();
  else openChangesPanel(taskId);
}

export function closeChangesPanel(restoreFocus = true): void {
  if (changesStore.get() === null) return;
  changesStore.set(null);
  const target = returnFocus;
  returnFocus = null;
  if (restoreFocus && target?.isConnected) target.focus();
}

export function useChangesPanel(): TaskId | null {
  return useStoreValue(changesStore, (state) => state);
}

/** 右栏顶部工作台切换条：在同一栏内无缝切换四种面板，不把焦点弹回主区触发元素。 */
export function switchWorkbenchTab(tab: WorkbenchTab, taskId: TaskId): void {
  if (tab === "files") {
    closeChangesPanel(false);
    closeAgentsPanel(false);
    closeBrowserPanel(false);
    openFilesPanel(taskId);
    return;
  }
  if (tab === "changes") {
    openChangesPanel(taskId);
    return;
  }
  if (tab === "agents") {
    closeChangesPanel(false);
    closeBrowserPanel(false);
    openAgentsPanel(taskId);
    return;
  }
  closeChangesPanel(false);
  openBrowserPanel(taskId);
}
