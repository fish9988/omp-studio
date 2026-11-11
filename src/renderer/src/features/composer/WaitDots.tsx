// 运行等待三车道形变点阵加载器（复刻 DSH chat-wait 3-lane loader）：
// - bounce：三颗 4px 强调色圆点依次触底压扁弹起（启动 / 思考初段）
// - line：三颗圆点沿互成 120° 的三条简谐轨迹穿过中心（工具执行）
// - orbit：四颗圆点在 9.5×11.6 矩形四角成对轮换（上下文压缩 / 多子代理协作）
// 未显式锁定车道时每 4.8s 在三套动效间轮转；减弱动效下依赖 CSS --play-state 自动定格。
import { useEffect, useState } from "react";
import { useShellValue } from "../../app/shell-store.ts";
import { useSettings } from "../../store/settings-store.ts";
import { systemReducesMotion } from "../settings/motion-preference.ts";
import { PiWriteMark } from "./PiWriteMark.tsx";

export type WaitDotsLane = "bounce" | "line" | "orbit";

const LANES: readonly WaitDotsLane[] = ["bounce", "line", "orbit"];
const ROTATE_MS = 4800;

export function WaitDots({
  className = "run-mark",
  laneOverride,
}: {
  className?: string | undefined;
  laneOverride?: WaitDotsLane | undefined;
}) {
  const mascot = useShellValue("mascot") ?? "clawd";
  const settings = useSettings();
  const reducedMotion = (settings?.reduceMotion ?? false) || systemReducesMotion();
  const [autoLane, setAutoLane] = useState<WaitDotsLane>("bounce");

  useEffect(() => {
    if (mascot === "omp" || laneOverride !== undefined || reducedMotion) return;
    const timer = window.setInterval(() => {
      setAutoLane((prev) => {
        const others = LANES.filter((item) => item !== prev);
        return others[Math.floor(Math.random() * others.length)] ?? "bounce";
      });
    }, ROTATE_MS);
    return () => window.clearInterval(timer);
  }, [mascot, laneOverride, reducedMotion]);

  if (mascot === "omp") return <PiWriteMark className={className} />;

  const active = laneOverride ?? autoLane;

  return (
    <span className={`${className} wait-dots`} data-lane={active} aria-hidden="true">
      <span className={`wait-dots-lane is-bounce${active === "bounce" ? " is-active" : ""}`}>
        <span className="wait-dots-dot" />
        <span className="wait-dots-dot" />
        <span className="wait-dots-dot" />
      </span>
      <span className={`wait-dots-lane is-line${active === "line" ? " is-active" : ""}`}>
        <span className="wait-dots-dot" />
        <span className="wait-dots-dot" />
        <span className="wait-dots-dot" />
      </span>
      <span className={`wait-dots-lane is-orbit${active === "orbit" ? " is-active" : ""}`}>
        <span className="wait-dots-dot" />
        <span className="wait-dots-dot" />
        <span className="wait-dots-dot" />
        <span className="wait-dots-dot" />
      </span>
    </span>
  );
}
