// 侧栏、历史会话和任务标题统一清洗：
// 1. 去掉 Nerd Font 等私用区图标字形（U+E000–U+F8FF 及补充私用区）；
// 2. 剥离外部宿主注入的指令包裹块（如 <t3_code_instructions>、<system-reminder>、<runtime_info> 等），提取真实用户提问首行。
const ICON_GLYPHS = /[\uE000-\uF8FF\u{F0000}-\u{FFFFD}\u{100000}-\u{10FFFD}]/gu;
const WRAPPER_BLOCKS =
  /<(t3_code_instructions|runtime_info|pull_request_linking|system-reminder|ADDITIONAL_METADATA|CONTEXT_SUMMARY)\b[^>]*>[\s\S]*?<\/\1>/gi;
const USER_REQUEST_TAG = /<\/?USER_REQUEST\b[^>]*>/gi;
const DANGLING_WRAPPER_PREFIX =
  /^\s*<(?:t3_code_instructions|runtime_info|pull_request_linking|system-reminder|ADDITIONAL_METADATA|CONTEXT_SUMMARY)\b[^>]*>[\s\S]*$/i;

/** 去掉私用区图标字形与宿主包装标签，并收掉多余空白。 */
export function stripIconGlyphs(text: string): string {
  const unwrapped = text.replace(WRAPPER_BLOCKS, " ").replace(USER_REQUEST_TAG, " ").replace(ICON_GLYPHS, "");
  const cleaned = unwrapped.trim();
  if (DANGLING_WRAPPER_PREFIX.test(cleaned)) return "";
  const firstMeaningfulLine = cleaned
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line !== "");
  return firstMeaningfulLine ?? "";
}
