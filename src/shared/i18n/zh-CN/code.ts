import type { MessageEntry } from "../index.ts";

export const code = {
  copy: "复制代码",
  source: "查看源码",
  previewSidebar: "在侧栏预览",
  figure: "助手画的图",
  figureFailed: "这张图画不出来，下面是它的源码",
} satisfies Record<string, MessageEntry>;
