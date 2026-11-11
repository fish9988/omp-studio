// 新任务页用量卡片的数据（纯函数，可单测）：兼容近 7 天点阵概览，以及 Bento 仪表盘（7天 / 30天 / 全部、26 周蓝阶方格热力图、模型堆叠柱状图与份额榜、书本折算行）。
// "今天"取热力图的 to（主进程按本地时区算好的最后一天），不在渲染进程另取时钟。
import type { UsageHeatmap } from "../../../../shared/ipc.ts";

/** 点阵画几周（每天一列）。 */
export const OVERVIEW_WEEKS = 12;
/** 一列最多几个点。 */
export const MAX_DOTS = 6;
const RECENT_DAYS = 7;

/** Bento 热力图周数（周日为首行，26 周 × 7 天）。 */
export const HEAT_WEEKS = 26;
/** 热力图蓝阶档数（1..4，0 为空）。 */
export const HEAT_STEPS = 4;
/** 模型堆叠图默认跨度（天）。 */
export const MODEL_CHART_DAYS = 30;
/** 模型列表默认展示行数。 */
export const MODEL_LIST_ROWS = 6;

export type UsageRange = "7d" | "30d" | "all";

export type YardstickBookKey =
  | "empty.bookTaoTeChing"
  | "empty.bookAnimalFarm"
  | "empty.bookHobbit"
  | "empty.bookThreeBody"
  | "empty.bookMobyDick"
  | "empty.bookThreeKingdoms"
  | "empty.bookHarryPotter";

const YARDSTICK_BOOKS: readonly { key: YardstickBookKey; tokens: number }[] = [
  { key: "empty.bookTaoTeChing", tokens: 7_607 },
  { key: "empty.bookAnimalFarm", tokens: 39_000 },
  { key: "empty.bookHobbit", tokens: 123_000 },
  { key: "empty.bookThreeBody", tokens: 202_000 },
  { key: "empty.bookMobyDick", tokens: 306_522 },
  { key: "empty.bookThreeKingdoms", tokens: 638_009 },
  { key: "empty.bookHarryPotter", tokens: 1_409_000 },
];

export interface UsageColumn {
  /** YYYY-MM-DD */
  date: string;
  tokens: number;
  /** 亮几个点：0 = 没用量；有用量至少 1 个，最多的那天 MAX_DOTS 个。 */
  dots: number;
  /** 属于最近 7 天（含今天）。 */
  recent: boolean;
}

export interface UsageOverview {
  weekTokens: number;
  weekCost: number;
  todayTokens: number;
  /** 从旧到新，OVERVIEW_WEEKS × 7 列，最后一列是今天。 */
  columns: UsageColumn[];
}

export interface HeatCell {
  date: string;
  tokens: number;
  costUsd: number;
  level: number;
}

export interface ModelRankRow {
  model: string;
  provider: string;
  requests: number;
  tokens: number;
  costUsd: number;
  /** 百分比 0..100 */
  share: number;
}

export interface ModelChartSlice {
  model: string;
  tokens: number;
  rank: number;
}

export interface ModelChartDay {
  date: string;
  total: number;
  slices: ModelChartSlice[];
}

export interface BentoUsageSummary {
  activeDays: number;
  requests: number;
  tokens: number;
  costUsd: number;
  todayTokens: number;
  topModel: string | null;
  cells: HeatCell[];
  yardstick: { bookKey: YardstickBookKey; count: number } | null;
  models: ModelRankRow[];
  chartDays: ModelChartDay[];
  axisTop: number;
}

function parseDate(text: string): Date {
  const [year, month, day] = text.split("-").map(Number);
  return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1);
}

/** 本地时区的 YYYY-MM-DD（和热力图的日期同一写法）。 */
export function localDateText(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** 一天亮几个点：按最多那天等比，四舍五入；有用量的日子至少 1 个点，不和没用量的日子混在一起。 */
export function dotCount(tokens: number, max: number, maxDots = MAX_DOTS): number {
  if (tokens <= 0 || max <= 0) return 0;
  return Math.min(maxDots, Math.max(1, Math.round((tokens / max) * maxDots)));
}

export function usageOverview(heatmap: Pick<UsageHeatmap, "to" | "days">): UsageOverview {
  const byDate = new Map(heatmap.days.map((day) => [day.date, day]));
  const total = OVERVIEW_WEEKS * 7;
  const cursor = parseDate(heatmap.to);
  cursor.setDate(cursor.getDate() - (total - 1));
  const days: { date: string; tokens: number; costUsd: number; recent: boolean }[] = [];
  for (let i = 0; i < total; i++) {
    const date = localDateText(cursor);
    const day = byDate.get(date);
    days.push({ date, tokens: day?.tokens ?? 0, costUsd: day?.costUsd ?? 0, recent: i >= total - RECENT_DAYS });
    cursor.setDate(cursor.getDate() + 1);
  }
  const max = Math.max(0, ...days.map((day) => day.tokens));
  const week = days.filter((day) => day.recent);
  return {
    weekTokens: week.reduce((sum, day) => sum + day.tokens, 0),
    weekCost: week.reduce((sum, day) => sum + day.costUsd, 0),
    todayTokens: days[total - 1]?.tokens ?? 0,
    columns: days.map(({ date, tokens, recent }) => ({ date, tokens, dots: dotCount(tokens, max), recent })),
  };
}

/** 纵轴顶值：向上取整到 1 / 2 / 2.5 / 5 / 10 × 10^n。 */
export function axisNiceMax(peak: number): number {
  if (!(peak > 0)) return 0;
  const magnitude = 10 ** Math.floor(Math.log10(peak));
  const scaled = peak / magnitude;
  const step = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 2.5 ? 2.5 : scaled <= 5 ? 5 : 10;
  return step * magnitude;
}

function rangeStartDate(to: string, range: UsageRange): string | null {
  if (range === "all") return null;
  const span = range === "7d" ? 7 : 30;
  const d = parseDate(to);
  d.setDate(d.getDate() - (span - 1));
  return localDateText(d);
}

function pickYardstick(tokens: number): { bookKey: YardstickBookKey; count: number } | null {
  let picked: { key: YardstickBookKey; tokens: number } | null = null;
  for (const book of YARDSTICK_BOOKS) {
    if (tokens >= book.tokens) picked = book;
  }
  if (picked === null) return null;
  // 在三体量级（200k..1.4M）优先用《三体》做折算标尺，读起来更直观。
  const threeBody = YARDSTICK_BOOKS[3];
  if (threeBody && tokens >= threeBody.tokens && tokens < 1_400_000) picked = threeBody;
  return {
    bookKey: picked.key,
    count: Math.max(1, Math.round(tokens / picked.tokens)),
  };
}

export function buildBentoUsage(
  heatmap: Pick<UsageHeatmap, "to" | "days"> & { models?: UsageHeatmap["models"] },
  range: UsageRange,
): BentoUsageSummary {
  const byDate = new Map(heatmap.days.map((day) => [day.date, day]));
  const start = rangeStartDate(heatmap.to, range);
  const inRange = (date: string) => start === null || (date >= start && date <= heatmap.to);

  let activeDays = 0;
  let requests = 0;
  let tokens = 0;
  let costUsd = 0;
  for (const day of heatmap.days) {
    if (!inRange(day.date)) continue;
    if (day.tokens > 0 || day.requests > 0) activeDays += 1;
    requests += day.requests;
    tokens += day.tokens;
    costUsd += day.costUsd;
  }
  const todayTokens = byDate.get(heatmap.to)?.tokens ?? 0;

  // 26 周方格热力图：从周日对齐的起点一路排到今天。
  const end = parseDate(heatmap.to);
  const gridStart = new Date(end);
  gridStart.setDate(gridStart.getDate() - (HEAT_WEEKS * 7 - 1));
  gridStart.setDate(gridStart.getDate() - gridStart.getDay());
  const cells: HeatCell[] = [];
  let heatPeak = 0;
  for (let offset = 0; offset < HEAT_WEEKS * 7 + 7; offset += 1) {
    const cursor = new Date(gridStart);
    cursor.setDate(gridStart.getDate() + offset);
    const key = localDateText(cursor);
    if (key > heatmap.to) break;
    const day = byDate.get(key);
    const dayTokens = day?.tokens ?? 0;
    if (dayTokens > heatPeak) heatPeak = dayTokens;
    cells.push({ date: key, tokens: dayTokens, costUsd: day?.costUsd ?? 0, level: 0 });
  }
  if (heatPeak > 0) {
    for (const cell of cells) {
      if (cell.tokens <= 0) continue;
      cell.level = Math.max(1, Math.min(HEAT_STEPS, Math.ceil((cell.tokens / heatPeak) * HEAT_STEPS)));
    }
  }

  // 模型汇总与每日堆叠图
  const modelRows = heatmap.models ?? [];
  const agg = new Map<string, { model: string; provider: string; requests: number; tokens: number; costUsd: number }>();
  for (const item of modelRows) {
    if (!inRange(item.date)) continue;
    const prev = agg.get(item.model);
    if (prev) {
      prev.requests += item.requests;
      prev.tokens += item.tokens;
      prev.costUsd += item.costUsd;
      if (item.provider !== "") prev.provider = item.provider;
    } else {
      agg.set(item.model, {
        model: item.model,
        provider: item.provider,
        requests: item.requests,
        tokens: item.tokens,
        costUsd: item.costUsd,
      });
    }
  }
  const sortedModels = [...agg.values()].sort((a, b) => b.tokens - a.tokens || b.requests - a.requests);
  const modelTotalTokens = sortedModels.reduce((sum, item) => sum + item.tokens, 0);
  const models: ModelRankRow[] = sortedModels.map((item) => ({
    ...item,
    share: modelTotalTokens > 0 ? (item.tokens / modelTotalTokens) * 100 : 0,
  }));
  const rankOf = new Map(models.map((item, idx) => [item.model, idx]));

  const chartSpan = range === "7d" ? 7 : MODEL_CHART_DAYS;
  const chartCursor = parseDate(heatmap.to);
  chartCursor.setDate(chartCursor.getDate() - (chartSpan - 1));
  const perDayModels = new Map<string, Map<string, number>>();
  for (const item of modelRows) {
    if (item.tokens <= 0) continue;
    let map = perDayModels.get(item.date);
    if (!map) {
      map = new Map();
      perDayModels.set(item.date, map);
    }
    map.set(item.model, (map.get(item.model) ?? 0) + item.tokens);
  }

  const chartDays: ModelChartDay[] = [];
  let chartPeak = 0;
  for (let i = 0; i < chartSpan; i++) {
    const date = localDateText(chartCursor);
    const map = perDayModels.get(date);
    let dayTotal = 0;
    const slices: ModelChartSlice[] = [];
    if (map) {
      for (const [model, modelTok] of map) {
        dayTotal += modelTok;
        slices.push({ model, tokens: modelTok, rank: Math.min(rankOf.get(model) ?? 7, 7) });
      }
      slices.sort((a, b) => a.rank - b.rank);
    }
    if (dayTotal > chartPeak) chartPeak = dayTotal;
    chartDays.push({ date, total: dayTotal, slices });
    chartCursor.setDate(chartCursor.getDate() + 1);
  }

  return {
    activeDays,
    requests,
    tokens,
    costUsd,
    todayTokens,
    topModel: models[0]?.model ?? null,
    cells,
    yardstick: pickYardstick(tokens),
    models,
    chartDays,
    axisTop: axisNiceMax(chartPeak),
  };
}
