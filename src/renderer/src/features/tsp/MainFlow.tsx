// 对话区的 main：omp 发来的子节点，加上 omp 终端里有、TSP 文档里留不住的状态行（切模型的 "Session-only model: …" 等）：
// 文档里记下来的（shared/tsp/status-notes.ts），停在它出现时前面的那个节点后面。那个节点没了（压缩、/tree、恢复会话
// 这类整段重建对话，omp 删掉旧节点重画）就不再画：终端里重建也会清掉状态行（omp 18.12.5 实录 session-tree-compacted.jsonl）。
// 状态行最多露两行：MCP 工具多时启动的 `xdev: xd://: mounted …` 会列出全部工具名，占满一屏（2026-11-06 仓库所有者），
// 多出的收进和工具输出一样的"N more lines"。
import { Fragment, memo, useState, type ReactNode } from "react";
import type { TaskId } from "../../../../shared/ipc.ts";
import type { DocSurface, TspDocument } from "../../../../shared/tsp/document.ts";
import type { StatusNote } from "../../../../shared/tsp/status-notes.ts";
import { useShellValue } from "../../app/shell-store.ts";
import { ChevronDown } from "../../icons.tsx";
import { currentLocale } from "../../store/settings-store.ts";
import { Clamp } from "./Clamp.tsx";
import type { TspContext } from "./node-props.ts";
import { cleanGlyphs } from "./span-tokens.ts";
import { TspNode } from "./TspChildren.tsx";
import { useTspDerived, useTspStatusNotes } from "./tsp-store.ts";

const STATUS_NOTE_LINES = 2;

type MainSegment =
  { kind: "item"; id: string } | { kind: "process"; ids: readonly string[]; thoughts: number; tools: number };

const EMPTY_SEGMENTS: readonly MainSegment[] = [];

function classifyProcessStep(surface: DocSurface, id: string): { thoughts: number; tools: number } | null {
  const node = surface.nodes.get(id);
  if (!node) return null;
  if (node.k === "tool") {
    if (node.p["role"] === "omp.tool.ask") return null;
    return { thoughts: 0, tools: 1 };
  }
  if (node.k === "col" && node.p["role"] === "omp.assistant") {
    let thoughts = 0;
    for (const cid of node.c) {
      const child = surface.nodes.get(cid);
      if (!child) continue;
      const role = child.p["role"];
      if (typeof role === "string" && role.startsWith("omp.thinking")) {
        thoughts += 1;
      } else {
        return null;
      }
    }
    return { thoughts, tools: 0 };
  }
  return null;
}

function buildSurfaceSegments(surface: DocSurface): readonly MainSegment[] {
  const main = surface.nodes.get("main");
  if (!main) return EMPTY_SEGMENTS;
  const out: MainSegment[] = [];
  let runIds: string[] = [];
  let runThoughts = 0;
  let runTools = 0;

  const flush = () => {
    if (runIds.length === 0) return;
    if (runThoughts + runTools >= 1) {
      out.push({ kind: "process", ids: runIds, thoughts: runThoughts, tools: runTools });
    } else {
      for (const id of runIds) out.push({ kind: "item", id });
    }
    runIds = [];
    runThoughts = 0;
    runTools = 0;
  };

  for (const id of main.c) {
    const step = classifyProcessStep(surface, id);
    if (step !== null) {
      runIds.push(id);
      runThoughts += step.thoughts;
      runTools += step.tools;
    } else {
      flush();
      out.push({ kind: "item", id });
    }
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

function sameSegment(a: MainSegment, b: MainSegment): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "item" && b.kind === "item") return a.id === b.id;
  if (a.kind === "process" && b.kind === "process") {
    return (
      a.thoughts === b.thoughts &&
      a.tools === b.tools &&
      a.ids.length === b.ids.length &&
      a.ids.every((id, i) => id === b.ids[i])
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

function ProcessGroup({
  ids,
  thoughts,
  tools,
  after,
  ctx,
}: {
  ids: readonly string[];
  thoughts: number;
  tools: number;
  after: ReadonlyMap<string, StatusNote[]>;
  ctx: TspContext;
}) {
  const [folded, setFolded] = useState(false);
  const layout = useShellValue("processRows") ?? "column";
  const label = formatProcessSummary(thoughts, tools);

  return (
    <div className="tsp-process-group" data-layout={layout} data-testid="tsp-process-group">
      <button
        type="button"
        className="tsp-process-summary"
        aria-expanded={!folded}
        onClick={() => setFolded((prev) => !prev)}
        data-testid="tsp-process-summary"
      >
        <span className="tsp-process-summary-text">{label}</span>
        <span className="tsp-process-summary-chev" aria-hidden="true">
          <ChevronDown />
        </span>
      </button>
      <div className="tsp-process-group-body" data-layout={layout} hidden={folded}>
        {ids.map((id) => (
          <Fragment key={id}>
            <TspNode id={id} ctx={ctx} />
            {(after.get(id) ?? []).map((note, i) => (
              <StatusLine key={`s-${id}-${i}`} note={note} />
            ))}
          </Fragment>
        ))}
      </div>
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
          after={after}
          ctx={ctx}
        />,
      );
    } else {
      out.push(<TspNode key={seg.id} id={seg.id} ctx={ctx} />);
      (after.get(seg.id) ?? []).forEach((note, i) => out.push(<StatusLine key={`s-${seg.id}-${i}`} note={note} />));
    }
  }
  return <>{out}</>;
});
