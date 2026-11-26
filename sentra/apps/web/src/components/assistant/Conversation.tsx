import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

export interface ToolCallItem {
  name: string;
  result: Record<string, unknown>;
}

export interface InboxItemView {
  id: string;
  sender: string;
  subject: string;
  risk_level: "SAFE" | "SUSPICIOUS" | "LIKELY_SCAM";
  tldr: string;
}

export interface ConversationEntry {
  id: string;
  who: "YOU" | "GEMINI";
  text: string;
  toolCalls?: ToolCallItem[];
  inboxItems?: InboxItemView[];
  inboxSource?: "gmail" | "demo";
  quarantineCount?: number;
  playableText?: string;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches)
  );
}

function TypedSlipText({ text, animate }: { text: string; animate: boolean }) {
  const [shown, setShown] = useState(animate && !prefersReducedMotion() ? "" : text);

  useEffect(() => {
    if (!animate || prefersReducedMotion()) {
      setShown(text);
      return;
    }
    let idx = 0;
    setShown("");
    const timer = setInterval(() => {
      idx += 2;
      if (idx >= text.length) {
        setShown(text);
        clearInterval(timer);
      } else {
        setShown(text.slice(0, idx));
      }
    }, 14);
    return () => clearInterval(timer);
  }, [text, animate]);

  return <div className="txt">{shown}</div>;
}

export function PlayVoiceButton({
  id,
  label = "Play voice",
  playingId,
  onPlay,
}: {
  id: string;
  label?: string;
  playingId: string | null;
  onPlay: (id: string) => void;
}) {
  const isPlaying = playingId === id;
  return (
    <button
      type="button"
      className={`play${isPlaying ? " on" : ""}`}
      aria-pressed={isPlaying}
      onClick={() => onPlay(id)}
    >
      <span aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      {label}
    </button>
  );
}

export function Conversation({
  entries,
  playingId,
  onPlayVoice,
}: {
  entries: ConversationEntry[];
  playingId: string | null;
  onPlayVoice: (id: string, text: string) => void;
}) {
  if (entries.length === 0) return null;

  return (
    <>
      {entries.map((entry) => {
        const isGemini = entry.who === "GEMINI";
        const staged = entry.toolCalls?.find(
          (t) =>
            t.result?.status === "STAGED_FOR_APPROVAL" &&
            typeof t.result?.proposal_id === "string"
        );

        return (
          <article
            key={entry.id}
            className={`slip print${isGemini ? " g" : ""}`}
            data-testid={isGemini ? "reply-slip" : "user-slip"}
          >
            <div className="who">{entry.who}</div>
            <TypedSlipText text={entry.text} animate={isGemini} />

            {entry.toolCalls && entry.toolCalls.length > 0 && (
              <div className="tl">
                {entry.toolCalls.map((t, idx) => (
                  <span key={`${t.name}-${idx}`} className="st">
                    {t.name}
                  </span>
                ))}
                {staged && (
                  <Link
                    className="st-staged"
                    to={`/approve/${String(staged.result.proposal_id)}`}
                  >
                    Staged: waiting for your approval
                  </Link>
                )}
              </div>
            )}

            {entry.inboxItems && entry.inboxItems.length > 0 && (
              <div className="inbox-list" aria-label="Categorized inbox summary">
                {entry.inboxItems.map((it) => (
                  <div key={it.id} className="inbox-row">
                    <span>{it.tldr}</span>
                    <span className="st">{it.risk_level}</span>
                  </div>
                ))}
              </div>
            )}

            {typeof entry.quarantineCount === "number" && entry.quarantineCount > 0 && (
              <div className="tin" aria-label="Quarantine tin">
                Quarantine: {entry.quarantineCount}
              </div>
            )}

            {entry.playableText && (
              <div>
                <PlayVoiceButton
                  id={entry.id}
                  playingId={playingId}
                  onPlay={(id) => onPlayVoice(id, entry.playableText!)}
                />
              </div>
            )}
          </article>
        );
      })}
    </>
  );
}
