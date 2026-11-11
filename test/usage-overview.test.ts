import { describe, expect, it } from "vitest";
import {
  axisNiceMax,
  buildBentoUsage,
  dotCount,
  MAX_DOTS,
  OVERVIEW_WEEKS,
  usageOverview,
} from "../src/renderer/src/features/empty/usage-overview.ts";

const day = (date: string, tokens: number, costUsd = 0, requests = 1) => ({ date, requests, tokens, costUsd });

describe("dotCount", () => {
  it("按最多那天等比四舍五入，有用量至少 1 个点", () => {
    expect(dotCount(0, 100)).toBe(0);
    expect(dotCount(5, 0)).toBe(0);
    expect(dotCount(100, 100)).toBe(MAX_DOTS);
    expect(dotCount(50, 100)).toBe(3);
    expect(dotCount(1, 1000)).toBe(1);
  });
});

describe("usageOverview", () => {
  it("近 7 天合计、今天、点阵列", () => {
    const overview = usageOverview({
      to: "2026-03-02",
      days: [
        day("2026-03-02", 42_000, 0.5),
        day("2026-02-28", 100_000, 1),
        day("2026-02-24", 8_000, 0.25),
        // 第 8 天前，不算进本周，但参与点阵高度
        day("2026-02-23", 200_000, 9),
        day("2025-12-01", 999_999_999),
      ],
    });
    expect(overview.weekTokens).toBe(150_000);
    expect(overview.weekCost).toBeCloseTo(1.75);
    expect(overview.todayTokens).toBe(42_000);
    expect(overview.columns).toHaveLength(OVERVIEW_WEEKS * 7);
    const last = overview.columns.at(-1);
    expect(last).toMatchObject({ date: "2026-03-02", recent: true, dots: 1 });
    const byDate = new Map(overview.columns.map((column) => [column.date, column]));
    expect(byDate.get("2026-02-23")).toMatchObject({ recent: false, dots: MAX_DOTS });
    expect(byDate.get("2026-02-24")).toMatchObject({ recent: true, dots: 1 });
    expect(byDate.get("2026-02-28")).toMatchObject({ recent: true, dots: 3 });
    expect(byDate.get("2026-03-01")).toMatchObject({ tokens: 0, dots: 0 });
    expect(overview.columns.filter((column) => column.recent)).toHaveLength(7);
  });

  it("没有数据：全空的点阵，合计 0", () => {
    const overview = usageOverview({ to: "2026-01-03", days: [] });
    expect(overview.weekTokens).toBe(0);
    expect(overview.todayTokens).toBe(0);
    expect(overview.columns[0]?.date).toBe("2025-10-12");
    expect(overview.columns.every((column) => column.dots === 0)).toBe(true);
  });
});

describe("buildBentoUsage", () => {
  it("按 7d / 30d / all 聚合指标、模型份额与书本标尺", () => {
    const fixture = {
      to: "2026-03-02",
      days: [
        day("2026-03-02", 250_000, 1.2, 12),
        day("2026-02-28", 150_000, 0.8, 8),
        day("2026-02-10", 600_000, 3.0, 30),
        day("2025-11-01", 500_000, 2.5, 20),
      ],
      models: [
        {
          date: "2026-03-02",
          model: "claude-sonnet-4-6",
          provider: "anthropic",
          requests: 10,
          tokens: 200_000,
          costUsd: 1.0,
        },
        { date: "2026-03-02", model: "deepseek-chat", provider: "deepseek", requests: 2, tokens: 50_000, costUsd: 0.2 },
        {
          date: "2026-02-28",
          model: "claude-sonnet-4-6",
          provider: "anthropic",
          requests: 8,
          tokens: 150_000,
          costUsd: 0.8,
        },
        {
          date: "2026-02-10",
          model: "deepseek-chat",
          provider: "deepseek",
          requests: 30,
          tokens: 600_000,
          costUsd: 3.0,
        },
      ],
    };

    const week = buildBentoUsage(fixture, "7d");
    expect(week.tokens).toBe(400_000);
    expect(week.requests).toBe(20);
    expect(week.activeDays).toBe(2);
    expect(week.todayTokens).toBe(250_000);
    expect(week.topModel).toBe("claude-sonnet-4-6");
    expect(week.yardstick).toEqual({ bookKey: "empty.bookThreeBody", count: 2 });
    expect(week.models[0]).toMatchObject({ model: "claude-sonnet-4-6", tokens: 350_000 });
    expect(week.models[0]?.share).toBeCloseTo(87.5);
    expect(week.chartDays).toHaveLength(7);

    const month = buildBentoUsage(fixture, "30d");
    expect(month.tokens).toBe(1_000_000);
    expect(month.topModel).toBe("deepseek-chat");
    expect(month.chartDays).toHaveLength(30);

    const all = buildBentoUsage(fixture, "all");
    expect(all.tokens).toBe(1_500_000);
    expect(all.activeDays).toBe(4);
    expect(axisNiceMax(250_000)).toBe(250_000);
    expect(axisNiceMax(310_000)).toBe(500_000);
  });
});
