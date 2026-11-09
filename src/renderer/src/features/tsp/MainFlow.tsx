// 对话区的 main：omp 发来的子节点，加上 omp 终端里有、TSP 文档里留不住的状态行（切模型的 "Session-only model: …" 等）：
// 文档里记下来的（shared/tsp/status-notes.ts），停在它出现时前面的那个节点后面。那个节点没了（压缩、/tree、恢复会话
// 这类整段重建对话，omp 删掉旧节点重画）就不再画：终端里重建也会清掉状态行（omp 18.12.5 实录 session-tree-compacted.jsonl）。
// 状态行最多露两行：MCP 工具多时启动的 `xdev: xd://: mounted …` 会列出全部工具名，占满一屏（2026-11-06 仓库所有者），
// 多出的收进和工具输出一样的"N more lines"。
import { Fragment, memo, useEffect, useRef, useState, type ReactNode } from "react";
import type { TaskId } from "../../../../shared/ipc.ts";
import type { DocNode, DocSurface, TspDocument } from "../../../../shared/tsp/document.ts";
import type { StatusNote } from "../../../../shared/tsp/status-notes.ts";
import { useShellValue } from "../../app/shell-store.ts";
import { ChevronDown, External, FileIcon } from "../../icons.tsx";
import { currentLocale } from "../../store/settings-store.ts";
import { openFilePreview, openInlineArtifact, type InlineArtifact } from "../file-preview/index.ts";
import { Clamp } from "./Clamp.tsx";
import { formatElapsed } from "./fmt.ts";
import type { TspContext } from "./node-props.ts";
import { useSessionExtras } from "./session-extras-store.ts";
import { cleanGlyphs } from "./span-tokens.ts";
import { TspNode } from "./TspChildren.tsx";
import { useTspDerived, useTspStatusNotes } from "./tsp-store.ts";
const STATUS_NOTE_LINES = 2;

type LangBadgeKind = "js" | "ts" | "brace" | "md" | "html" | "py" | "img" | "file";

interface DeliverableItem {
  key: string;
  name: string;
  dirPath: string;
  badge: "SVG" | "HTML" | "MD" | "FILE";
  langBadge: { label: string; kind: LangBadgeKind };
  subtitleZh: string;
  subtitleEn: string;
  operation: "write" | "edit" | "read";
  added: number;
  removed: number;
  bodyNodeId?: string;
  bodyKind?: "diff" | "code";
  filePath?: string;
  artifact?: InlineArtifact;
}
type MainSegment =
  | { kind: "item"; id: string; deliverables: readonly DeliverableItem[] }
  | {
      kind: "process";
      ids: readonly string[];
      thoughts: number;
      tools: number;
      durationMs: number;
      turnIndex: number;
      running: boolean;
      settled: boolean;
      deliverables: readonly DeliverableItem[];
    };

const EMPTY_SEGMENTS: readonly MainSegment[] = [];
const EMPTY_DELIVERABLES: readonly DeliverableItem[] = [];
function isThinkingSection(surface: DocSurface, id: string): boolean {
  const node = surface.nodes.get(id);
  const role = node?.p["role"];
  return typeof role === "string" && role.startsWith("omp.thinking");
}

function extractPlainText(surface: DocSurface, id: string): string {
  const node = surface.nodes.get(id);
  if (!node) return "";
  if (typeof node.p["text"] === "string") return node.p["text"];
  if (Array.isArray(node.p["spans"])) {
    return (node.p["spans"] as { t?: unknown }[]).map((s) => (typeof s?.t === "string" ? s.t : "")).join("");
  }
  return node.c.map((cid) => extractPlainText(surface, cid)).join("");
}

function parseDurationTextMs(text: string): number {
  const minSec = /\b(\d+)m\s*(\d+(?:\.\d+)?)s\b/i.exec(text);
  if (minSec) return (Number(minSec[1]) * 60 + Number(minSec[2])) * 1000;
  const sec = /\b(\d+(?:\.\d+)?)s\b/i.exec(text);
  if (sec) return Number(sec[1]) * 1000;
  const ms = /\b(\d+)ms\b/i.exec(text);
  if (ms) return Number(ms[1]);
  return 0;
}

function maxDescendantElapsedMs(surface: DocSurface, id: string): number {
  const node = surface.nodes.get(id);
  if (!node) return 0;
  if (node.k === "elapsed") {
    if (typeof node.p["stopped"] === "number" && node.p["stopped"] > 0) return node.p["stopped"];
  }
  let max = 0;
  for (const cid of node.c) {
    const childMax = maxDescendantElapsedMs(surface, cid);
    if (childMax > max) max = childMax;
  }
  return max;
}

// 只读取已结算的耗时（took / stopped / 已完成的 Thought for Ns），不读每 100ms 跳动的 age，
// 避免运行中每秒触发 10 次 MainFlow 重渲染导致过程栏滚动条断触卡顿。
function nodeDurationMs(surface: DocSurface, id: string): number {
  const node = surface.nodes.get(id);
  if (!node) return 0;
  if (typeof node.p["took"] === "number" && node.p["took"] > 0) return node.p["took"];
  if (node.k === "section") {
    const headId = typeof node.p["head"] === "string" ? node.p["head"] : `${id}/head`;
    const headText = extractPlainText(surface, headId);
    const parsed = parseDurationTextMs(headText);
    if (parsed > 0) return parsed;
  }
  return maxDescendantElapsedMs(surface, id);
}
function isProcessNodeRunning(surface: DocSurface, id: string): boolean {
  const node = surface.nodes.get(id);
  if (!node) return false;
  if (node.k === "tool") {
    return node.p["status"] === "running" || node.p["status"] === "pending";
  }
  if (node.k === "section") {
    if (node.p["role"] === "omp.thinking.live") return true;
    const headId = typeof node.p["head"] === "string" ? node.p["head"] : `${id}/head`;
    const headNode = surface.nodes.get(headId);
    return headNode?.k === "shimmer";
  }
  return false;
}

function cleanDeliverablePath(raw: string): string {
  return raw
    .replace(/^file:\/\//i, "")
    .replace(/:\d+(?:[-:]\d+)?$/, "")
    .replace(/#L\d+.*$/i, "")
    .trim();
}

function fileBadgeMeta(filePath: string): {
  badge: DeliverableItem["badge"];
  langBadge: { label: string; kind: LangBadgeKind };
  subtitleZh: string;
  subtitleEn: string;
} {
  const lower = filePath.toLowerCase();
  const ext = lower.split(".").pop() ?? "";
  const langBadge: { label: string; kind: LangBadgeKind } =
    ext === "js" || ext === "mjs" || ext === "cjs" || ext === "jsx"
      ? { label: "JS", kind: "js" }
      : ext === "ts" || ext === "mts" || ext === "cts" || ext === "tsx"
        ? { label: "TS", kind: "ts" }
        : ext === "json" || ext === "jsonc" || ext === "css" || ext === "scss" || ext === "less"
          ? { label: "{}", kind: "brace" }
          : ext === "md" || ext === "markdown" || ext === "mdx"
            ? { label: "M↓", kind: "md" }
            : ext === "html" || ext === "htm" || ext === "xml" || ext === "vue"
              ? { label: "</>", kind: "html" }
              : ext === "py"
                ? { label: "PY", kind: "py" }
                : ext === "svg" || ext === "png" || ext === "webp" || ext === "jpg" || ext === "jpeg"
                  ? { label: "IMG", kind: "img" }
                  : { label: ext ? ext.slice(0, 4).toUpperCase() : "FILE", kind: "file" };

  if (lower.endsWith(".svg")) {
    return {
      badge: "SVG",
      langBadge,
      subtitleZh: "SVG 矢量图形 · 点击在侧栏渲染预览",
      subtitleEn: "SVG vector graphic · Click to preview",
    };
  }
  if (lower.endsWith(".html") || lower.endsWith(".htm")) {
    return {
      badge: "HTML",
      langBadge,
      subtitleZh: "HTML 网页文档 · 点击在侧栏渲染预览",
      subtitleEn: "HTML document · Click to preview",
    };
  }
  if (lower.endsWith(".md") || lower.endsWith(".markdown") || lower.endsWith(".mdx")) {
    return {
      badge: "MD",
      langBadge,
      subtitleZh: "Markdown 文档 · 点击在侧栏渲染预览",
      subtitleEn: "Markdown document · Click to preview",
    };
  }
  return {
    badge: "FILE",
    langBadge,
    subtitleZh: "已变更文件 · 点击在侧栏打开预览",
    subtitleEn: "Modified file · Click to preview",
  };
}

function isDeliverableDocPath(filePath: string): boolean {
  return /\.(svg|html?|md|markdown|mdx|png|webp|jpe?g)$/i.test(filePath);
}
function parseToolDiffStats(
  surface: DocSurface,
  node: DocNode,
): {
  added: number;
  removed: number;
  bodyNodeId?: string;
  bodyKind?: "diff" | "code";
} {
  let added = 0;
  let removed = 0;
  let bodyNodeId: string | undefined;
  let bodyKind: "diff" | "code" | undefined;

  if (Array.isArray(node.p["meta"])) {
    for (const entry of node.p["meta"]) {
      if (typeof entry !== "string") continue;
      const addMatch = /\+(\d+)/.exec(entry);
      const delMatch = /[-−](\d+)/.exec(entry);
      const linesMatch = /^(\d+)\s+lines?$/i.exec(entry.trim());
      if (addMatch) added += Number(addMatch[1]);
      if (delMatch) removed += Number(delMatch[1]);
      if (linesMatch && node.p["name"] === "write") added += Number(linesMatch[1]);
    }
  }

  for (const cid of node.c) {
    const child = surface.nodes.get(cid);
    if (!child) continue;
    if (child.k === "diff") {
      bodyNodeId = cid;
      bodyKind = "diff";
      if (added === 0 && removed === 0 && Array.isArray(child.p["hunks"])) {
        for (const hunk of child.p["hunks"] as { lines?: unknown }[]) {
          if (!Array.isArray(hunk?.lines)) continue;
          for (const line of hunk.lines) {
            if (typeof line !== "string") continue;
            if (line.startsWith("+") && !line.startsWith("+++")) added += 1;
            else if (line.startsWith("-") && !line.startsWith("---")) removed += 1;
          }
        }
      }
      break;
    }
    if (child.k === "code") {
      bodyNodeId = cid;
      bodyKind = "code";
      if (added === 0 && node.p["name"] === "write" && typeof child.p["text"] === "string") {
        added = child.p["text"].split("\n").length;
      }
    }
  }
  return {
    added,
    removed,
    ...(bodyNodeId !== undefined ? { bodyNodeId } : {}),
    ...(bodyKind !== undefined ? { bodyKind } : {}),
  };
}

function extractNodeDeliverables(surface: DocSurface, id: string): DeliverableItem[] {
  const node = surface.nodes.get(id);
  if (!node) return [];
  const items: DeliverableItem[] = [];

  const pushFile = (
    rawPath: string,
    hrefPath: string | undefined,
    operation: "write" | "edit" | "read",
    stats: { added: number; removed: number; bodyNodeId?: string; bodyKind?: "diff" | "code" },
  ) => {
    const cleaned = cleanDeliverablePath(rawPath);
    if (cleaned === "") return;
    if (operation === "read" && !isDeliverableDocPath(cleaned)) return;
    const normalized = cleaned.replace(/\\/g, "/");
    const hrefClean = hrefPath ? cleanDeliverablePath(hrefPath).replace(/\\/g, "/") : "";
    // 跳过系统临时目录（AppData/Local/Temp 或 /tmp）及 ~ 开头的外部临时文件，避免生成无法在工作区内预览的失效卡片
    if (
      normalized.startsWith("~") ||
      /AppData\/Local\/Temp|\/tmp\//i.test(normalized) ||
      /AppData\/Local\/Temp|\/tmp\//i.test(hrefClean)
    ) {
      return;
    }
    const parts = normalized.split("/").filter(Boolean);
    const baseName = parts[parts.length - 1] ?? normalized;
    const isAbs = /^[a-zA-Z]:\//.test(normalized) || normalized.startsWith("/");
    const rel = isAbs ? (/probe-user/i.test(normalized) ? baseName : normalized) : normalized;
    const dirFromHref = hrefClean.includes("/") ? hrefClean.slice(0, hrefClean.lastIndexOf("/")) : "";
    const dirFromRel = normalized.includes("/") ? normalized.slice(0, normalized.lastIndexOf("/")) : "";
    const dirPath = dirFromHref ? `/${dirFromHref.replace(/^\/+/, "")}` : dirFromRel;
    const meta = fileBadgeMeta(rel);
    items.push({
      key: `file:${rel}`,
      name: baseName,
      dirPath,
      badge: meta.badge,
      langBadge: meta.langBadge,
      subtitleZh: meta.subtitleZh,
      subtitleEn: meta.subtitleEn,
      operation,
      added: stats.added,
      removed: stats.removed,
      ...(stats.bodyNodeId !== undefined ? { bodyNodeId: stats.bodyNodeId } : {}),
      ...(stats.bodyKind !== undefined ? { bodyKind: stats.bodyKind } : {}),
      filePath: rel,
    });
  };

  if (node.k === "tool" && node.p["status"] === "done") {
    const toolName = node.p["name"];
    if (toolName === "write" || toolName === "edit" || toolName === "read") {
      const op: "write" | "edit" | "read" = toolName === "write" ? "write" : toolName === "edit" ? "edit" : "read";
      const stats = parseToolDiffStats(surface, node);
      const hrefStr = typeof node.p["href"] === "string" ? node.p["href"] : undefined;
      if (typeof node.p["target"] === "string" && node.p["targetKind"] === "path") {
        pushFile(node.p["target"], hrefStr, op, stats);
      } else if (hrefStr !== undefined) {
        pushFile(hrefStr, hrefStr, op, stats);
      }
      for (const cid of node.c) {
        const child = surface.nodes.get(cid);
        if (child?.p["role"] === "omp.tool.file") {
          const childHref = typeof child.p["href"] === "string" ? child.p["href"] : hrefStr;
          if (typeof child.p["title"] === "string") pushFile(child.p["title"], childHref, op, stats);
          else if (childHref !== undefined) pushFile(childHref, childHref, op, stats);
          for (const gcid of child.c) {
            const gc = surface.nodes.get(gcid);
            const gcHref = typeof gc?.p["href"] === "string" ? gc.p["href"] : childHref;
            if (typeof gc?.p["title"] === "string") pushFile(gc.p["title"], gcHref, op, stats);
            else if (gcHref !== undefined) pushFile(gcHref, gcHref, op, stats);
            else if (typeof gc?.p["text"] === "string") pushFile(gc.p["text"], gcHref, op, stats);
          }
        }
      }
    }
  }
  if (node.k === "col" && node.p["role"] === "omp.assistant") {
    let blockIdx = 0;
    for (const cid of node.c) {
      const child = surface.nodes.get(cid);
      if (child?.k === "md" && child.p["role"] === undefined && typeof child.p["text"] === "string") {
        const text = child.p["text"];
        const fenceRegex = /```(html|htm|svg|markdown|md)\b[^\r\n]*\r?\n([\s\S]*?)```/gi;
        let match: RegExpExecArray | null;
        while ((match = fenceRegex.exec(text)) !== null) {
          const rawLang = (match[1] ?? "").toLowerCase();
          const body = (match[2] ?? "").trim();
          if (body.length < 16) continue;
          blockIdx += 1;
          const ext: "html" | "svg" | "md" =
            rawLang === "html" || rawLang === "htm" ? "html" : rawLang === "svg" ? "svg" : "md";
          const name =
            ext === "html"
              ? `index-${blockIdx}.html`
              : ext === "svg"
                ? `diagram-${blockIdx}.svg`
                : `document-${blockIdx}.md`;
          const artifactId = `${id}-${blockIdx}`;
          const meta = fileBadgeMeta(name);
          items.push({
            key: `art:${artifactId}`,
            name,
            dirPath: "",
            badge: meta.badge,
            langBadge: meta.langBadge,
            subtitleZh: meta.subtitleZh,
            subtitleEn: meta.subtitleEn,
            operation: "write",
            added: body.split("\n").length,
            removed: 0,
            artifact: { id: artifactId, name, ext, content: body },
          });
        }
      }
    }
  }
  return items;
}

function dedupeDeliverables(list: readonly DeliverableItem[]): readonly DeliverableItem[] {
  if (list.length === 0) return EMPTY_DELIVERABLES;
  const map = new Map<string, DeliverableItem>();
  for (const item of list) {
    const prev = map.get(item.key);
    if (!prev) {
      map.set(item.key, item);
    } else {
      // 同一文件的多次操作合并（对齐 dsh-claude-style file-row-merge.ts）：累加 +M -N，保留最新 Diff 节点与最高写操作级别
      const nextOp =
        item.operation === "write" || prev.operation === "write"
          ? "write"
          : item.operation === "edit" || prev.operation === "edit"
            ? "edit"
            : "read";
      map.set(item.key, {
        ...prev,
        ...item,
        operation: nextOp,
        added: prev.added + item.added,
        removed: prev.removed + item.removed,
        ...(item.bodyNodeId !== undefined
          ? { bodyNodeId: item.bodyNodeId, bodyKind: item.bodyKind }
          : prev.bodyNodeId !== undefined
            ? { bodyNodeId: prev.bodyNodeId, bodyKind: prev.bodyKind }
            : {}),
      });
    }
  }
  return [...map.values()];
}

function buildSurfaceSegments(surface: DocSurface): readonly MainSegment[] {
  const main = surface.nodes.get("main");
  if (!main) return EMPTY_SEGMENTS;
  const out: MainSegment[] = [];
  let runIds: string[] = [];
  let runThoughts = 0;
  let runTools = 0;
  let runDurationMs = 0;
  let runRunning = false;
  let runDeliverables: DeliverableItem[] = [];
  let currentTurnIndex = -1;

  const flush = (fallbackTurnMs = 0, hasFollowingAnswer = false) => {
    if (runIds.length === 0) return;
    if (runThoughts + runTools >= 1) {
      out.push({
        kind: "process",
        ids: runIds,
        thoughts: runThoughts,
        tools: runTools,
        durationMs: runDurationMs > 0 ? runDurationMs : fallbackTurnMs,
        turnIndex: currentTurnIndex,
        running: runRunning,
        settled: !runRunning && hasFollowingAnswer,
        deliverables: dedupeDeliverables(runDeliverables),
      });
    } else {
      for (const id of runIds) out.push({ kind: "item", id, deliverables: EMPTY_DELIVERABLES });
    }
    runIds = [];
    runThoughts = 0;
    runTools = 0;
    runDurationMs = 0;
    runRunning = false;
    runDeliverables = [];
  };
  for (const id of main.c) {
    const node = surface.nodes.get(id);
    if (!node) continue;
    if (node.k === "card" && node.p["role"] === "omp.user") {
      flush(0, true);
      currentTurnIndex += 1;
      out.push({
        kind: "item",
        id,
        deliverables: dedupeDeliverables(extractNodeDeliverables(surface, id)),
      });
      continue;
    }
    // 1. 工具调用（除 ask 外）：直接进过程组
    if (node.k === "tool" && node.p["role"] !== "omp.tool.ask") {
      runIds.push(id);
      runTools += 1;
      runDurationMs += nodeDurationMs(surface, id);
      if (isProcessNodeRunning(surface, id)) runRunning = true;
      runDeliverables.push(...extractNodeDeliverables(surface, id));
      continue;
    }
    // 2. 助手容器（omp.assistant）：把其中的 omp.thinking 思考块提取进过程组；如果还有正式回答（md / error / usage），
    //    先结算过程组，再画助手容器（AssistantCol 里会跳过已被过程组接管的 omp.thinking 子节点）。
    if (node.k === "col" && node.p["role"] === "omp.assistant") {
      const thoughtIds = node.c.filter((cid) => isThinkingSection(surface, cid));
      const otherIds = node.c.filter((cid) => !isThinkingSection(surface, cid));
      if (thoughtIds.length > 0) {
        runIds.push(...thoughtIds);
        runThoughts += thoughtIds.length;
        for (const tid of thoughtIds) {
          runDurationMs += nodeDurationMs(surface, tid);
          if (isProcessNodeRunning(surface, tid)) runRunning = true;
        }
      }
      if (otherIds.length === 0) {
        // 纯思考或空助手容器：留在当前过程组里继续往后合并
        continue;
      }
      let turnUsageMs = 0;
      for (const oid of otherIds) {
        const onode = surface.nodes.get(oid);
        if (onode?.p["role"] === "omp.turn.usage") {
          turnUsageMs = parseDurationTextMs(extractPlainText(surface, oid));
        }
      }
      const mergedDeliverables = dedupeDeliverables([...runDeliverables, ...extractNodeDeliverables(surface, id)]);
      runDeliverables = [];
      flush(turnUsageMs, true);
      out.push({
        kind: "item",
        id,
        deliverables: mergedDeliverables,
      });
      continue;
    }
    flush();
    out.push({
      kind: "item",
      id,
      deliverables: dedupeDeliverables(extractNodeDeliverables(surface, id)),
    });
  }
  flush();
  return out;
}

function deriveSegmentsBySurface(doc: TspDocument): ReadonlyMap<string, readonly MainSegment[]> {
  const map = new Map<string, readonly MainSegment[]>();
  for (const [sfId, surface] of doc.surfaces) {
    map.set(sfId, buildSurfaceSegments(surface));
  }
  return map;
}

function sameDeliverables(a: readonly DeliverableItem[], b: readonly DeliverableItem[]): boolean {
  return a.length === b.length && a.every((item, i) => item.key === b[i]?.key);
}

function sameSegment(a: MainSegment, b: MainSegment): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "item" && b.kind === "item") {
    return a.id === b.id && sameDeliverables(a.deliverables, b.deliverables);
  }
  if (a.kind === "process" && b.kind === "process") {
    return (
      a.thoughts === b.thoughts &&
      a.tools === b.tools &&
      a.durationMs === b.durationMs &&
      a.running === b.running &&
      a.settled === b.settled &&
      a.ids.length === b.ids.length &&
      a.ids.every((id, i) => id === b.ids[i]) &&
      sameDeliverables(a.deliverables, b.deliverables)
    );
  }
  return false;
}

function sameSegmentsBySurface(
  a: ReadonlyMap<string, readonly MainSegment[]>,
  b: ReadonlyMap<string, readonly MainSegment[]>,
): boolean {
  if (a.size !== b.size) return false;
  for (const [sf, listA] of a) {
    const listB = b.get(sf);
    if (!listB || listA.length !== listB.length) return false;
    if (!listA.every((seg, i) => sameSegment(seg, listB[i]!))) return false;
  }
  return true;
}

function formatProcessSummary(thoughts: number, tools: number): string {
  const zh = currentLocale() === "zh-CN";
  const parts: string[] = [];
  if (thoughts > 0) {
    parts.push(zh ? `执行 ${thoughts} 次思考` : `${thoughts} ${thoughts === 1 ? "thought" : "thoughts"}`);
  }
  if (tools > 0) {
    parts.push(zh ? `调用 ${tools} 次工具` : `${tools} ${tools === 1 ? "tool call" : "tool calls"}`);
  }
  return parts.join(zh ? "，" : ", ");
}

function StatusLine({ note }: { note: StatusNote }) {
  return (
    <div className="tsp-status-note" data-testid="tsp-status-note">
      <Clamp lines={STATUS_NOTE_LINES}>{cleanGlyphs(note.text)}</Clamp>
    </div>
  );
}

/**
 * 图 6 反重力（Antigravity）风格的单文件变更行：
 * - 左侧语言类型徽标（M↓ / </> / {} / JS / TS / PY）+ 粗体文件名（点击直接在右侧栏打开预览）+ 浅灰目录路径
 * - 右侧 +added（绿） -removed（红）行数统计
 * - 单个文件的内联 Diff 默认不展开（expanded = false），点击该行任意空白处即可展开/收起该文件的 Diff！
 */
function AntigravityFileRow({ item, ctx }: { item: DeliverableItem; ctx: TspContext }) {
  const zh = currentLocale() === "zh-CN";
  const hasBody = item.bodyNodeId !== undefined;
  // 单个文件 DIFF 默认不展开，点击行时展开
  const [expanded, setExpanded] = useState(false);

  const openInSidebar = (event: React.MouseEvent) => {
    event.stopPropagation();
    if (item.filePath !== undefined) openFilePreview(ctx.taskId, item.filePath);
    else if (item.artifact !== undefined) openInlineArtifact(ctx.taskId, item.artifact);
  };

  return (
    <div
      className="tsp-ag-file"
      data-operation={item.operation}
      data-badge={item.badge}
      data-expanded={expanded && hasBody ? "" : undefined}
      data-testid="tsp-deliverable-card"
    >
      <div
        className="tsp-ag-file-row"
        onClick={() => {
          if (hasBody) setExpanded((prev) => !prev);
          else if (item.filePath !== undefined) openFilePreview(ctx.taskId, item.filePath);
          else if (item.artifact !== undefined) openInlineArtifact(ctx.taskId, item.artifact);
        }}
      >
        <span className="tsp-ag-file-badge" data-kind={item.langBadge.kind} aria-hidden="true">
          {item.langBadge.label}
        </span>
        <button
          type="button"
          className="tsp-ag-file-name"
          onClick={openInSidebar}
          title={zh ? "点击在右侧栏打开查看" : "Click to open in sidebar"}
        >
          {item.name}
        </button>
        {item.dirPath !== "" && <span className="tsp-ag-file-dir">{item.dirPath}</span>}
        <span className="tsp-dsh-file-suffix" data-testid="tsp-deliverable-diff-stats">
          <span className="tsp-dsh-file-stat tsp-dsh-file-add">+{item.added}</span>
          <span className="tsp-dsh-file-stat tsp-dsh-file-del">-{item.removed}</span>
        </span>
        {hasBody && (
          <span className="tsp-dsh-file-chev" data-open={expanded ? "" : undefined} aria-hidden="true">
            <ChevronDown />
          </span>
        )}
      </div>
      {hasBody && expanded && item.bodyNodeId !== undefined && (
        <div className="tsp-dsh-file-body" onClick={(e) => e.stopPropagation()} data-testid="tsp-deliverable-diff-body">
          <TspNode id={item.bodyNodeId} ctx={ctx} />
        </div>
      )}
    </div>
  );
}

/**
 * 图 5 DSH 风格的双列交付文件卡片（针对 .svg / .html / .md / 图片等交付物，点击直接在侧边栏打开查看）：
 * - 左侧 38×38 圆角柔和着色图标块
 * - 中间粗体文件名 + 副标题描述
 * - 右侧 [文件夹/侧栏预览] 与 [v 展开] 两个精致方框按钮
 */
function DshDeliverableCard({ item, ctx }: { item: DeliverableItem; ctx: TspContext }) {
  const zh = currentLocale() === "zh-CN";
  const hasBody = item.bodyNodeId !== undefined;
  const [expanded, setExpanded] = useState(false);

  const openInSidebar = (event: React.MouseEvent) => {
    event.stopPropagation();
    if (item.filePath !== undefined) openFilePreview(ctx.taskId, item.filePath);
    else if (item.artifact !== undefined) openInlineArtifact(ctx.taskId, item.artifact);
  };

  return (
    <div className="tsp-dsh-card-wrap">
      <div className="tsp-dsh-card" data-badge={item.badge} data-testid="tsp-deliverable-card" onClick={openInSidebar}>
        <span className="tsp-dsh-card-icon" data-badge={item.badge} aria-hidden="true">
          <FileIcon size={18} />
        </span>
        <span className="tsp-dsh-card-main">
          <span className="tsp-dsh-card-title">{item.name}</span>
          <span className="tsp-dsh-card-sub">{zh ? item.subtitleZh : item.subtitleEn}</span>
        </span>
        <span className="tsp-dsh-card-actions">
          <button
            type="button"
            className="tsp-dsh-card-btn"
            onClick={openInSidebar}
            title={zh ? "在侧边栏预览打开" : "Open in sidebar preview"}
            aria-label={zh ? "在侧边栏预览打开" : "Open in sidebar preview"}
          >
            <External size={13} />
          </button>
          {hasBody && (
            <button
              type="button"
              className="tsp-dsh-card-btn"
              onClick={(e) => {
                e.stopPropagation();
                setExpanded((v) => !v);
              }}
              title={zh ? "展开/收起内联内容" : "Toggle inline preview"}
              aria-expanded={expanded}
            >
              <span className="tsp-dsh-file-chev" data-open={expanded ? "" : undefined}>
                <ChevronDown />
              </span>
            </button>
          )}
        </span>
      </div>
      {hasBody && expanded && item.bodyNodeId !== undefined && (
        <div className="tsp-dsh-file-body" onClick={(e) => e.stopPropagation()}>
          <TspNode id={item.bodyNodeId} ctx={ctx} />
        </div>
      )}
    </div>
  );
}

/**
 * 结合图 5（DSH 双列交付物卡片）与图 6（反重力 Antigravity 可展开/可搜索的「N files changed +M -K」变更面板）：
 * - 面板整体默认展开（panelOpen = true），支持按文件名/路径搜索过滤，右侧带「评审」按钮；
 * - 面板内每个单文件行默认收起 Diff（点击行展开单文件 Diff，点击文件名直接在右侧栏预览）；
 * - 可预览的交付文档（SVG / HTML / MD）同时提供图 5 风格的双列交付卡片。
 */
function DeliverableShelf({ ctx, items }: { ctx: TspContext; items: readonly DeliverableItem[] }) {
  const [panelOpen, setPanelOpen] = useState(true);
  const [query, setQuery] = useState("");
  const zh = currentLocale() === "zh-CN";
  if (items.length === 0) return null;

  const changedFiles = items.filter((i) => i.operation === "write" || i.operation === "edit");
  const deliverableDocs = items.filter((i) => i.operation === "read" || isDeliverableDocPath(i.name));

  const totalAdded = changedFiles.reduce((acc, i) => acc + i.added, 0);
  const totalRemoved = changedFiles.reduce((acc, i) => acc + i.removed, 0);
  const q = query.trim().toLowerCase();
  const filteredChanged =
    q === ""
      ? changedFiles
      : changedFiles.filter((i) => i.name.toLowerCase().includes(q) || i.dirPath.toLowerCase().includes(q));

  return (
    <div className="tsp-deliverables-host" data-testid="tsp-deliverables">
      {deliverableDocs.length > 0 && (
        <div className="tsp-dsh-cards-grid">
          {deliverableDocs.map((item) => (
            <DshDeliverableCard key={`doc:${item.key}`} item={item} ctx={ctx} />
          ))}
        </div>
      )}
      {changedFiles.length > 0 && (
        <div className="tsp-ag-panel" data-testid="tsp-ag-changes-panel">
          <div className="tsp-ag-head">
            <button
              type="button"
              className="tsp-ag-toggle"
              aria-expanded={panelOpen}
              onClick={() => setPanelOpen((v) => !v)}
              data-testid="tsp-ag-changes-toggle"
            >
              <span className="tsp-ag-count">
                {changedFiles.length} {changedFiles.length === 1 ? "file changed" : "files changed"}
              </span>
              <span className="tsp-ag-totals">
                <span className="tsp-dsh-file-stat tsp-dsh-file-add">+{totalAdded}</span>
                <span className="tsp-dsh-file-stat tsp-dsh-file-del">-{totalRemoved}</span>
              </span>
              <span className="tsp-dsh-file-chev" data-open={panelOpen ? "" : undefined} aria-hidden="true">
                <ChevronDown />
              </span>
            </button>
            {panelOpen && (
              <input
                type="search"
                className="tsp-ag-search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={zh ? "搜索变更文件或 Diff…" : "Search changed files…"}
                aria-label={zh ? "搜索变更文件" : "Search changed files"}
                data-testid="tsp-ag-changes-search"
              />
            )}
            <button
              type="button"
              className="tsp-ag-review-btn"
              onClick={() => {
                const first = changedFiles[0];
                if (!first) return;
                if (first.filePath !== undefined) openFilePreview(ctx.taskId, first.filePath);
                else if (first.artifact !== undefined) openInlineArtifact(ctx.taskId, first.artifact);
              }}
              data-testid="tsp-ag-changes-review"
            >
              <FileIcon size={12} />
              <span>{zh ? "评审" : "Review"}</span>
            </button>
          </div>
          {panelOpen && (
            <div className="tsp-ag-list">
              {filteredChanged.map((item) => (
                <AntigravityFileRow key={`chg:${item.key}`} item={item} ctx={ctx} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ProcessGroup({
  ids,
  thoughts,
  tools,
  durationMs,
  turnIndex,
  running,
  settled,
  deliverables,
  after,
  ctx,
}: {
  ids: readonly string[];
  thoughts: number;
  tools: number;
  durationMs: number;
  turnIndex: number;
  running: boolean;
  settled: boolean;
  deliverables: readonly DeliverableItem[];
  after: ReadonlyMap<string, StatusNote[]>;
  ctx: TspContext;
}) {
  // 运行中默认展开；当最终正式回答到达（settled 变为 true）时自动全部收起。用户手动点过则优先尊重用户当前阶段的选择。
  const [userFolded, setUserFolded] = useState<boolean | null>(null);
  const prevSettled = useRef(settled);
  useEffect(() => {
    if (prevSettled.current !== settled) {
      prevSettled.current = settled;
      setUserFolded(null);
    }
  }, [settled]);
  const folded = userFolded ?? settled;

  const bodyRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const layout = useShellValue("processRows") ?? "column";
  const label = formatProcessSummary(thoughts, tools);
  const extraTurnMs = useSessionExtras(ctx.taskId, (extras) =>
    turnIndex >= 0 ? (extras.turns[turnIndex]?.elapsedMs ?? 0) : 0,
  );
  const effectiveMs = durationMs > 0 ? durationMs : extraTurnMs;
  const durationText =
    effectiveMs >= 100 ? formatElapsed(effectiveMs, effectiveMs >= 1000 ? "seconds" : "short") : null;

  useEffect(() => {
    if (folded || !stickRef.current) return;
    const el = bodyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [folded, ids.length]);

  return (
    <div className="tsp-process-group" data-layout={layout} data-testid="tsp-process-group">
      <button
        type="button"
        className="tsp-process-summary"
        data-running={running || undefined}
        aria-expanded={!folded}
        onClick={() => setUserFolded(!folded)}
        data-testid="tsp-process-summary"
      >
        <span className="tsp-process-summary-text">{label}</span>
        {durationText !== null && (
          <>
            <span className="tsp-process-summary-sep" aria-hidden="true">
              ·
            </span>
            <span className="tsp-process-summary-time" data-testid="tsp-process-summary-time">
              {durationText}
            </span>
          </>
        )}
        <span className="tsp-process-summary-chev" aria-hidden="true">
          <ChevronDown />
        </span>
      </button>
      <div
        ref={bodyRef}
        className="tsp-process-group-body"
        data-layout={layout}
        hidden={folded}
        onScroll={(event) => {
          const el = event.currentTarget;
          stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
        }}
      >
        {ids.map((id) => (
          <Fragment key={id}>
            <TspNode id={id} ctx={ctx} />
            {(after.get(id) ?? []).map((note, i) => (
              <StatusLine key={`s-${id}-${i}`} note={note} />
            ))}
          </Fragment>
        ))}
      </div>
      <DeliverableShelf ctx={ctx} items={deliverables} />
    </div>
  );
}

// memo：外层（SurfaceBody）每次重渲染都新建 header / tail 等元素，这里的 props（任务、surface、memo 过的 ctx）不变就不重建整条对话。
export const MainFlow = memo(function MainFlow({ taskId, sf, ctx }: { taskId: TaskId; sf: string; ctx: TspContext }) {
  const bySurface = useTspDerived(taskId, deriveSegmentsBySurface, sameSegmentsBySurface);
  const notes = useTspStatusNotes(taskId, sf);
  const segments = bySurface?.get(sf);
  if (!segments || segments.length === 0) return null;

  // 锚点节点没了的状态行不画：下面只按 main.c 里的 id 取。
  const atStart: StatusNote[] = [];
  const after = new Map<string, StatusNote[]>();
  for (const note of notes) {
    if (note.anchor === null) atStart.push(note);
    else after.set(note.anchor, [...(after.get(note.anchor) ?? []), note]);
  }

  const out: ReactNode[] = atStart.map((note, i) => <StatusLine key={`s-start-${i}`} note={note} />);
  for (const seg of segments) {
    if (seg.kind === "process") {
      out.push(
        <ProcessGroup
          key={`pg-${seg.ids[0]}`}
          ids={seg.ids}
          thoughts={seg.thoughts}
          tools={seg.tools}
          durationMs={seg.durationMs}
          turnIndex={seg.turnIndex}
          running={seg.running}
          settled={seg.settled}
          deliverables={seg.deliverables}
          after={after}
          ctx={ctx}
        />,
      );
    } else {
      out.push(<TspNode key={seg.id} id={seg.id} ctx={ctx} />);
      if (seg.deliverables.length > 0) {
        out.push(<DeliverableShelf key={`dl-${seg.id}`} ctx={ctx} items={seg.deliverables} />);
      }
      (after.get(seg.id) ?? []).forEach((note, i) => out.push(<StatusLine key={`s-${seg.id}-${i}`} note={note} />));
    }
  }
  return <>{out}</>;
});
