import { useEffect, useState } from "react";
import type { SceneStage } from "../types.ts";

export function FlowScene({ sceneStage }: { sceneStage: SceneStage }) {
  const [scrollRz, setScrollRz] = useState(-18);
  const [layerGap, setLayerGap] = useState(48);

  useEffect(() => {
    const rm = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (rm) return;
    const onScroll = () => {
      const doc = document.documentElement;
      const max = doc.scrollHeight - window.innerHeight;
      const p = max > 0 ? Math.max(0, Math.min(1, window.scrollY / max)) : 0;
      setScrollRz(-48 + p * 75);
      setLayerGap(44 + p * 46);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    onScroll();
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  const captionMap: Record<SceneStage, string> = {
    agent: "Agent staged a proposal",
    tray: "Held in your tray",
    gate: "The gate checks the stamp",
    vault: "Written to your vault",
    denied: "Denied at the gate",
    blocked: "Blocked at the gate",
  };

  const slipZ =
    sceneStage === "agent"
      ? 1.5 * layerGap + 8
      : sceneStage === "gate" || sceneStage === "denied" || sceneStage === "blocked"
      ? -0.5 * layerGap + 8
      : sceneStage === "vault"
      ? -1.5 * layerGap + 8
      : 0.5 * layerGap + 8;

  const slipTransform =
    sceneStage === "denied" || sceneStage === "blocked"
      ? `translate3d(125px, -22px, ${slipZ}px) rotateZ(22deg)`
      : `translateZ(${slipZ}px)`;

  const layers = [
    { idx: 1, label: "1 Agent", z: 1.5 * layerGap, active: sceneStage === "agent" ? "active-blue" : "" },
    { idx: 2, label: "2 Tray", z: 0.5 * layerGap, active: sceneStage === "tray" ? "active-blue" : "" },
    {
      idx: 3,
      label: "3 Gate",
      z: -0.5 * layerGap,
      active:
        sceneStage === "gate"
          ? "active-blue"
          : sceneStage === "denied" || sceneStage === "blocked"
          ? "active-red"
          : "",
    },
    { idx: 4, label: "4 Vault", z: -1.5 * layerGap, active: sceneStage === "vault" ? "active-blue" : "" },
  ];

  return (
    <div className="flow3d-box" aria-hidden="true">
      <div
        className="flow3d-stage"
        style={{
          transform: `translate(-50%, -50%) rotateX(62deg) rotateZ(${scrollRz.toFixed(1)}deg)`,
        }}
      >
        {layers.map((layer) => (
          <div
            key={layer.idx}
            className={`flow3d-layer ${layer.active}`}
            style={{ transform: `translateZ(${layer.z}px)` }}
          >
            {layer.idx === 3 && <div className="gate-barrier" />}
            {layer.idx === 4 && (
              <div className={`vault-lock ${sceneStage === "vault" ? "filled" : ""}`} />
            )}
            <span
              className="layer-chip"
              style={{
                transform: `rotateZ(${(-scrollRz).toFixed(1)}deg) rotateX(-62deg)`,
              }}
            >
              {layer.label}
            </span>
          </div>
        ))}

        <div
          className={`flow3d-slip ${sceneStage === "denied" || sceneStage === "blocked" ? "red" : ""}`}
          style={{
            transform: slipTransform,
            opacity: sceneStage === "denied" || sceneStage === "blocked" ? 0 : 1,
          }}
        >
          <span className="slip-bar" />
        </div>
      </div>
      <div className="flow3d-cap">{captionMap[sceneStage]}</div>
    </div>
  );
}
