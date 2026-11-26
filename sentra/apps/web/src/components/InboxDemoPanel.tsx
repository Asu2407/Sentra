import { useState } from "react";

interface ScanResult {
  sender: string;
  subject: string;
  risk_level: "SAFE" | "SUSPICIOUS" | "LIKELY_SCAM";
  flags: string[];
  plain_warning: string;
  spoken_summary: string;
  action_recommended: string;
}

const FISHY_PRESET = {
  sender: "hr@internship-secure-portal.xyz",
  subject: "Urgent: Internship confirmation - act within 2 hours",
  body: "Act within 2 hours to confirm your spot. Reply with your national ID scan and registration fee.",
  visible_link: "https://portal.university.edu/confirm",
  actual_link: "http://internship-secure-portal.xyz/steal",
};

export function InboxDemoPanel({
  csrf,
  onIngested,
}: {
  csrf: string;
  onIngested: () => Promise<void> | void;
}) {
  const [sender, setSender] = useState(FISHY_PRESET.sender);
  const [subject, setSubject] = useState(FISHY_PRESET.subject);
  const [body, setBody] = useState(FISHY_PRESET.body);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [result, setResult] = useState<{
    scan: ScanResult;
    quarantined: boolean;
    quarantine_id: string | null;
  } | null>(null);

  async function speakSummary(text: string) {
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
      // Fallback to browser Web Speech API below
    }

    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = 1.0;
    window.speechSynthesis.speak(utter);
  }

  async function handleIngest(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setErr("");
    try {
      const r = await fetch("/api/inbox/ingest", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-Sentra-CSRF": csrf,
        },
        body: JSON.stringify({
          sender,
          subject,
          body,
          visible_link:
            sender === FISHY_PRESET.sender ? FISHY_PRESET.visible_link : undefined,
          actual_link:
            sender === FISHY_PRESET.sender ? FISHY_PRESET.actual_link : undefined,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErr(j.detail || "Failed to ingest email");
        return;
      }
      setResult(j);
      if (j.scan?.spoken_summary) {
        speakSummary(j.scan.spoken_summary);
      }
      await onIngested();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-label="Email Scam & Voice Summary Demo"
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
          marginBottom: 12,
        }}
      >
        <div>
          <h2 style={{ fontSize: 18, textTransform: "uppercase" }}>
            Inbox Scam &amp; Voice Summary Demo
          </h2>
          <p style={{ fontFamily: "var(--type)", fontSize: 12, color: "var(--soft)" }}>
            Ingest a fishy email to scan it, auto-quarantine LOW-trust threats, and hear the voice summary.
          </p>
        </div>
        <button
          type="button"
          className="btn-desk"
          onClick={() => {
            setSender(FISHY_PRESET.sender);
            setSubject(FISHY_PRESET.subject);
            setBody(FISHY_PRESET.body);
          }}
        >
          Load fishy email
        </button>
      </div>

      <form onSubmit={handleIngest} style={{ display: "grid", gap: 8 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <input
            type="text"
            value={sender}
            onChange={(e) => setSender(e.target.value)}
            placeholder="Sender email"
            aria-label="Ingest sender email"
            style={{
              border: "2px solid var(--ink)",
              padding: "6px 10px",
              fontFamily: "var(--type)",
              background: "var(--paper)",
            }}
          />
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject"
            aria-label="Ingest subject"
            style={{
              border: "2px solid var(--ink)",
              padding: "6px 10px",
              fontFamily: "var(--type)",
              background: "var(--paper)",
            }}
          />
        </div>
        <textarea
          rows={2}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Email body"
          aria-label="Ingest body"
          style={{
            border: "2px solid var(--ink)",
            padding: "6px 10px",
            fontFamily: "var(--type)",
            background: "var(--paper)",
            resize: "vertical",
          }}
        />
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button type="submit" className="btn-desk primary" disabled={busy}>
            Scan &amp; Ingest Email
          </button>
          {err && (
            <span style={{ color: "var(--red)", fontFamily: "var(--type)", fontSize: 13 }}>
              {err}
            </span>
          )}
        </div>
      </form>

      {result && (
        <div
          style={{
            marginTop: 12,
            padding: "12px 14px",
            border: "2px solid var(--ink)",
            background: result.scan.risk_level === "SAFE" ? "var(--tape)" : "var(--canary)",
            fontFamily: "var(--type)",
            fontSize: 13,
            display: "grid",
            gap: 6,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span>
              <span
                className={`chip ${result.scan.risk_level === "SAFE" ? "" : "bad"}`}
                style={{ padding: "2px 8px", marginRight: 8 }}
              >
                {result.scan.risk_level}
              </span>
              {result.quarantined && (
                <strong>Quarantined as {result.quarantine_id}</strong>
              )}
            </span>
            <button
              type="button"
              className="btn-desk"
              onClick={() => speakSummary(result.scan.spoken_summary)}
            >
              Play voice summary
            </button>
          </div>
          <div>
            <strong>Voice summary:</strong> {result.scan.spoken_summary}
          </div>
          {result.scan.flags.length > 0 && (
            <div>
              <strong>Flags:</strong> {result.scan.flags.join(" · ")}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
