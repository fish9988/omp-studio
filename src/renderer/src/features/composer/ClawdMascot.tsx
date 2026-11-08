// Claude Code Desktop 的像素小螃蟹 Clawd，站在输入框右上沿（dsh-claude-style 规范 §The composer crab）。
// 螃蟹画在 24×16 像素网格上，放大 2 倍为 48×32px，双脚踩在输入框上边线上。
import type { TaskStatus } from "../../../../shared/ipc.ts";

export function ClawdMascot({ status = "idle" }: { status?: TaskStatus | undefined }) {
  const running = status === "running" || status === "starting";
  const waiting = status === "needs_you";
  const error = status === "error";

  return (
    <div
      className="composer-crab"
      data-state={error ? "error" : waiting ? "waiting" : running ? "running" : "idle"}
      aria-hidden="true"
      data-testid="composer-crab"
    >
      <svg className="composer-crab-svg" width="48" height="32" viewBox="0 0 24 16" shapeRendering="crispEdges">
        {/* 左钳 */}
        {running || waiting ? (
          <path d="M0 1h4v4H0zM2 5h2v3H2z" fill="#D97757" />
        ) : (
          <path d="M0 4h4v4H0z" fill="#D97757" />
        )}
        {/* 右钳 */}
        {running ? (
          <path d="M20 4h4v4h-4z" fill="#D97757" />
        ) : waiting ? (
          <path d="M20 1h4v4h-4zM20 5h2v3h-2z" fill="#D97757" />
        ) : (
          <path d="M20 4h4v4h-4z" fill="#D97757" />
        )}
        {/* 蟹壳主体 16×12 */}
        <rect x="4" y="0" width="16" height="12" fill="#D97757" />
        {/* 蟹壳右侧暗部立体边 */}
        <rect x="18" y="0" width="2" height="12" fill="#B9603F" />
        {/* 眼睛 */}
        {error ? (
          <path
            d="M6 2h1v1H6zM8 2h1v1H8zM7 3h1v1H7zM6 4h1v1H6zM8 4h1v1H8zM15 2h1v1h-1zM17 2h1v1h-1zM16 3h1v1h-1zM15 4h1v1h-1zM17 4h1v1h-1z"
            fill="#141413"
          />
        ) : (
          <>
            <rect className="crab-eye" x="6" y="2" width="2" height="2" fill="#141413" />
            <rect className="crab-eye" x="16" y="2" width="2" height="2" fill="#141413" />
          </>
        )}
        {/* 四条腿 */}
        <rect className="crab-leg-a" x="4" y="12" width="2" height="4" fill="#D97757" />
        <rect className="crab-leg-b" x="8" y="12" width="2" height="4" fill="#D97757" />
        <rect className="crab-leg-a" x="14" y="12" width="2" height="4" fill="#D97757" />
        <rect className="crab-leg-b" x="18" y="12" width="2" height="4" fill="#B9603F" />
      </svg>
    </div>
  );
}
