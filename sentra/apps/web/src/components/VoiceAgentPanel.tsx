import { useState } from "react";

interface ToolCallItem {
  name: string;
  result: Record<string, unknown>;
}

const SAMPLE_VOICE_PROMPT =
  "Check my schedule conflicts, summarize my inbox, and stage a 4 PM sync meeting.";

export function VoiceAgentPanel({
  csrf,
  onActionComplete,
}: {
  csrf: string;
  onActionComplete: () => Promise<void> | void;
}) {
  const [prompt, setPrompt] = useState(SAMPLE_VOICE_PROMPT);
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [reply, setReply] = useState("");
  const [toolCalls, setToolCalls] = useState<ToolCallItem[]>([]);

  async function speakReply(text: string) {
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
        audio.addEventListener("ended", () => URL.revokeObjectURL(url));
        await audio.play();
        return;
      }
    } catch {
      // Fallback to browser Web Speech API
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
    }
  }

  async function runGeminiPrompt(textToSend: string) {
    if (busy || !textToSend.trim()) return;
    setBusy(true);
    setErr("");
    try {
      const r = await fetch("/api/agent/ask", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-Sentra-CSRF": csrf,
        },
        body: JSON.stringify({ prompt: textToSend.trim() }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErr(j.detail || "Gemini agent request failed");
        return;
      }
      setReply(j.reply || "");
      setToolCalls(Array.isArray(j.tool_calls) ? j.tool_calls : []);
      if (j.reply) {
        void speakReply(j.reply);
      }
      await onActionComplete();
    } finally {
      setBusy(false);
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
      setErr("Browser SpeechRecognition unavailable here — type or click Ask Gemini.");
      return;
    }
    setErr("");
    const rec = new SpeechRec();
    rec.lang = "en-US";
    rec.interimResults = false;
    setListening(true);
    rec.onresult = (e) => {
      const transcript = e.results?.[0]?.[0]?.transcript ?? "";
      if (transcript) {
        setPrompt(transcript);
        void runGeminiPrompt(transcript);
      }
    };
    rec.onerror = () => {
      setListening(false);
      setErr("Microphone capture failed — check browser mic permissions.");
    };
    rec.onend = () => setListening(false);
    rec.start();
  }

  return (
    <section
      aria-label="Gemini Voice Assistant"
      style={{
        margin: "18px clamp(16px, 4vw, 48px)",
        padding: "16px 20px",
        background: "var(--paper)",
        border: "2px solid var(--ink)",
        boxShadow: "5px 5px 0 var(--ink)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 10,
          marginBottom: 10,
        }}
      >
        <div>
          <h2 style={{ fontSize: 18, textTransform: "uppercase" }}>
            Gemini Voice Assistant (Connected to Sentra MCP)
          </h2>
          <p style={{ fontFamily: "var(--type)", fontSize: 12, color: "var(--soft)" }}>
            Speak or type a command — Gemini analyzes via Sentra tools, stages writes, and replies by voice.
          </p>
        </div>
        <button
          type="button"
          className={`btn-desk ${listening ? "danger" : ""}`}
          onClick={handleMicClick}
          disabled={busy}
        >
          {listening ? "Listening..." : "Speak to Sentra"}
        </button>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void runGeminiPrompt(prompt);
        }}
        style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}
      >
        <input
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Ask Sentra Gemini..."
          aria-label="Gemini voice prompt"
          style={{
            flex: 1,
            minWidth: 260,
            border: "2px solid var(--ink)",
            padding: "8px 10px",
            fontFamily: "var(--type)",
            background: "var(--paper)",
          }}
        />
        <button type="submit" className="btn-desk primary" disabled={busy}>
          {busy ? "Analyzing..." : "Ask Gemini"}
        </button>
      </form>

      {err && (
        <p style={{ color: "var(--red)", fontFamily: "var(--type)", fontSize: 13, marginTop: 8 }}>
          {err}
        </p>
      )}

      {reply && (
        <div
          style={{
            marginTop: 12,
            padding: "12px 14px",
            border: "2px solid var(--ink)",
            background: "var(--tape)",
            fontFamily: "var(--type)",
            fontSize: 13,
            display: "grid",
            gap: 6,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <strong>Gemini reply:</strong>
            <button type="button" className="btn-desk" onClick={() => void speakReply(reply)}>
              Play voice
            </button>
          </div>
          <div>{reply}</div>
          {toolCalls.length > 0 && (
            <div style={{ color: "var(--soft)", fontSize: 12 }}>
              <strong>Tools executed:</strong>{" "}
              {toolCalls.map((t) => t.name).join(" → ")}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
