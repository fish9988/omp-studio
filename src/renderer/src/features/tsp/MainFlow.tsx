// 对话区的 main：omp 发来的子节点，加上 omp 终端里有、TSP 文档里留不住的状态行（切模型的 "Session-only model: …" 等）：
// 文档里记下来的（shared/tsp/status-notes.ts），停在它出现时前面的那个节点后面。那个节点没了（压缩、/tree、恢复会话
// 这类整段重建对话，omp 删掉旧节点重画）就不再画：终端里重建也会清掉状态行（omp 18.12.5 实录 session-tree-compacted.jsonl）。
// 状态行最多露两行：MCP 工具多时启动的 `xdev: xd://: mounted …` 会列出全部工具名，占满一屏（2026-11-06 仓库所有者），
// 多出的收进和工具输出一样的"N more lines"。
import { Fragment, memo, useEffect, useRef, useState, type ReactNode } from "react";
import type { TaskId } from "../../../../shared/ipc.ts";
import type { DocSurface, TspDocument } from "../../../../shared/tsp/document.ts";
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

interface DeliverableItem {
  key: string;
  name: string;
  badge: "SVG" | "HTML" | "MD" | "FILE";
  subtitleZh: string;
  subtitleEn: string;
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

function fileBadge(filePath: string): {
  badge: DeliverableItem["badge"];
  subtitleZh: string;
  subtitleEn: string;
} {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".svg")) {
    return {
      badge: "SVG",
      subtitleZh: "SVG 矢量图形 · 点击在侧栏渲染预览",
      subtitleEn: "SVG vector graphic · Click to preview",
    };
  }
  if (lower.endsWith(".html") || lower.endsWith(".htm")) {
    return {
      badge: "HTML",
      subtitleZh: "HTML 网页文档 · 点击在侧栏渲染预览",
      subtitleEn: "HTML document · Click to preview",
    };
  }
  if (lower.endsWith(".md") || lower.endsWith(".markdown")) {
    return {
      badge: "MD",
      subtitleZh: "Markdown 文档 · 点击在侧栏渲染预览",
      subtitleEn: "Markdown document · Click to preview",
    };
  }
  return {
    badge: "FILE",
    subtitleZh: "已交付文件 · 点击在侧栏打开预览",
    subtitleEn: "Deliverable file · Click to preview",
  };
}

function isDeliverableDocPath(filePath: string): boolean {
  return /\.(svg|html?|md|markdown)$/i.test(filePath);
}

function extractNodeDeliverables(surface: DocSurface, id: string): DeliverableItem[] {
  const node = surface.nodes.get(id);
  if (!node) return [];
  const items: DeliverableItem[] = [];

  const pushFile = (rawPath: string) => {
    const cleaned = cleanDeliverablePath(rawPath);
    if (cleaned === "" || !isDeliverableDocPath(cleaned)) return;
    const parts = cleaned.split(/[\\/]/).filter(Boolean);
    const name = parts[parts.length - 1] ?? cleaned;
    const rel = /^[a-zA-Z]:[\\/]/.test(cleaned) || cleaned.startsWith("/") ? name : cleaned;
    const meta = fileBadge(rel);
    items.push({
      key: `file:${rel}`,
      name,
      badge: meta.badge,
      subtitleZh: meta.subtitleZh,
      subtitleEn: meta.subtitleEn,
      filePath: rel,
    });
  };

  // 1. write / edit / read 工具涉及的 .svg / .html / .md 文档
  if (node.k === "tool" && node.p["status"] === "done") {
    const toolName = node.p["name"];
    if (toolName === "write" || toolName === "edit" || toolName === "read") {
      if (typeof node.p["target"] === "string") pushFile(node.p["target"]);
      else if (typeof node.p["href"] === "string") pushFile(node.p["href"]);
      for (const cid of node.c) {
        const child = surface.nodes.get(cid);
        if (child?.p["role"] === "omp.tool.file") {
          if (typeof child.p["title"] === "string") pushFile(child.p["title"]);
          else if (typeof child.p["href"] === "string") pushFile(child.p["href"]);
          for (const gcid of child.c) {
            const gc = surface.nodes.get(gcid);
            if (typeof gc?.p["title"] === "string") pushFile(gc.p["title"]);
            else if (typeof gc?.p["href"] === "string") pushFile(gc.p["href"]);
            else if (typeof gc?.p["text"] === "string") pushFile(gc.p["text"]);
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
          const meta = fileBadge(name);
          const artifactId = `${id}-${blockIdx}`;
          items.push({
            key: `art:${artifactId}`,
            name,
            badge: meta.badge,
            subtitleZh: meta.subtitleZh,
            subtitleEn: meta.subtitleEn,
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
  for (const item of list) map.set(item.key, item);
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
      flush(turnUsageMs, true);
      out.push({
        kind: "item",
        id,
        deliverables: dedupeDeliverables(extractNodeDeliverables(surface, id)),
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

function DeliverableShelf({ taskId, items }: { taskId: TaskId; items: readonly DeliverableItem[] }) {
  if (items.length === 0) return null;
  const zh = currentLocale() === "zh-CN";
  return (
    <div className="tsp-deliverables" data-testid="tsp-deliverables">
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          className="tsp-deliverable-card"
          data-badge={item.badge}
          data-testid="tsp-deliverable-card"
          onClick={() => {
            if (item.filePath !== undefined) openFilePreview(taskId, item.filePath);
            else if (item.artifact !== undefined) openInlineArtifact(taskId, item.artifact);
          }}
        >
          <span className="tsp-deliverable-badge" data-badge={item.badge}>
            {item.badge === "FILE" ? <FileIcon size={14} /> : item.badge}
          </span>
          <span className="tsp-deliverable-info">
            <span className="tsp-deliverable-name">{item.name}</span>
            <span className="tsp-deliverable-sub">{zh ? item.subtitleZh : item.subtitleEn}</span>
          </span>
          <span className="tsp-deliverable-open" aria-hidden="true">
            <External size={14} />
          </span>
        </button>
      ))}
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
      <DeliverableShelf taskId={ctx.taskId} items={deliverables} />
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
        out.push(<DeliverableShelf key={`dl-${seg.id}`} taskId={taskId} items={seg.deliverables} />);
      }
      (after.get(seg.id) ?? []).forEach((note, i) => out.push(<StatusLine key={`s-${seg.id}-${i}`} note={note} />));
    }
  }
  return <>{out}</>;
});
