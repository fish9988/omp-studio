import type { MessageEntry } from "../index.ts";
import type { menu as zhCN } from "../zh-CN/menu.ts";

export const menu = {
  newTask: "New task",
  toggleSidebar: "Toggle sidebar",
  settings: "Settings",
  viewChat: "Chat",
  viewTrajectory: "Trajectory",
  openIn: "Open",
  openExplorer: "Open in file manager",
  openTerminal: "Open terminal",
  copyWorkspacePath: "Copy workspace path",
  copiedWorkspacePath: "Copied workspace path",
  openReview: "Review changes",
  edit: "Edit",
  undo: "Undo",
  cut: "Cut",
  copy: "Copy",
  paste: "Paste",
  selectAll: "Select all",
} satisfies Record<keyof typeof zhCN, MessageEntry>;
