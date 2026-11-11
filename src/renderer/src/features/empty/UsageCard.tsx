// 新任务页 Bento 用量仪表盘：[概览 | 模型] × [7天 | 30天 | 全部]。
// 概览：3×2 指标磁贴 + 26 周蓝阶方格热力图（悬停跟随反色胶囊）+ 书本 Token 折算标尺。
// 模型：152px 每日模型堆叠柱状图 + 排名份额榜。
// 读不到（出错且没有缓存）就不显示卡片；统计库未建时只写一句说明。
import { useEffect, useMemo, useRef, useState } from "react";
import { useT } from "../../i18n/use-t.ts";
import { currentLocale } from "../../store/settings-store.ts";
import { loadHeatmap, useUsageHeatmap } from "../composer/usage-store.ts";
import { formatCost } from "../tsp/fmt.ts";
import { formatTokens } from "../tsp/turn-footer.ts";
import {
  buildBentoUsage,
  localDateText,
  MODEL_LIST_ROWS,
  type BentoUsageSummary,
  type HeatCell,
  type UsageRange,
} from "./usage-overview.ts";

type UsageTab = "overview" | "models";

function formatShortDate(dateText: string, locale: string): string {
  const [y, m, d] = dateText.split("-").map(Number);
  const dt = new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
  return new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" }).format(dt);
}

function HeatGrid({ cells, skeleton, locale }: { cells: readonly HeatCell[]; skeleton: boolean; locale: string }) {
  const t = useT();
  const gridRef = useRef<HTMLDivElement | null>(null);
  const tipRef = useRef<HTMLSpanElement | null>(null);
  const [tip, setTip] = useState<{ text: string; left: number; top: number; side: "above" | "below" } | null>(null);

  const onHoverCell = (cellEl: HTMLElement, cell: HeatCell) => {
    if (skeleton) return;
    const grid = gridRef.current;
    if (!grid) return;
    const text = t("empty.heatTip", {
      date: formatShortDate(cell.date, locale),
      tokens: formatTokens(cell.tokens),
      cost: formatCost(cell.costUsd),
    });
    const gridRect = grid.getBoundingClientRect();
    const cellRect = cellEl.getBoundingClientRect();
    const tipWidth = tipRef.current?.offsetWidth ?? 156;
    const tipHeight = tipRef.current?.offsetHeight ?? 28;
    const centered = cellRect.left + cellRect.width / 2 - tipWidth / 2;
    const clampedLeft = Math.min(Math.max(centered, gridRect.left), Math.max(gridRect.left, gridRect.right - tipWidth));
    const aboveRoom = cellRect.top - gridRect.top;
    const belowRoom = gridRect.bottom - cellRect.bottom;
    const side = belowRoom > aboveRoom && belowRoom >= tipHeight + 6 ? "below" : "above";
    const top = side === "below" ? cellRect.bottom - gridRect.top + 6 : cellRect.top - gridRect.top - tipHeight - 6;
    setTip({ text, left: clampedLeft - gridRect.left, top, side });
  };

  return (
    <div
      ref={gridRef}
      className="eu-heat"
      data-skeleton={skeleton ? "" : undefined}
      onMouseLeave={() => setTip(null)}
      role="img"
      aria-label={t("empty.usageTitle")}
      data-testid="empty-usage-chart"
    >
      {cells.map((cell) => (
        <span
          key={cell.date}
          className="eu-heat-cell"
          data-level={skeleton ? 0 : cell.level}
          onMouseEnter={(e) => onHoverCell(e.currentTarget, cell)}
        />
      ))}
      <span
        ref={tipRef}
        className="eu-heat-tip"
        data-shown={tip !== null ? "" : undefined}
        data-side={tip?.side ?? "above"}
        style={tip ? { transform: `translate3d(${tip.left}px, ${tip.top}px, 0)` } : undefined}
        aria-hidden="true"
      >
        {tip?.text ?? ""}
      </span>
    </div>
  );
}

function ModelsTab({ bento, skeleton, locale }: { bento: BentoUsageSummary; skeleton: boolean; locale: string }) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);

  if (!skeleton && bento.models.length === 0) {
    return (
      <div className="eu-models-empty" data-testid="empty-usage-models-empty">
        {t("empty.modelsEmpty")}
      </div>
    );
  }

  const gridTicks = [1, 0.75, 0.5, 0.25, 0] as const;
  const shown = expanded ? bento.models : bento.models.slice(0, MODEL_LIST_ROWS);
  const hiddenCount = bento.models.length - shown.length;
  const step = Math.max(1, Math.ceil(bento.chartDays.length / 5));

  return (
    <>
      <div className="eu-mchart" data-skeleton={skeleton ? "" : undefined} data-testid="empty-usage-models-chart">
        <div className="eu-mchart-plot">
          {gridTicks.map((ratio) => (
            <span key={ratio} className="eu-mchart-tick" style={{ bottom: `${ratio * 100}%` }}>
              {skeleton || bento.axisTop === 0 ? "" : formatTokens(Math.round(bento.axisTop * ratio))}
            </span>
          ))}
          <div key={`${bento.chartDays.length}:${bento.chartDays[0]?.date ?? ""}`} className="eu-mchart-bars">
            {bento.chartDays.map((day) => (
              <span
                key={day.date}
                className="eu-mchart-col"
                title={`${formatShortDate(day.date, locale)} · ${formatTokens(day.total)} tok`}
                style={{ height: `${bento.axisTop > 0 ? (day.total / bento.axisTop) * 100 : 0}%` }}
              >
                {day.slices.map((slice) => (
                  <span
                    key={slice.model}
                    className="eu-mchart-seg"
                    data-rank={slice.rank}
                    style={{ height: `${day.total > 0 ? (slice.tokens / day.total) * 100 : 0}%` }}
                  />
                ))}
              </span>
            ))}
          </div>
        </div>
        <div className="eu-mchart-axis">
          {bento.chartDays.map((day, idx) => {
            const isLast = idx === bento.chartDays.length - 1;
            const show =
              !skeleton && bento.axisTop > 0 && (isLast || idx % step === 0) && bento.chartDays.length - idx !== 1;
            if (!show && !isLast) return null;
            if (skeleton || bento.axisTop === 0) return null;
            const pct = bento.chartDays.length > 1 ? (idx / (bento.chartDays.length - 1)) * 100 : 100;
            return (
              <span
                key={day.date}
                className="eu-mchart-label"
                data-end={isLast ? "" : undefined}
                style={{ left: `${pct}%` }}
              >
                {formatShortDate(day.date, locale)}
              </span>
            );
          })}
        </div>
      </div>

      <div className="eu-models" data-skeleton={skeleton ? "" : undefined}>
        {(skeleton ? [0, 1, 2] : shown).map((entry, idx) => {
          if (typeof entry === "number") {
            return (
              <div key={entry} className="eu-model-row">
                <span className="eu-model-swatch" />
              </div>
            );
          }
          return (
            <div
              key={entry.model}
              className="eu-model-row"
              title={`${entry.model} · ${entry.requests.toLocaleString()} req · ${formatCost(entry.costUsd)}`}
            >
              <span className="eu-model-swatch" data-rank={Math.min(idx, 7)} />
              <span className="eu-model-name">{entry.model}</span>
              <span className="eu-model-tokens">{formatTokens(entry.tokens)} tok</span>
              <span className="eu-model-share">{entry.share.toFixed(1)}%</span>
            </div>
          );
        })}
        {!skeleton && bento.models.length > MODEL_LIST_ROWS && (
          <button
            type="button"
            className="eu-models-more"
            aria-expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? t("empty.modelsLess") : t("empty.modelsMore", { count: hiddenCount })}
          </button>
        )}
      </div>
    </>
  );
}

export function UsageCard() {
  const t = useT();
  const heatmap = useUsageHeatmap();
  const [tab, setTab] = useState<UsageTab>("overview");
  const [range, setRange] = useState<UsageRange>("7d");

  useEffect(() => {
    if (heatmap.data === null && !heatmap.busy) void loadHeatmap();
    // 只在挂载时读一次；失败了不在这里反复重试。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const data = heatmap.data;
  const bento = useMemo(
    () => buildBentoUsage(data ?? { to: localDateText(new Date()), days: [], models: [] }, range),
    [data, range],
  );

  if (data === null && heatmap.error !== null) return null;

  if (data !== null && !data.hasDatabase) {
    return (
      <section className="eu" data-testid="empty-usage" data-state="no-database" aria-labelledby="empty-usage-title">
        <h2 className="eu-label" id="empty-usage-title">
          {t("empty.usageTitle")}
        </h2>
        <p className="eu-note">{t("empty.usageNoDatabase")}</p>
      </section>
    );
  }

  const skeleton = data === null;
  const locale = currentLocale();
  const ranges: readonly { id: UsageRange; label: string }[] = [
    { id: "7d", label: t("empty.range7d") },
    { id: "30d", label: t("empty.range30d") },
    { id: "all", label: t("empty.rangeAll") },
  ];

  return (
    <section
      className="eu"
      data-testid="empty-usage"
      data-state={skeleton ? "loading" : "ready"}
      aria-label={t("empty.usageTitle")}
      aria-busy={skeleton || undefined}
    >
      <div className="eu-bar">
        <div className="eu-tabs" role="tablist" aria-label={t("empty.usageTitle")}>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "overview"}
            className="eu-pill"
            data-active={tab === "overview" ? "" : undefined}
            onClick={() => setTab("overview")}
            data-testid="empty-usage-tab-overview"
          >
            {t("empty.tabOverview")}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "models"}
            className="eu-pill"
            data-active={tab === "models" ? "" : undefined}
            onClick={() => setTab("models")}
            data-testid="empty-usage-tab-models"
          >
            {t("empty.tabModels")}
          </button>
        </div>

        <div className="eu-ranges" role="tablist" aria-label={t("empty.usageTitle")}>
          {ranges.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={range === item.id}
              className="eu-pill"
              data-active={range === item.id ? "" : undefined}
              onClick={() => setRange(item.id)}
              data-testid={`empty-usage-range-${item.id}`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "overview" ? (
        <>
          <div className="eu-stats">
            <div className="eu-stat" data-skeleton={skeleton ? "" : undefined}>
              <span className="eu-stat-label">{t("empty.statTokens")}</span>
              {skeleton ? (
                <span className="eu-stat-value" role="status" aria-label={t("empty.usageLoading")} />
              ) : (
                <span
                  className="eu-stat-value"
                  data-testid="empty-usage-total"
                  title={`${bento.tokens.toLocaleString()} tok`}
                >
                  {formatTokens(bento.tokens)} tok
                </span>
              )}
            </div>
            <div className="eu-stat" data-skeleton={skeleton ? "" : undefined}>
              <span className="eu-stat-label">{t("empty.statCost")}</span>
              <span className="eu-stat-value">{skeleton ? "" : formatCost(bento.costUsd)}</span>
            </div>
            <div className="eu-stat" data-skeleton={skeleton ? "" : undefined}>
              <span className="eu-stat-label">{t("empty.statToday")}</span>
              <span className="eu-stat-value">{skeleton ? "" : `${formatTokens(bento.todayTokens)} tok`}</span>
            </div>
            <div className="eu-stat" data-skeleton={skeleton ? "" : undefined}>
              <span className="eu-stat-label">{t("empty.statActiveDays")}</span>
              <span className="eu-stat-value">{skeleton ? "" : bento.activeDays.toLocaleString()}</span>
            </div>
            <div className="eu-stat" data-skeleton={skeleton ? "" : undefined}>
              <span className="eu-stat-label">{t("empty.statRequests")}</span>
              <span className="eu-stat-value">{skeleton ? "" : bento.requests.toLocaleString()}</span>
            </div>
            <div className="eu-stat" data-stat="model" data-skeleton={skeleton ? "" : undefined}>
              <span className="eu-stat-label">{t("empty.statTopModel")}</span>
              <span className="eu-stat-value" title={bento.topModel ?? undefined}>
                {skeleton ? "" : (bento.topModel ?? "—")}
              </span>
            </div>
          </div>

          <HeatGrid cells={bento.cells} skeleton={skeleton} locale={locale} />

          {!skeleton && bento.yardstick !== null && (
            <span className="eu-yardstick" data-testid="empty-usage-yardstick">
              {t("empty.bookYardstick", {
                count: bento.yardstick.count.toLocaleString(),
                book: t(bento.yardstick.bookKey),
              })}
            </span>
          )}
        </>
      ) : (
        <ModelsTab bento={bento} skeleton={skeleton} locale={locale} />
      )}
    </section>
  );
}
