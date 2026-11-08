// 输入框右上沿的桌面宠物（支持在设置中切换：Claude 像素蟹 Clawd / DeepSeek 小鲸鱼 Deepy / OMP 像素 π / 关闭）。
// 随任务状态（idle / running / waiting / error）切换神态与动作，并支持鼠标点击互动。
import { useEffect, useState } from "react";
import type { MascotCharacter, TaskStatus } from "../../../../shared/ipc.ts";
import { useShellValue } from "../../app/shell-store.ts";

type MascotMood = "idle" | "running" | "waiting" | "error";

function ClawdSvg({ mood, ambient, poked }: { mood: MascotMood; ambient: number; poked: boolean }) {
  const running = mood === "running";
  const waiting = mood === "waiting" || poked;
  const error = mood === "error";
  const eyeShift = mood === "idle" && ambient === 1 ? -1 : mood === "idle" && ambient === 2 ? 1 : 0;
  const waving = mood === "idle" && ambient === 3;

  return (
    <svg className="composer-crab-svg" width="48" height="32" viewBox="0 0 24 16" shapeRendering="crispEdges">
      {/* 左钳 */}
      {running || waiting || waving ? (
        <path d="M0 1h4v4H0zM2 5h2v3H2z" fill="#D97757" />
      ) : (
        <path d="M0 4h4v4H0z" fill="#D97757" />
      )}
      {/* 右钳 */}
      {waiting ? <path d="M20 1h4v4h-4zM20 5h2v3h-2z" fill="#D97757" /> : <path d="M20 4h4v4h-4z" fill="#D97757" />}
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
          <rect className="crab-eye" x={6 + eyeShift} y="2" width="2" height="2" fill="#141413" />
          <rect className="crab-eye" x={16 + eyeShift} y="2" width="2" height="2" fill="#141413" />
        </>
      )}
      {/* 四条腿 */}
      <rect className="crab-leg-a" x="4" y="12" width="2" height="4" fill="#D97757" />
      <rect className="crab-leg-b" x="8" y="12" width="2" height="4" fill="#D97757" />
      <rect className="crab-leg-a" x="14" y="12" width="2" height="4" fill="#D97757" />
      <rect className="crab-leg-b" x="18" y="12" width="2" height="4" fill="#B9603F" />
    </svg>
  );
}

function DeepySvg({ mood, ambient, poked }: { mood: MascotMood; ambient: number; poked: boolean }) {
  const spouting = mood === "running" || mood === "waiting" || poked || ambient === 3;
  const error = mood === "error";
  const eyeShift = mood === "idle" && ambient === 1 ? -1 : 0;

  return (
    <svg className="composer-crab-svg" width="52" height="34" viewBox="0 0 26 17" shapeRendering="crispEdges">
      {/* 喷水柱 */}
      {spouting && (
        <g className="mascot-spout">
          <path d="M11 0h2v1h-2zM7 0h2v1H7zM15 0h2v1h-2z" fill="#93C5FD" />
          <path d="M9 1h2v1H9zM13 1h2v1h-2zM11 2h2v2h-2z" fill="#60A5FA" />
        </g>
      )}
      {/* 尾鳍 */}
      <path
        d={
          mood === "running" || poked
            ? "M21 5h2v2h-2zM23 3h3v2h-3zM23 7h3v2h-3zM20 7h2v3h-2z"
            : "M21 7h2v2h-2zM23 5h3v2h-3zM23 9h2v2h-2zM20 9h2v3h-2z"
        }
        fill="#3550E5"
      />
      {/* 鲸鱼身体主轮廓 */}
      <path d="M6 4h11v1H6zM4 5h15v2H4zM3 7h17v4H3zM4 11h16v3H4z" fill="#4D6BFE" />
      {/* 背部高光 */}
      <path d="M7 5h8v1H7z" fill="#7B93FF" />
      {/* 腹部浅蓝白肚皮与纹理 */}
      <path d="M4 11h11v3H4zM5 14h9v1H5z" fill="#E0E7FF" />
      <path d="M6 12h7v1H6zM7 14h5v1H7z" fill="#C7D2FE" />
      {/* 眼睛 */}
      {error ? (
        <path d="M7 7h1v1H7zM9 7h1v1H9zM8 8h1v1H8zM7 9h1v1H7zM9 9h1v1H9z" fill="#1E1B4B" />
      ) : (
        <>
          <rect x={8 + eyeShift} y="7" width="2" height="2" fill="#1E1B4B" />
          <rect x={8 + eyeShift} y="7" width="1" height="1" fill="#FFFFFF" />
        </>
      )}
      {/* 腮红 */}
      {(mood === "waiting" || poked) && <rect x="11" y="9" width="2" height="1" fill="#F472B6" />}
      {/* 胸鳍 */}
      <path d="M12 13h3v3h-3zM16 14h2v2h-2z" fill="#3550E5" />
    </svg>
  );
}

function OmpPiSvg({ mood, ambient, poked }: { mood: MascotMood; ambient: number; poked: boolean }) {
  const active = mood === "running" || mood === "waiting" || poked;
  const error = mood === "error";
  const eyeShift = mood === "idle" && ambient === 1 ? -1 : mood === "idle" && ambient === 2 ? 1 : 0;

  return (
    <svg className="composer-crab-svg" width="48" height="34" viewBox="0 0 24 17" shapeRendering="crispEdges">
      {/* 顶部星点信号 */}
      {active && (
        <g className="mascot-spout">
          <rect x="11" y="0" width="2" height="2" fill="#22D3EE" />
          <rect x="5" y="1" width="1" height="1" fill="#F472B6" />
          <rect x="18" y="1" width="1" height="1" fill="#A78BFA" />
        </g>
      )}
      {/* π 顶部帽檐渐变层 */}
      <rect x="2" y="3" width="20" height="2" fill="#6366F1" />
      <rect x="1" y="5" width="22" height="3" fill="#8B5CF6" />
      <rect x="19" y="3" width="3" height="5" fill="#7C3AED" />
      {/* π 精灵左腿与右腿支柱 */}
      <rect x="5" y="8" width="5" height="6" fill="#EC4899" />
      <rect x="14" y="8" width="5" height="6" fill="#06B6D4" />
      {/* 精灵面部眼眶底板 */}
      <rect x="5" y="5" width="14" height="4" fill="#312E81" />
      {/* 精灵眼睛 */}
      {error ? (
        <path d="M7 6h1v1H7zM9 6h1v1H9zM8 7h1v1H8zM14 6h1v1h-1zM16 6h1v1h-1zM15 7h1v1h-1z" fill="#F43F5E" />
      ) : (
        <>
          <rect x={7 + eyeShift} y="6" width="2" height="2" fill="#38BDF8" />
          <rect x={15 + eyeShift} y="6" width="2" height="2" fill="#38BDF8" />
        </>
      )}
      {/* 底部踏步小脚 */}
      <rect x={active ? 3 : 4} y="14" width="4" height="3" fill="#DB2777" />
      <rect x={active ? 17 : 16} y="14" width="4" height="3" fill="#0891B2" />
    </svg>
  );
}

export function ClawdMascot({
  status = "idle",
  characterOverride,
}: {
  status?: TaskStatus | undefined;
  characterOverride?: MascotCharacter;
}) {
  const storedCharacter = useShellValue("mascot") ?? "clawd";
  const character = characterOverride ?? storedCharacter;
  const [poked, setPoked] = useState(false);
  const [ambient, setAmbient] = useState(0);

  const running = status === "running" || status === "starting";
  const waiting = status === "needs_you";
  const error = status === "error";
  const mood: MascotMood = error ? "error" : waiting ? "waiting" : running ? "running" : "idle";

  useEffect(() => {
    if (character === "off" || mood !== "idle") {
      setAmbient(0);
      return;
    }
    const timer = window.setInterval(() => {
      const next = Math.floor(Math.random() * 3) + 1;
      setAmbient(next);
      window.setTimeout(() => setAmbient(0), 1800);
    }, 6500);
    return () => clearInterval(timer);
  }, [character, mood]);

  useEffect(() => {
    if (!poked) return;
    const timer = window.setTimeout(() => setPoked(false), 650);
    return () => clearTimeout(timer);
  }, [poked]);

  if (character === "off") return null;

  return (
    <div
      className="composer-crab"
      data-character={character}
      data-state={poked ? "waiting" : mood}
      aria-hidden="true"
      data-testid="composer-crab"
      onClick={() => setPoked(true)}
    >
      {character === "deepy" ? (
        <DeepySvg mood={mood} ambient={ambient} poked={poked} />
      ) : character === "omp" ? (
        <OmpPiSvg mood={mood} ambient={ambient} poked={poked} />
      ) : (
        <ClawdSvg mood={mood} ambient={ambient} poked={poked} />
      )}
    </div>
  );
}
