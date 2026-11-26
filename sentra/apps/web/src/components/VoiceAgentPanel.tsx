import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { ChaosState } from "./ChaosField.tsx";

export type VoiceState = "idle" | "listening" | "thinking" | "speaking";

interface ToolCallItem {
  name: string;
  result: Record<string, unknown>;
}

const SAMPLE_VOICE_PROMPT =
  "Check my schedule conflicts, summarize my inbox, and stage a 4 PM sync meeting.";

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches)
  );
}

export function VoiceAgentPanel({
  csrf,
  onChaosChange,
  onActionComplete,
}: {
  csrf: string;
  onChaosChange?: (state: ChaosState) => void;
  onActionComplete: () => Promise<void> | void;
}) {
  const [prompt, setPrompt] = useState(SAMPLE_VOICE_PROMPT);
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [micLevels, setMicLevels] = useState<number[]>([8, 12, 16, 12, 8]);
  const [err, setErr] = useState("");
  const [userSlip, setUserSlip] = useState("");
  const [reply, setReply] = useState("");
  const [typedReply, setTypedReply] = useState("");
  const [toolCalls, setToolCalls] = useState<ToolCallItem[]>([]);
  const [announcement, setAnnouncement] = useState("");

  const micCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!reply) {
      setTypedReply("");
      return;
    }
    if (prefersReducedMotion()) {
      setTypedReply(reply);
      return;
    }
    let idx = 0;
    setTypedReply("");
    const timer = setInterval(() => {
      idx += 3;
      if (idx >= reply.length) {
        setTypedReply(reply);
        clearInterval(timer);
      } else {
        setTypedReply(reply.slice(0, idx));
      }
    }, 18);
    return () => clearInterval(timer);
  }, [reply]);

  useEffect(() => () => micCleanupRef.current?.(), []);

  async function speakReply(text: string) {
    setVoiceState("speaking");
    try {
      const r = await fetch("/api/voice/speak", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-Sentra-CSRF": csrf,
        },
        body: JSON.stringify({ text }),
      });
      if (r.ok) {
        const blob = await r.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        await new Promise<void>((resolve) => {
          audio.addEventListener("ended", () => {
            URL.revokeObjectURL(url);
            resolve();
          });
          audio.addEventListener("error", () => {
            URL.revokeObjectURL(url);
            resolve();
          });
          audio.play().catch(() => resolve());
        });
        setVoiceState("idle");
        return;
      }
    } catch {
      // Fallback to browser Web Speech API
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.onend = () => setVoiceState("idle");
      utter.onerror = () => setVoiceState("idle");
      window.speechSynthesis.speak(utter);
      setTimeout(() => setVoiceState((cur) => (cur === "speaking" ? "idle" : cur)), 4500);
      return;
    }
    setVoiceState("idle");
  }

  async function runGeminiPrompt(textToSend: string) {
    if (voiceState === "thinking" || !textToSend.trim()) return;
    const clean = textToSend.trim();
    setUserSlip(clean);
    setVoiceState("thinking");
    onChaosChange?.("thinking");
    setErr("");
    try {
      const r = await fetch("/api/agent/ask", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-Sentra-CSRF": csrf,
        },
        body: JSON.stringify({ prompt: clean }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErr(j.detail || "Gemini agent request failed");
        setVoiceState("idle");
        onChaosChange?.("idle");
        return;
      }
      const nextReply = String(j.reply || "");
      setReply(nextReply);
      setToolCalls(Array.isArray(j.tool_calls) ? j.tool_calls : []);
      setAnnouncement(nextReply ? `Gemini replied: ${nextReply}` : "Gemini analysis complete.");
      onChaosChange?.("sorted");
      setTimeout(() => onChaosChange?.("idle"), 1200);
      await onActionComplete();
      if (nextReply) {
        void speakReply(nextReply);
      } else {
        setVoiceState("idle");
      }
    } catch {
      setErr("Network error reaching Gemini agent.");
      setVoiceState("idle");
      onChaosChange?.("idle");
    }
  }

  async function startMicLevelMonitor() {
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof AudioContext === "undefined") return;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ctx = new AudioContext();
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 32;
      src.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const id = setInterval(() => {
        analyser.getByteFrequencyData(data);
        setMicLevels([
          Math.max(6, Math.min(22, Math.round((data[0] ?? 40) / 10))),
          Math.max(6, Math.min(22, Math.round((data[1] ?? 60) / 10))),
          Math.max(6, Math.min(22, Math.round((data[2] ?? 80) / 10))),
          Math.max(6, Math.min(22, Math.round((data[3] ?? 60) / 10))),
          Math.max(6, Math.min(22, Math.round((data[4] ?? 40) / 10))),
        ]);
      }, 90);
      micCleanupRef.current = () => {
        clearInterval(id);
        stream.getTracks().forEach((t) => t.stop());
        void ctx.close().catch(() => {});
      };
    } catch {
      // Gentle CSS bar loop handles visual feedback when mic level is unavailable
    }
  }

  function handleMicClick() {
    const win = window as unknown as {
      SpeechRecognition?: new () => {
        lang: string;
        interimResults: boolean;
        onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
        onerror: (() => void) | null;
        onend: (() => void) | null;
        start: () => void;
      };
      webkitSpeechRecognition?: new () => {
        lang: string;
        interimResults: boolean;
        onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
        onerror: (() => void) | null;
        onend: (() => void) | null;
        start: () => void;
      };
    };
    const SpeechRec = win.SpeechRecognition || win.webkitSpeechRecognition;
    if (!SpeechRec) {
      setErr("Microphone speech recognition unavailable — type your command below.");
      setAnnouncement("Microphone unavailable. Use text input fallback.");
      return;
    }
    setErr("");
    const rec = new SpeechRec();
    rec.lang = "en-US";
    rec.interimResults = false;
    setVoiceState("listening");
    void startMicLevelMonitor();

    rec.onresult = (e) => {
      micCleanupRef.current?.();
      micCleanupRef.current = null;
      const transcript = e.results?.[0]?.[0]?.transcript ?? "";
      if (transcript) {
        setPrompt(transcript);
        void runGeminiPrompt(transcript);
      } else {
        setVoiceState("idle");
      }
    };
    rec.onerror = () => {
      micCleanupRef.current?.();
      micCleanupRef.current = null;
      setVoiceState("idle");
      setErr("Microphone permission denied or capture failed — type your command below.");
      setAnnouncement("Microphone capture failed.");
    };
    rec.onend = () => {
      micCleanupRef.current?.();
      micCleanupRef.current = null;
      setVoiceState((cur) => (cur === "listening" ? "idle" : cur));
    };
    rec.start();
  }

  const stagedWrite = toolCalls.find(
    (t) =>
      t.result?.status === "STAGED_FOR_APPROVAL" &&
      typeof t.result?.proposal_id === "string"
  );

  return (
    <section
      className="desk-panel"
      aria-label="Gemini Voice Assistant"
      data-voice-state={voiceState}
    >
      <div className="sr-only" aria-live="polite">
        {announcement}
      </div>

      <div style={{ marginBottom: 14 }}>
        <h2 style={{ fontSize: 18, textTransform: "uppercase" }}>
          Gemini Voice Assistant (Connected to Sentra MCP)
        </h2>
        <p className="panel-sub">
          Speak or type a command — Gemini analyzes via Sentra tools, stages writes, and replies by voice.
        </p>
      </div>

      <div className="va-grid">
        <div>
          <button
            type="button"
            className={`mic-tile ${voiceState}`}
            aria-label={
              voiceState === "listening"
                ? "Listening on microphone"
                : voiceState === "thinking"
                ? "Gemini thinking"
                : voiceState === "speaking"
                ? "Speaking reply"
                : "Speak to Sentra"
            }
            onClick={handleMicClick}
            disabled={voiceState === "thinking"}
          >
            {voiceState === "thinking" && <span className="mic-ring" aria-hidden="true" />}
            {voiceState === "listening" || voiceState === "speaking" ? (
              <div className="sound-bars anim" aria-hidden="true">
                {micLevels.map((h, i) => (
                  <i key={i} style={{ height: `${h}px` }} />
                ))}
              </div>
            ) : (
              <span style={{ fontSize: 22 }} aria-hidden="true">
                MIC
              </span>
            )}
            <span>{voiceState.toUpperCase()}</span>
          </button>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void runGeminiPrompt(prompt);
            }}
            style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap", alignItems: "center" }}
          >
            <input
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Ask Sentra Gemini..."
              aria-label="Gemini voice prompt"
              style={{
                flex: 1,
                minWidth: 130,
                minHeight: 44,
                border: "2px solid var(--ink)",
                padding: "6px 10px",
                fontFamily: "var(--type)",
                fontSize: 13,
                background: "var(--paper)",
                color: "var(--ink)",
              }}
            />
            <button
              type="submit"
              className="btn-desk primary"
              disabled={voiceState === "thinking"}
            >
              {voiceState === "thinking" ? "Thinking..." : "Ask Gemini"}
            </button>
          </form>

          {err && (
            <p
              role="alert"
              style={{
                color: "var(--red)",
                fontFamily: "var(--type)",
                fontSize: 13,
                fontWeight: 700,
                marginTop: 8,
              }}
            >
              {err}
            </p>
          )}
        </div>

        <div style={{ display: "grid", gap: 12 }}>
          {userSlip && (
            <article className="slip-card" data-testid="user-slip">
              <strong>YOU:</strong> {userSlip}
            </article>
          )}

          {reply ? (
            <article className="slip-card" data-testid="reply-slip">
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 8,
                  flexWrap: "wrap",
                  marginBottom: 8,
                }}
              >
                <strong>GEMINI REPLY</strong>
                <button
                  type="button"
                  className="btn-desk"
                  onClick={() => void speakReply(reply)}
                >
                  Play voice
                </button>
              </div>
              <p style={{ lineHeight: 1.5 }}>{typedReply}</p>

              {(toolCalls.length > 0 || stagedWrite) && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                  {toolCalls.map((t, idx) => (
                    <span key={`${t.name}-${idx}`} className="chip-stamp">
                      {t.name}
                    </span>
                  ))}
                  {stagedWrite && (
                    <Link
                      className="chip-blue"
                      to={`/approve/${String(stagedWrite.result.proposal_id)}`}
                    >
                      Staged: waiting for your approval
                    </Link>
                  )}
                </div>
              )}
            </article>
          ) : (
            <div className="slip-card">
              Tap the mic tile or click <strong>Ask Gemini</strong> to inspect conflicts, scan your inbox, and stage proposals.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
