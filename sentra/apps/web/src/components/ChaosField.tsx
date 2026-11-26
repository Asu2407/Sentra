import { useEffect, useRef, useState } from "react";

export type ChaosState = "idle" | "thinking" | "sorted";

const WORDS = ["email", "invite", "payment", "request", "booking"];

const TILES: Array<{ kind: string; edge: string; scam: boolean }> = [
  { kind: "cal", edge: "var(--canary)", scam: false },
  { kind: "mail", edge: "var(--pink)", scam: false },
  { kind: "lock", edge: "var(--canary)", scam: false },
  { kind: "warn", edge: "var(--pink)", scam: true },
  { kind: "stamp", edge: "var(--canary)", scam: false },
  { kind: "shield", edge: "var(--pink)", scam: false },
  { kind: "chain", edge: "var(--canary)", scam: false },
];

function TileIcon({ kind }: { kind: string }) {
  switch (kind) {
    case "cal":
      return (
        <svg viewBox="0 0 48 48" aria-hidden="true">
          <rect x="8" y="10" width="32" height="30" rx="4" />
          <path d="M8 20h32M16 6v8M32 6v8" />
          <rect className="f" x="16" y="27" width="8" height="8" rx="1" />
        </svg>
      );
    case "mail":
      return (
        <svg viewBox="0 0 48 48" aria-hidden="true">
          <rect x="6" y="12" width="36" height="26" rx="4" />
          <path d="M7 15l17 14 17-14" />
        </svg>
      );
    case "lock":
      return (
        <svg viewBox="0 0 48 48" aria-hidden="true">
          <path d="M17 22v-6a7 7 0 0 1 14 0v6" />
          <rect className="f" x="12" y="22" width="24" height="18" rx="4" />
        </svg>
      );
    case "shield":
      return (
        <svg viewBox="0 0 48 48" aria-hidden="true">
          <path className="y" d="M24 6l15 5v11c0 9-6 15-15 19C15 37 9 31 9 22V11z" />
          <path d="M17 24l5 5 9-10" />
        </svg>
      );
    case "stamp":
      return (
        <svg viewBox="0 0 48 48" aria-hidden="true">
          <rect x="20" y="6" width="8" height="14" rx="2" />
          <rect className="f" x="10" y="20" width="28" height="9" rx="3" />
          <path d="M8 38h32" />
        </svg>
      );
    case "chain":
      return (
        <svg viewBox="0 0 48 48" aria-hidden="true">
          <rect x="5" y="16" width="22" height="16" rx="8" />
          <rect className="y" x="21" y="16" width="22" height="16" rx="8" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 48 48" aria-hidden="true">
          <path d="M24 7L43 40H5z" />
          <path d="M24 20v10M24 35v.5" />
        </svg>
      );
  }
}

export function ChaosField({
  state,
  onStateChange,
}: {
  state: ChaosState;
  onStateChange?: (s: ChaosState) => void;
}) {
  const heroRef = useRef<HTMLDivElement | null>(null);
  const tileRefs = useRef<Array<HTMLDivElement | null>>([]);
  const stateRef = useRef<ChaosState>(state);
  const [wordIdx, setWordIdx] = useState(0);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    const reduce = Boolean(
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    );
    if (reduce || state !== "idle") return;
    const id = setInterval(() => {
      setWordIdx((i) => (i + 1) % WORDS.length);
    }, 2400);
    return () => clearInterval(id);
  }, [state]);

  useEffect(() => {
    const hero = heroRef.current;
    if (!hero) return;
    const reduce = Boolean(
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    );

    let spd = 0.07;
    let phase = 0;
    let mx = 0;
    let my = 0;
    let smx = 0;
    let smy = 0;
    let last = performance.now();
    const drops = TILES.map(() => 0);
    let rafId = 0;

    const onMove = (e: PointerEvent) => {
      mx = (e.clientX / Math.max(1, window.innerWidth)) * 2 - 1;
      my = (e.clientY / Math.max(1, window.innerHeight)) * 2 - 1;
    };
    window.addEventListener("pointermove", onMove);

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const curState = stateRef.current;
      const tgt = curState === "thinking" ? 0.55 : 0.07;
      spd += (tgt - spd) * 0.04;
      if (!reduce) phase += spd * dt;
      smx += (mx - smx) * 0.06;
      smy += (my - smy) * 0.06;

      const w = hero.clientWidth || 900;
      const h = hero.clientHeight || 420;
      const rx = Math.max(w * 0.36, 140);
      const ry = Math.max(h * 0.34, 130);
      const cx = w / 2;
      const cy = h / 2;

      TILES.forEach((t, i) => {
        const el = tileRefs.current[i];
        if (!el) return;
        const an = (i * 2 * Math.PI) / TILES.length + phase;
        const dep = (Math.sin(an) + 1) / 2;
        const sc = 0.78 + 0.32 * dep;
        drops[i] += ((curState === "sorted" && t.scam ? 1 : 0) - drops[i]) * 0.07;
        const x = cx + Math.cos(an) * rx + smx * (8 + dep * 16);
        const y = cy + Math.sin(an) * ry * 0.88 + smy * (6 + dep * 12) + drops[i] * 260;
        const rot = Math.sin(an * 1.6 + i) * 9;
        el.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0) scale(${sc.toFixed(3)}) rotate(${rot.toFixed(1)}deg) rotateX(${(-smy * 12).toFixed(1)}deg) rotateY(${(smx * 14).toFixed(1)}deg)`;
        el.style.zIndex = String(Math.round(dep * 40));
        el.style.opacity = String((0.55 + 0.45 * dep) * (1 - drops[i] * 0.95));
      });

      if (!reduce) {
        rafId = requestAnimationFrame(frame);
      }
    };

    rafId = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("pointermove", onMove);
    };
  }, []);

  const pre = state === "idle" ? "Any " : "";
  const word =
    state === "thinking"
      ? "Gemini is reading"
      : state === "sorted"
      ? "Sorted"
      : WORDS[wordIdx];
  const dot = state === "thinking" ? "..." : ".";
  const sub =
    state === "thinking"
      ? "Sorting the pile before it reaches you."
      : state === "sorted"
      ? "1 fake dropped. The rest wait for your stamp."
      : "Gemini reads it. Sentra holds it. You decide.";

  return (
    <section
      className="orbit-wrap"
      aria-label="Sentra Gemini orbit hero"
      data-chaos-state={state}
    >
      <div className="orbit-hero" ref={heroRef}>
        <div className="orbit-mid">
          <h1>
            <span>{pre}</span>
            <span key={`${state}-${word}`} className="orbit-w">
              {word}
            </span>
            <span>{dot}</span>
          </h1>
          <p className="orbit-sub">{sub}</p>
        </div>

        {TILES.map((t, i) => {
          const busy = state === "thinking";
          const ok = state === "sorted" && !t.scam;
          const bad = state === "sorted" && t.scam;
          return (
            <div
              key={t.kind}
              ref={(el) => {
                tileRefs.current[i] = el;
              }}
              className={`orbit-tile${busy ? " busy" : ""}${ok ? " ok" : ""}${bad ? " bad" : ""}`}
              style={{ ["--edge" as string]: t.edge }}
              aria-hidden="true"
            >
              <TileIcon kind={t.kind} />
              <span className="ck">&#10003;</span>
            </div>
          );
        })}
      </div>

      {onStateChange && (
        <div className="orbit-row">
          <button
            type="button"
            className="btn-desk primary"
            onClick={() => {
              onStateChange("thinking");
              setTimeout(() => onStateChange("sorted"), 2200);
              setTimeout(() => onStateChange("idle"), 5200);
            }}
          >
            Simulate a Gemini run
          </button>
          <button type="button" className="btn-desk" onClick={() => onStateChange("idle")}>
            Idle
          </button>
          <button type="button" className="btn-desk" onClick={() => onStateChange("thinking")}>
            Thinking
          </button>
          <button type="button" className="btn-desk" onClick={() => onStateChange("sorted")}>
            Sorted
          </button>
        </div>
      )}
    </section>
  );
}
