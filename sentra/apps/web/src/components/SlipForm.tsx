import { useEffect, useState } from "react";
import type { ProposalView } from "../types.ts";

function formatTTL(expiresAt?: number | null): string {
  if (!expiresAt) return "300s TTL";
  const rem = Math.max(0, Math.floor(expiresAt - Date.now() / 1000));
  if (rem === 0) return "EXPIRED";
  const m = Math.floor(rem / 60);
  const s = rem % 60;
  return `${m}:${String(s).padStart(2, "0")} left`;
}

export function SlipForm({
  proposal,
  busy,
  lastVerdict,
  hint,
  onApprove,
  onDeny,
}: {
  proposal: ProposalView | null;
  busy: boolean;
  lastVerdict: { id: string; verdict: "APPROVED" | "DENIED" } | null;
  hint: string;
  onApprove: (p: ProposalView) => void;
  onDeny: (p: ProposalView) => void;
}) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  if (!proposal) {
    return (
      <section className="stage" aria-live="polite">
        <article className="form">
          <p className="empty">Tray empty. Nothing is waiting on you.</p>
        </article>
      </section>
    );
  }

  const isLow = proposal.trust === "LOW" || proposal.origin === "Stranger" || !!proposal.scam;
  const trust = proposal.trust ?? "LOW";
  const stamped = lastVerdict && lastVerdict.id === proposal.id ? lastVerdict.verdict : null;

  return (
    <section className="stage" aria-live="polite">
      <article className="form">
        <div className="head">
          <span>
            Countersignature request &middot;{" "}
            {proposal.source === "mcp" ? "LIVE MCP" : "DEMO"}
          </span>
          <span>
            No. {proposal.no ?? proposal.id} &middot; {formatTTL(proposal.expires_at)}
          </span>
        </div>

        <dl className="f">
          <dt>Action</dt>
          <dd className="big">{proposal.title}</dd>
          <dt>From</dt>
          <dd>{proposal.by ?? proposal.src ?? proposal.origin ?? "Unknown"}</dd>
          <dt>Source</dt>
          <dd>{proposal.src ?? proposal.source ?? "gateway"}</dd>
          <dt>Trust</dt>
          <dd>
            <span className={`trust ${trust}`}>{trust}</span>
          </dd>
          <dt>Diff</dt>
          <dd>
            {(proposal.diff ?? []).map((line, i) => (
              <div key={i}>{line}</div>
            ))}
            {(proposal.proof ?? []).map((line, i) => (
              <div key={`p-${i}`}>{line}</div>
            ))}
            {proposal.warn && <p className="lock-note">{proposal.warn}</p>}
          </dd>
          <dt>Approval</dt>
          <dd className="noborder">Single use, expires 5 minutes after issue.</dd>
        </dl>

        <div className="btns-row">
          <button
            type="button"
            className="btn-desk primary"
            disabled={busy || isLow || !!stamped}
            aria-disabled={isLow ? "true" : undefined}
            onClick={() => onApprove(proposal)}
          >
            {isLow ? "Locked for strangers" : "Approve"}
          </button>
          <button
            type="button"
            className="btn-desk danger"
            disabled={busy || !!stamped}
            onClick={() => onDeny(proposal)}
          >
            Deny
          </button>
        </div>

        <p className="hint">
          {hint ||
            (isLow
              ? "Anything from a stranger can only be denied."
              : "Click Approve to mint a single-use HMAC-SHA256 token.")}
        </p>

        {stamped && (
          <div className={`imp ${stamped === "APPROVED" ? "A" : "D"}`}>
            {stamped}
            <small>No. {proposal.no ?? proposal.id}</small>
          </div>
        )}
      </article>
    </section>
  );
}
