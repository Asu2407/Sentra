import { useEffect, useMemo, useState, type ReactNode } from "react";
import { PlayVoiceButton } from "./Conversation.tsx";

export interface EmailScanData {
  sender: string;
  subject: string;
  risk_level: "SAFE" | "SUSPICIOUS" | "LIKELY_SCAM";
  flags: string[];
  plain_warning: string;
  spoken_summary: string;
  action_recommended: string;
}

export interface EmailLetterModel {
  id: string;
  sender: string;
  subject: string;
  body: string;
  scanning: boolean;
  scan: EmailScanData | null;
  quarantined: boolean;
  quarantineId: string | null;
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
  return flag.slice(0, 32);
}

function extractPhrasesForHighlight(flags: string[], body: string): string[] {
  const found: string[] = [];
  const lowerBody = body.toLowerCase();

  for (const flag of flags) {
    const quoted = flag.match(/'([^']+)'/g);
    if (quoted) {
      for (const q of quoted) {
        const inner = q.slice(1, -1).trim();
        if (inner.length >= 2 && !inner.startsWith("http") && lowerBody.includes(inner.toLowerCase())) {
          found.push(inner);
        }
      }
    }
    const lowerFlag = flag.toLowerCase();
    if (lowerFlag.includes("urgent")) {
      const m = /within\s+\d+\s+\w+|urgent/i.exec(body);
      if (m) found.push(m[0]);
    }
    if (lowerFlag.includes("credential") || lowerFlag.includes("id") || lowerFlag.includes("fee")) {
      for (const kw of ["national id scan", "registration fee", "password", "otp"]) {
        const idx = lowerBody.indexOf(kw);
        if (idx >= 0) found.push(body.slice(idx, idx + kw.length));
      }
    }
  }
  return Array.from(new Set(found));
}

function extractMismatchUrls(flags: string[]): { visible: string; actual: string } | null {
  for (const flag of flags) {
    const m = /Visible '([^']+)' -> Real '([^']+)'/i.exec(flag);
    if (m) return { visible: m[1], actual: m[2] };
  }
  return null;
}

function renderHighlightedText(text: string, phrases: string[], hit: boolean): ReactNode {
  if (!phrases.length) return text;
  const escaped = phrases
    .filter((p) => p.length >= 2)
    .map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!escaped.length) return text;
  const re = new RegExp(`(${escaped.join("|")})`, "gi");
  const parts = text.split(re);
  return parts.map((part, idx) =>
    idx % 2 === 1 ? (
      <mark key={idx} className={hit ? "hit" : ""}>
        {part}
      </mark>
    ) : (
      part
    )
  );
}

export function EmailLetter({
  letter,
  quarantineCount,
  playingId,
  onPlayVoice,
}: {
  letter: EmailLetterModel;
  quarantineCount: number;
  playingId: string | null;
  onPlayVoice: (id: string, text: string) => void;
}) {
  const [sweepDone, setSweepDone] = useState(prefersReducedMotion());
  const [slidIntoTin, setSlidIntoTin] = useState(false);

  const flags = letter.scan?.flags ?? [];
  const phrases = useMemo(
    () => (flags.length ? extractPhrasesForHighlight(flags, letter.body) : []),
    [flags, letter.body]
  );
  const chipLabels = useMemo(
    () => Array.from(new Set(flags.map(flagToChipLabel))),
    [flags]
  );
  const mismatch = useMemo(() => extractMismatchUrls(flags), [flags]);

  useEffect(() => {
    if (!letter.scan) {
      setSweepDone(false);
      setSlidIntoTin(false);
      return;
    }
    if (prefersReducedMotion()) {
      setSweepDone(true);
      return;
    }
    const tSweep = setTimeout(() => {
      setSweepDone(true);
    }, 2600);

    let tJolt: ReturnType<typeof setTimeout> | undefined;
    let tTin: ReturnType<typeof setTimeout> | undefined;
    if (letter.quarantined) {
      tJolt = setTimeout(() => {
        document.body.classList.add("jolt");
        setTimeout(() => document.body.classList.remove("jolt"), 280);
      }, 2800);
      tTin = setTimeout(() => {
        setSlidIntoTin(true);
      }, 3600);
    }
    return () => {
      clearTimeout(tSweep);
      if (tJolt) clearTimeout(tJolt);
      if (tTin) clearTimeout(tTin);
      document.body.classList.remove("jolt");
    };
  }, [letter.id, letter.scan, letter.quarantined]);

  const riskPct =
    letter.scan?.risk_level === "LIKELY_SCAM"
      ? 94
      : letter.scan?.risk_level === "SUSPICIOUS"
      ? 55
      : 15;

  return (
    <>
      {!slidIntoTin && (
        <article
          className={`letter print${slidIntoTin ? " gone" : ""}`}
          aria-label="Scanned email letter"
        >
          <div className={`sweep${letter.scanning || (letter.scan && !sweepDone) ? " go" : ""}`} aria-hidden="true" />
          <div className="meta">
            <div>From: {letter.sender}</div>
            <div>
              <b>{letter.subject}</b>
            </div>
          </div>

          <div className="lbody">
            {renderHighlightedText(letter.body, phrases, Boolean(letter.scan))}
          </div>

          {mismatch && (
            <div className="mm" aria-label="Link mismatch">
              <div>
                <span>Says:</span> <b>{mismatch.visible}</b>
              </div>
              <div className="ln" aria-hidden="true" />
              <div className="r">
                <span>Goes to:</span> <b>{mismatch.actual}</b>
              </div>
            </div>
          )}

          {chipLabels.length > 0 && (
            <div className="fl">
              {chipLabels.map((label) => (
                <span key={label}>{label}</span>
              ))}
            </div>
          )}

          <div className="meter" aria-label={`Risk level ${letter.scan?.risk_level ?? "Scanning"}`}>
            <i
              style={{
                width: letter.scan ? `${riskPct}%` : "0%",
                background:
                  letter.scan?.risk_level === "SAFE" ? "var(--blue)" : "var(--red)",
              }}
            />
          </div>
          <div className="ml">
            <span>Risk</span>
            <span style={{ color: letter.scan?.risk_level === "LIKELY_SCAM" ? "var(--red)" : "var(--ink)" }}>
              {letter.scan ? letter.scan.risk_level : "Scanning..."}
            </span>
          </div>

          {letter.quarantined && <div className="stamp go">QUARANTINED</div>}
        </article>
      )}

      {letter.scan && (
        <div className="slip g print">
          <div className="who">GEMINI VOICE SUMMARY</div>
          <div className="txt">{letter.scan.spoken_summary}</div>
          {letter.quarantined && (
            <div className="tin" aria-label="Quarantine tin">
              Quarantine: {quarantineCount}
            </div>
          )}
          <div>
            <PlayVoiceButton
              id={`letter-${letter.id}`}
              label="Play voice"
              playingId={playingId}
              onPlay={(id) => onPlayVoice(id, letter.scan!.spoken_summary)}
            />
          </div>
        </div>
      )}
    </>
  );
}
