import { useState, type ReactNode } from "react";

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

const SAFE_PRESET = {
  sender: "boss@company.com",
  subject: "Tomorrow morning 07:10 train & Q3 sync",
  body: "Safe travels to Bengaluru. Let's sync at 11:00 after you settle in.",
};

interface InboxSummaryItem extends ScanResult {
  id: string;
  tldr: string;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches)
  );
}

function flagToChipLabel(flag: string): string {
  const lower = flag.toLowerCase();
  if (lower.includes("lookalike") || lower.includes("domain")) return "Look-alike domain";
  if (lower.includes("urgent") || lower.includes("pressure")) return "Urgent pressure";
  if (lower.includes("id") || lower.includes("credential") || lower.includes("fee")) {
    return "Asks for ID";
  }
  if (lower.includes("link") || lower.includes("mismatch")) return "Link mismatch";
  return flag.slice(0, 28);
}

function extractFlagPhrases(flags: string[]): string[] {
  const phrases: string[] = [];
  for (const flag of flags) {
    const quoted = flag.match(/'([^']+)'/g);
    if (quoted) {
      for (const q of quoted) {
        const inner = q.slice(1, -1).replace(/\\d\+/g, "2").replace(/\?/g, "");
        if (inner.length >= 2 && !inner.startsWith("http")) {
          phrases.push(inner);
        }
      }
    }
    const lower = flag.toLowerCase();
    if (lower.includes("urgent")) phrases.push("act within 2 hours", "urgent");
    if (lower.includes("credential") || lower.includes("id")) {
      phrases.push("national ID scan", "registration fee");
    }
  }
  return Array.from(new Set(phrases));
}

function extractMismatchUrls(flags: string[]): { visible: string; actual: string } | null {
  for (const flag of flags) {
    const m = /Visible '([^']+)' -> Real '([^']+)'/i.exec(flag);
    if (m) return { visible: m[1], actual: m[2] };
  }
  return null;
}

function highlightText(text: string, phrases: string[]): ReactNode {
  if (!phrases.length) return text;
  const escaped = phrases
    .filter((p) => p.length >= 2)
    .map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!escaped.length) return text;
  const re = new RegExp(`(${escaped.join("|")})`, "gi");
  const parts = text.split(re);
  return parts.map((part, idx) =>
    idx % 2 === 1 ? (
      <mark key={idx} className="flag-hl">
        {part}
      </mark>
    ) : (
      part
    )
  );
}

export function InboxDemoPanel({
  csrf,
  quarantineCount = 0,
  onIngested,
}: {
  csrf: string;
  quarantineCount?: number;
  onIngested: () => Promise<void> | void;
}) {
  const [sender, setSender] = useState(SAFE_PRESET.sender);
  const [subject, setSubject] = useState(SAFE_PRESET.subject);
  const [body, setBody] = useState(SAFE_PRESET.body);
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [err, setErr] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const [inboxSummary, setInboxSummary] = useState<{
    digest: string;
    safe_count: number;
    suspicious_count: number;
    scam_count: number;
    items: InboxSummaryItem[];
  } | null>(null);
  const [result, setResult] = useState<{
    scan: ScanResult;
    quarantined: boolean;
    quarantine_id: string | null;
  } | null>(null);

  async function speakSummary(text: string) {
    setSpeaking(true);
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
        setSpeaking(false);
        return;
      }
    } catch {
      // Fallback to browser Web Speech API
    }

    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.rate = 1.0;
      utter.onend = () => setSpeaking(false);
      utter.onerror = () => setSpeaking(false);
      window.speechSynthesis.speak(utter);
      setTimeout(() => setSpeaking(false), 4500);
      return;
    }
    setSpeaking(false);
  }

  async function runScan(
    targetSender: string,
    targetSubject: string,
    targetBody: string
  ) {
    if (busy) return;
    setBusy(true);
    setScanning(true);
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
          sender: targetSender,
          subject: targetSubject,
          body: targetBody,
          visible_link:
            targetSender === FISHY_PRESET.sender ? FISHY_PRESET.visible_link : undefined,
          actual_link:
            targetSender === FISHY_PRESET.sender ? FISHY_PRESET.actual_link : undefined,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErr(j.detail || "Failed to ingest email");
        setScanning(false);
        return;
      }

      if (!prefersReducedMotion()) {
        await new Promise((resolve) => setTimeout(resolve, 350));
      }
      setScanning(false);
      setResult(j);

      if (j.quarantined && !prefersReducedMotion()) {
        document.body.classList.add("jolt-small");
        setTimeout(() => document.body.classList.remove("jolt-small"), 180);
      }

      setAnnouncement(
        j.quarantined
          ? `Scan complete: ${j.scan?.risk_level}. Quarantined as ${j.quarantine_id}.`
          : `Scan complete: ${j.scan?.risk_level}.`
      );

      if (j.scan?.spoken_summary) {
        void speakSummary(j.scan.spoken_summary);
      }
      await onIngested();
    } finally {
      setBusy(false);
      setScanning(false);
    }
  }

  async function handleIngest(e: React.FormEvent) {
    e.preventDefault();
    await runScan(sender, subject, body);
  }

  async function handleCategorizeInbox() {
    if (busy) return;
    setBusy(true);
    setErr("");
    try {
      const r = await fetch("/api/inbox/summarize", {
        method: "POST",
        credentials: "include",
        headers: { "X-Sentra-CSRF": csrf },
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErr(j.detail || "Failed to categorize inbox");
        return;
      }
      setInboxSummary(j);
      setAnnouncement(j.digest || "Inbox categorized.");
      if (j.digest) {
        void speakSummary(j.digest);
      }
      await onIngested();
    } finally {
      setBusy(false);
    }
  }

  const activeFlags = result?.scan.flags ?? [];
  const phrases = highlightPhrasesFor(result?.scan);
  const mismatch = extractMismatchUrls(activeFlags);
  const riskPct =
    result?.scan.risk_level === "LIKELY_SCAM"
      ? 95
      : result?.scan.risk_level === "SUSPICIOUS"
      ? 55
      : 15;
  const riskColor =
    result?.scan.risk_level === "LIKELY_SCAM"
      ? "var(--red)"
      : result?.scan.risk_level === "SUSPICIOUS"
      ? "var(--canary)"
      : "var(--blue)";

  return (
    <section className="desk-panel" aria-label="Email Scam & Voice Summary Demo">
      <div className="sr-only" aria-live="polite">
        {announcement}
      </div>

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
            Inbox Scan &amp; Voice Summary Demo
          </h2>
          <p className="panel-sub">
            Inspect a letter in plain text, run the X-ray scam scan, and quarantine LOW-trust threats.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            className="btn-desk"
            disabled={busy}
            onClick={() => {
              setSender(FISHY_PRESET.sender);
              setSubject(FISHY_PRESET.subject);
              setBody(FISHY_PRESET.body);
              setResult(null);
              void runScan(FISHY_PRESET.sender, FISHY_PRESET.subject, FISHY_PRESET.body);
            }}
          >
            Load fishy email
          </button>
          <button
            type="button"
            className="btn-desk"
            disabled={busy}
            onClick={() => {
              setSender(SAFE_PRESET.sender);
              setSubject(SAFE_PRESET.subject);
              setBody(SAFE_PRESET.body);
              setResult(null);
              void runScan(SAFE_PRESET.sender, SAFE_PRESET.subject, SAFE_PRESET.body);
            }}
          >
            Load safe email
          </button>
          <button
            type="button"
            className="btn-desk"
            disabled={busy}
            onClick={() => void handleCategorizeInbox()}
          >
            Categorize Inbox
          </button>
        </div>
      </div>

      <form onSubmit={handleIngest} style={{ display: "grid", gap: 8, marginBottom: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <input
            type="text"
            value={sender}
            onChange={(e) => setSender(e.target.value)}
            placeholder="Sender email"
            aria-label="Ingest sender email"
            style={{
              minHeight: 44,
              border: "2px solid var(--ink)",
              padding: "6px 10px",
              fontFamily: "var(--type)",
              background: "var(--paper)",
              color: "var(--ink)",
            }}
          />
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject"
            aria-label="Ingest subject"
            style={{
              minHeight: 44,
              border: "2px solid var(--ink)",
              padding: "6px 10px",
              fontFamily: "var(--type)",
              background: "var(--paper)",
              color: "var(--ink)",
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
            minHeight: 44,
            border: "2px solid var(--ink)",
            padding: "6px 10px",
            fontFamily: "var(--type)",
            background: "var(--paper)",
            color: "var(--ink)",
            resize: "vertical",
          }}
        />
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button type="submit" className="btn-desk primary" disabled={busy}>
            {busy ? "Scanning..." : "Scan & Ingest Email"}
          </button>
          {err && (
            <span role="alert" style={{ color: "var(--red)", fontFamily: "var(--type)", fontSize: 13, fontWeight: 700 }}>
              {err}
            </span>
          )}
        </div>
      </form>

      <div className="inbox-grid">
        <article
          className={`letter-box ${result?.quarantined ? "slide-quar" : ""}`}
          aria-label="Scanned email letter"
        >
          {scanning && <div className="xray-bar" aria-hidden="true" />}

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
            <strong>LETTER PREVIEW</strong>
            {result?.quarantined && <span className="quar-stamp">QUARANTINED</span>}
          </div>

          <div>
            <strong>From:</strong> {highlightText(sender, phrases)}
          </div>
          <div>
            <strong>Subject:</strong> {highlightText(subject, phrases)}
          </div>
          <p style={{ marginTop: 8, lineHeight: 1.5 }}>{highlightText(body, phrases)}</p>

          {mismatch && (
            <div className="mismatch-box" aria-label="Link mismatch">
              <div>
                <strong>Says:</strong> {mismatch.visible}
              </div>
              <div className="mismatch-line" aria-hidden="true" />
              <div>
                <strong>Goes to:</strong> {mismatch.actual}
              </div>
            </div>
          )}

          {result && (
            <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 700 }}>
                  <span>RISK METER</span>
                  <span>{result.scan.risk_level}</span>
                </div>
                <div className="risk-meter" role="progressbar" aria-valuenow={riskPct} aria-valuemin={0} aria-valuemax={100}>
                  <div className="risk-fill" style={{ width: `${riskPct}%`, background: riskColor }} />
                </div>
              </div>

              {activeFlags.length > 0 && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }} aria-label="Findings">
                  {activeFlags.map((f, idx) => (
                    <span key={idx} className="chip-stamp" title={f}>
                      {flagToChipLabel(f)}
                    </span>
                  ))}
                </div>
              )}

              <div
                style={{
                  borderTop: "1.5px solid var(--ink)",
                  paddingTop: 10,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 10,
                  flexWrap: "wrap",
                }}
              >
                <div style={{ flex: 1, minWidth: 200 }}>
                  <strong>Voice summary:</strong> &ldquo;{result.scan.spoken_summary}&rdquo;
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {speaking && (
                    <div className="sound-bars anim" aria-hidden="true">
                      <i />
                      <i />
                      <i />
                      <i />
                      <i />
                    </div>
                  )}
                  <button
                    type="button"
                    className="btn-desk"
                    onClick={() => void speakSummary(result.scan.spoken_summary)}
                  >
                    Play voice summary
                  </button>
                </div>
              </div>
            </div>
          )}
        </article>

        <aside className="quar-tin" aria-label="Quarantine tin">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <strong>QUARANTINE TIN</strong>
            <span className="chip bad" style={{ padding: "2px 8px" }}>
              {quarantineCount}
            </span>
          </div>
          <p style={{ fontSize: 12.5, lineHeight: 1.4 }}>
            {result?.quarantined
              ? `Held ${result.quarantine_id} (${result.scan.risk_level}).`
              : "Suspicious & scam letters drop here after scan."}
          </p>
        </aside>
      </div>

      {inboxSummary && (
        <div
          aria-label="Categorized inbox summary"
          style={{
            marginTop: 14,
            padding: "12px 14px",
            border: "2px solid var(--ink)",
            background: "var(--tape)",
            fontFamily: "var(--type)",
            fontSize: 13,
            display: "grid",
            gap: 8,
          }}
        >
          <div>
            <strong>INBOX CATEGORIES:</strong> {inboxSummary.digest}
          </div>
          {inboxSummary.items.map((item) => (
            <div
              key={item.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 8,
                flexWrap: "wrap",
                borderTop: "1px solid var(--ink)",
                paddingTop: 6,
              }}
            >
              <span>{item.tldr}</span>
              <span
                className={`chip ${item.risk_level === "SAFE" ? "" : "bad"}`}
                style={{ padding: "2px 8px" }}
              >
                {item.risk_level}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function highlightPhrasesFor(scan?: ScanResult): string[] {
  if (!scan?.flags?.length) return [];
  return extractFlagPhrases(scan.flags);
}
