import type { MessageEntry } from "../index.ts";

export const menu = {
  newTask: "新任务",
  toggleSidebar: "切换侧栏",
  settings: "设置",
  viewChat: "对话",
  viewTrajectory: "轨迹",
  openIn: "打开方式",
  openExplorer: "在资源管理器中打开",
  openTerminal: "打开内置终端",
  copyWorkspacePath: "复制工作目录路径",
  copiedWorkspacePath: "已复制工作目录路径",
  openReview: "代码变更评审",
  edit: "编辑",
  undo: "撤销",
  cut: "剪切",
  copy: "复制",
  paste: "粘贴",
  selectAll: "全选",
} satisfies Record<string, MessageEntry>;
