import { useState } from "react";
import { FlowScene } from "./FlowScene.tsx";
import type {
  AuditEntryView,
  ExecutionView,
  QuarantineView,
  SceneStage,
} from "../types.ts";

export function GatePanel({
  audit,
  chainValid,
  heldCount,
  approvedCount,
  deniedCount,
  quarantine,
  executions = [],
  sceneStage,
  announcement,
  onRestoreQuarantine,
  onVerifyChain,
}: {
  audit: AuditEntryView[];
  chainValid: boolean;
  heldCount: number;
  approvedCount: number;
  deniedCount: number;
  quarantine: QuarantineView[];
  executions?: ExecutionView[];
  sceneStage: SceneStage;
  announcement: string;
  onRestoreQuarantine: (qid: string) => void;
  onVerifyChain?: () => Promise<void> | void;
}) {
  const [tamperedIdx, setTamperedIdx] = useState<number | null>(null);
  const lastHash = audit.length ? audit[audit.length - 1].hash : "0".repeat(40);
  const broken = tamperedIdx !== null || !chainValid;

  return (
    <aside className="gate-aside" aria-label="Sentra gate and quarantine">
      <div className="sr-only" aria-live="polite">
        {announcement}
      </div>

      <section className="gate-panel">
        <header className="gate-head">
          <h2>Sentra gate</h2>
          <div className="sub">Live session</div>
        </header>

        <FlowScene sceneStage={sceneStage} />

        <ol className="gate-log">
          {audit.map((e, i) => {
            const isBroken = tamperedIdx !== null && i >= tamperedIdx;
            const cls =
              isBroken || e.denied
                ? "denied"
                : e.text.startsWith("approved")
                ? "approved"
                : "";
            const hashShown =
              tamperedIdx === i ? "deadbeef0000" : e.hash.slice(0, 10);
            return (
              <li key={e.n} className={cls}>
                <span className="tg">
                  {isBroken
                    ? "broken"
                    : e.denied
                    ? "denied"
                    : e.text.startsWith("approved")
                    ? "signed"
                    : "log"}
                </span>
                <b>
                  #{e.n} {e.text}
                </b>
                <em>
                  prev {e.prev_hash.slice(0, 6)} &rarr; {hashShown}
                </em>
              </li>
            );
          })}
        </ol>

        <div className="tot">
          <span>HELD</span>
          <span>{heldCount}</span>
          <span>APPROVED</span>
          <span>{approvedCount}</span>
          <span>DENIED</span>
          <span>{deniedCount}</span>
          <span>ENTRIES</span>
          <span>{audit.length}</span>
        </div>

        <div className="bar" aria-hidden="true">
          {lastHash
            .slice(0, 40)
            .split("")
            .map((ch, idx) => (
              <i key={idx} style={{ width: `${1 + (parseInt(ch, 16) % 4)}px` }} />
            ))}
        </div>

        <div className={`chip ${broken ? "bad" : ""}`}>
          {tamperedIdx !== null
            ? `CHAIN BROKEN AT #${audit[tamperedIdx]?.n ?? tamperedIdx + 1}`
            : chainValid
            ? `CHAIN VALID (${audit.length} entries)`
            : "CHAIN BROKEN"}
        </div>

        <div className="gate-row">
          <button
            type="button"
            className="btn-desk"
            onClick={async () => {
              setTamperedIdx(null);
              if (onVerifyChain) await onVerifyChain();
            }}
          >
            Verify chain
          </button>
          <button
            type="button"
            className="btn-desk danger"
            onClick={() => audit.length && setTamperedIdx(Math.max(0, audit.length - 1))}
          >
            Alter a line
          </button>
        </div>
      </section>

      <section className="quar-box" aria-label="Quarantine">
        <h3>Quarantine</h3>
        {quarantine.length === 0 ? (
          <p>No quarantined items.</p>
        ) : (
          quarantine.map((q) => (
            <div key={q.id} className="quar-item">
              <strong>{q.title}</strong>
              <span>{q.reason}</span>
              <div style={{ marginTop: 6 }}>
                <button
                  type="button"
                  className="btn-desk"
                  onClick={() => onRestoreQuarantine(q.id)}
                >
                  Restore
                </button>
              </div>
            </div>
          ))
        )}
      </section>

      <section className="quar-box" aria-label="Calendar & Mail outbox">
        <h3>Calendar &amp; Mail outbox</h3>
        {executions.length === 0 ? (
          <p>No dispatched actions yet.</p>
        ) : (
          executions.map((ex) => (
            <div key={ex.proposal_id} className="quar-item">
              <strong>
                {ex.proposal_id} &middot; {ex.action_type}
              </strong>
              <span>
                {ex.adapter}: {ex.detail}
              </span>
            </div>
          ))
        )}
      </section>
    </aside>
  );
}
