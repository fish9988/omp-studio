// 输入框工具行右侧紧凑遥测药丸：展示多轮会话轮次与 Prompt 缓存命中率，点击直达会话用量对话框。
import type { TaskState } from "../../../../shared/ipc.ts";
import { useT } from "../../i18n/use-t.ts";
import { setUsageDialogOpen } from "./usage-store.ts";

export function SessionTelemetry({ usage }: { usage: TaskState["sessionUsage"] }) {
  const t = useT();
  if (usage === null) return null;
  const turns = usage.requests ?? 0;
  const promptTotal = usage.tokens.input + usage.tokens.cacheRead + usage.tokens.cacheWrite;
  const hitPct = promptTotal > 0 ? Math.round((usage.tokens.cacheRead / promptTotal) * 100) : null;
  const showCache = usage.tokens.cacheRead > 0 && hitPct !== null;
  if (turns < 2 && !showCache) return null;

  const tier = hitPct === null ? undefined : hitPct >= 75 ? "high" : hitPct >= 40 ? "mid" : "low";
  const parts: string[] = [];
  if (turns >= 2) parts.push(t("composer.telemetryTurns", { n: turns }));
  if (showCache && hitPct !== null) parts.push(t("composer.telemetryCache", { p: hitPct }));

  return (
    <button
      type="button"
      className="composer-telem"
      data-testid="session-telemetry"
      data-tier={tier}
      title={t("composer.telemetryTip")}
      onClick={() => setUsageDialogOpen(true)}
    >
      {parts.join(" · ")}
    </button>
  );
}
