import { useEffect, useRef } from "react";

export type ComposerState = "idle" | "listening" | "thinking";

export function Composer({
  state,
  value,
  error,
  micAnalyser,
  onChange,
  onMicClick,
  onSubmit,
}: {
  state: ComposerState;
  value: string;
  error: string;
  micAnalyser: AnalyserNode | null;
  onChange: (next: string) => void;
  onMicClick: () => void;
  onSubmit: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (state !== "listening") return;
    const reduce = Boolean(
      typeof window !== "undefined" &&
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    );
    const cv = canvasRef.current;
    const cx = cv?.getContext("2d");
    if (!cv || !cx || reduce) return;

    let raf = 0;
    const bins = micAnalyser ? new Uint8Array(micAnalyser.frequencyBinCount) : null;

    const draw = () => {
      if (document.hidden) {
        raf = requestAnimationFrame(draw);
        return;
      }
      cx.clearRect(0, 0, cv.width, cv.height);
      const n = 46;
      const t = performance.now() / 160;
      if (micAnalyser && bins) {
        micAnalyser.getByteFrequencyData(bins);
      }
      for (let i = 0; i < n; i++) {
        let h: number;
        if (bins && bins.length > 0) {
          const sample = bins[i % bins.length] ?? 0;
          h = 8 + (sample / 255) * 40;
        } else {
          h =
            8 +
            Math.abs(Math.sin(t + i * 0.55) * Math.sin(t * 0.7 + i * 0.2)) *
              40 *
              (0.4 + Math.random() * 0.6);
        }
        cx.fillStyle = i % 7 === 0 ? "#1b2230" : "#1e3fae";
        cx.fillRect(10 + i * 15, 28 - h / 2, 8, h);
      }
      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [state, micAnalyser]);

  return (
    <>
      <div className="bar" data-s={state}>
        <button
          type="button"
          className="orb"
          aria-label="Speak to Sentra"
          aria-pressed={state === "listening"}
          disabled={state === "thinking"}
          onClick={onMicClick}
        >
          <i className="rp" aria-hidden="true" />
          <i className="rp" aria-hidden="true" />
          <i className="rp" aria-hidden="true" />
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="9" y="3" width="6" height="12" rx="3" />
            <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
          </svg>
        </button>

        <div className="mid">
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onSubmit();
              }
            }}
            placeholder="Ask about your schedule or inbox, or tap the mic"
            aria-label="Ask Gemini"
          />
          <canvas
            ref={canvasRef}
            className="wf"
            width={700}
            height={56}
            aria-hidden="true"
          />
          <div className="think" aria-hidden="true">
            <b />
            <b />
            <b />
            <span>Gemini is reading...</span>
          </div>
        </div>

        <button
          type="button"
          className="btn"
          disabled={state === "thinking"}
          onClick={onSubmit}
        >
          Ask Gemini
        </button>
      </div>

      {error && (
        <p className="ga-err" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
