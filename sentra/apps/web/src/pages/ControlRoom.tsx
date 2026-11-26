import { useCallback, useEffect, useRef, useState } from "react";
import { Nav } from "../components/Nav.tsx";
import { AuthBar } from "../components/AuthBar.tsx";
import { Tray } from "../components/Tray.tsx";
import { SlipForm } from "../components/SlipForm.tsx";
import { PunchCard } from "../components/PunchCard.tsx";
import type {
  AuditEntryView,
  ExecutionView,
  ProposalView,
  QuarantineView,
} from "../types.ts";

export function ControlRoom() {
  const [proposals, setProposals] = useState<ProposalView[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [quarantine, setQuarantine] = useState<QuarantineView[]>([]);
  const [executions, setExecutions] = useState<ExecutionView[]>([]);
  const [audit, setAudit] = useState<AuditEntryView[]>([]);
  const [benchmark, setBenchmark] = useState<{ blocked: number; total: number } | null>(null);
  const [chainValid, setChainValid] = useState(true);
  const [tamperedAt, setTamperedAt] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState("");
  const [lastVerdict, setLastVerdict] = useState<{
    id: string;
    verdict: "APPROVED" | "DENIED";
  } | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [unapprovedCount, setUnapprovedCount] = useState(0);
  const [shredding, setShredding] = useState(false);
  const [stampPos, setStampPos] = useState<{ x: number; y: number } | null>(null);
  const [csrf, setCsrf] = useState<string | null>(null);
  const [authUser, setAuthUser] = useState<string | null>(null);
  const [mode, setMode] = useState<"sandbox" | "live">("sandbox");

  const animatingRef = useRef(false);

  const fetchSession = useCallback(async () => {
    try {
      const r = await fetch("/api/session", { credentials: "include", cache: "no-store" });
      if (!r.ok) return;
      const j = await r.json();
      setCsrf(j.authenticated ? j.csrf : null);
      setAuthUser(j.authenticated ? j.user : null);
    } catch {
      // ignore
    }
  }, []);

  const fetchState = useCallback(async (isPoll: boolean) => {
    if (isPoll && (document.hidden || animatingRef.current)) return;
    try {
      const r = await fetch("/api/state", { cache: "no-store" });
      if (!r.ok) return;
      const j = await r.json();
      const nextProps: ProposalView[] = j.proposals ?? [];
      setProposals(nextProps);
      setQuarantine(j.quarantine ?? []);
      setExecutions(j.executions ?? []);
      setAudit(j.audit ?? []);
      setChainValid(j.chain_valid !== false);
      setMode(j.mode === "live" ? "live" : "sandbox");
      setUnapprovedCount(Number(j.unapproved_writes_executed ?? 0));
      setSelectedId((cur) =>
        cur && nextProps.some((p) => p.id === cur)
          ? cur
          : nextProps[0]?.id ?? null
      );
    } catch {
      // Ignore transient errors
    }
  }, []);

  useEffect(() => {
    fetchSession();
    fetchState(false);
    const id = setInterval(() => fetchState(true), 4000);
    return () => clearInterval(id);
  }, [fetchSession, fetchState]);

  useEffect(() => {
    if (!csrf || typeof EventSource === "undefined") return;
    const es = new EventSource("/api/events");
    es.addEventListener("state_changed", () => {
      void fetchState(true);
    });
    return () => {
      es.close();
    };
  }, [csrf, fetchState]);

  useEffect(() => {
    if (!csrf) {
      setBenchmark(null);
      return;
    }
    let cancelled = false;
    fetch("/api/benchmark", { credentials: "include", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!cancelled && j && typeof j.blocked === "number" && typeof j.total === "number") {
          setBenchmark({ blocked: j.blocked, total: j.total });
        }
      })
      .catch(() => {
        // Ignore transient errors
      });
    return () => {
      cancelled = true;
    };
  }, [csrf]);

  const selected = proposals.find((p) => p.id === selectedId) ?? proposals[0] ?? null;
  const approvedEntries = audit.filter((e) => e.text.startsWith("approved "));
  const blockedCount = audit.filter((e) => e.denied || e.text.includes("BLOCKED")).length;

  async function handleApprove(p: ProposalView) {
    if (busy) return;
    if (!csrf) {
      setHint("Sign in above to countersign proposals.");
      document.getElementById("approver-pw")?.focus();
      return;
    }
    setBusy(true);
    animatingRef.current = true;
    try {
      if (!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
        document.body.classList.add("jolt");
        setTimeout(() => document.body.classList.remove("jolt"), 180);
      }
      const r = await fetch(`/api/proposals/${encodeURIComponent(p.id)}/approve`, {
        method: "POST",
        credentials: "include",
        headers: csrf ? { "X-Sentra-CSRF": csrf } : {},
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setHint(j.detail || "Blocked by Sentra gate.");
        animatingRef.current = false;
        return;
      }
      setLastVerdict({ id: p.id, verdict: "APPROVED" });
      setAnnouncement(`Approved ${p.title}. Sent to Calendar / Mail outbox.`);
      setTimeout(async () => {
        setLastVerdict(null);
        animatingRef.current = false;
        await fetchState(false);
      }, 900);
    } finally {
      setBusy(false);
    }
  }

  async function handleDeny(p: ProposalView) {
    if (busy) return;
    if (!csrf) {
      setHint("Sign in above to deny proposals.");
      document.getElementById("approver-pw")?.focus();
      return;
    }
    setBusy(true);
    animatingRef.current = true;
    try {
      const rm = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      if (!rm) {
        setShredding(true);
        await new Promise((r) => setTimeout(r, 600));
        setShredding(false);
      }
      const r = await fetch(`/api/proposals/${encodeURIComponent(p.id)}/reject`, {
        method: "POST",
        credentials: "include",
        headers: { "X-Sentra-CSRF": csrf },
      });
      if (!r.ok) {
        animatingRef.current = false;
        return;
      }
      setLastVerdict({ id: p.id, verdict: "DENIED" });
      setAnnouncement(`Denied and shredded ${p.title}.`);
      setTimeout(async () => {
        setLastVerdict(null);
        animatingRef.current = false;
        await fetchState(false);
      }, 600);
    } finally {
      setBusy(false);
    }
  }

  async function handleVerifyChain() {
    setTamperedAt(null);
    const r = await fetch("/api/audit/verify", { cache: "no-store" });
    if (!r.ok) return;
    const j = await r.json();
    setChainValid(!!j.valid);
    if (Array.isArray(j.entries)) setAudit(j.entries);
    setAnnouncement(j.valid ? "Audit chain verified valid." : "Audit chain broken.");
  }

  async function handleSelftest() {
    await fetch("/api/selftest/write-without-token", {
      method: "POST",
      credentials: "include",
      headers: csrf ? { "X-Sentra-CSRF": csrf } : {},
    });
    setAnnouncement("Unstamped write blocked and dropped into red tin.");
    await fetchState(false);
  }

  return (
    <>
      <Nav active="control-room" />
      <AuthBar
        authenticated={!!csrf}
        user={authUser}
        csrf={csrf}
        mode={mode}
        onLoggedIn={(tok, u) => {
          setCsrf(tok);
          setAuthUser(u);
        }}
        onLoggedOut={() => {
          setCsrf(null);
          setAuthUser(null);
        }}
      />
      <div className="sr-only" aria-live="assertive">
        {announcement}
      </div>

      <div className="counter-topbar">
        <div className="intro" style={{ padding: 0 }}>
          <h1>The Counter</h1>
          <p>
            Held slips wait on the left. Stamp to countersign into Calendar /
            Mail, or deny to shred.
          </p>
        </div>
        <div className="counter-zero">
          <strong>{unapprovedCount}</strong>
          <span>got through</span>
        </div>
      </div>

      <main className="desk" aria-label="The Counter workspace">
        <div>
          <Tray
            proposals={proposals}
            selectedId={selected?.id ?? null}
            onSelect={(id) => {
              setSelectedId(id);
              setHint("");
            }}
          />
          <div className="outbox-box" style={{ marginTop: 18 }}>
            <div className="box-head">
              <span>Approved spike</span>
              <strong>{approvedEntries.length}</strong>
            </div>
            <ul className="spike-list">
              {approvedEntries.length === 0 ? (
                <li>No slips spiked yet.</li>
              ) : (
                approvedEntries.map((e) => (
                  <li key={e.n}>
                    #{e.n} {e.text}
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>

        <div
          className="shred-wrap"
          draggable={!!selected && !busy}
          onDragStart={(e) => {
            if (selected) e.dataTransfer.setData("text/plain", selected.id);
          }}
          onPointerMove={(e) => {
            if (
              e.pointerType === "touch" ||
              !selected ||
              selected.trust === "LOW" ||
              (e.target as HTMLElement).closest("button")
            ) {
              setStampPos(null);
              return;
            }
            setStampPos({ x: e.clientX, y: e.clientY });
          }}
          onPointerLeave={() => setStampPos(null)}
        >
          <SlipForm
            proposal={selected}
            busy={busy}
            lastVerdict={lastVerdict}
            hint={hint}
            onApprove={handleApprove}
            onDeny={handleDeny}
          />
          {shredding && (
            <div className="shred-strips" aria-hidden="true">
              {[0, 1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="shred-strip"
                  style={
                    {
                      clipPath: `inset(${i * 20}% 0 ${100 - (i + 1) * 20}% 0)`,
                      "--tx": `${140 + i * 24}px`,
                      "--rot": `${(i % 2 === 0 ? 1 : -1) * (8 + i * 3)}deg`,
                    } as React.CSSProperties
                  }
                />
              ))}
            </div>
          )}
        </div>
        {stampPos && (
          <div
            className="stamp-cursor"
            aria-hidden="true"
            style={{ left: stampPos.x, top: stampPos.y }}
          >
            STAMP
            <br />
            APPROVE
          </div>
        )}

        <aside aria-label="Outbox, shredder, and blocked tin">
          <section className="outbox-box">
            <div className="box-head">
              <span>Outbox</span>
              <strong>{approvedEntries.length}</strong>
            </div>
            <p style={{ marginBottom: 8 }}>Calendar / Mail</p>
            <ul className="outbox-list">
              {executions.length === 0 && approvedEntries.length === 0 ? (
                <li>Awaiting stamped writes.</li>
              ) : executions.length > 0 ? (
                executions.map((ex) => (
                  <li key={ex.proposal_id}>
                    <strong>{ex.proposal_id}</strong> ({ex.adapter}): {ex.detail}
                  </li>
                ))
              ) : (
                approvedEntries.map((e) => <li key={e.n}>{e.text}</li>)
              )}
            </ul>
          </section>

          <section
            className="shredder-slot"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (selected) handleDeny(selected);
            }}
          >
            <div className="shredder-mouth" aria-hidden="true" />
            <div>Shredder &middot; Drop slip or press Deny</div>
          </section>

          <section className="red-tin">
            <div className="box-head">
              <span>Blocked tin</span>
              <strong>{blockedCount}</strong>
            </div>
            <p style={{ marginBottom: 10 }}>
              Unstamped writes slammed &amp; dropped here.
            </p>
            <button
              type="button"
              className="btn-desk danger"
              onClick={handleSelftest}
            >
              Test write without stamp
            </button>
          </section>

          <section className="quar-box">
            <h3>Quarantine</h3>
            {quarantine.length === 0 ? (
              <p>No quarantined items.</p>
            ) : (
              quarantine.map((q) => (
                <div key={q.id} className="quar-item">
                  <strong>{q.title}</strong>
                  <span>{q.reason}</span>
                </div>
              ))
            )}
          </section>
        </aside>
      </main>

      <section className="ribbon-bar" aria-label="Audit receipt ribbon">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <div>
            <strong>RECEIPT RIBBON</strong> &middot;{" "}
            <span
              className={`chip ${tamperedAt !== null || !chainValid ? "bad" : ""}`}
              style={{ padding: "2px 8px" }}
            >
              {tamperedAt !== null
                ? `Chain broken at #${tamperedAt}`
                : chainValid
                ? `Chain valid (${audit.length} entries)`
                : "Chain broken"}
            </span>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button
              type="button"
              className="btn-desk"
              onClick={handleVerifyChain}
            >
              Verify chain
            </button>
            <button
              type="button"
              className="btn-desk danger"
              onClick={() => {
                if (audit.length) {
                  setTamperedAt(audit[audit.length > 2 ? 1 : 0].n);
                }
              }}
            >
              Alter a line
            </button>
          </div>
        </div>

        <div className="ribbon-track-wrap">
          <div className="printer-slot" aria-hidden="true">
            PRINTER
          </div>
          <ol className="ribbon-track">
            {audit
              .slice()
              .reverse()
              .map((e) => {
                const isTorn = tamperedAt !== null && e.n === tamperedAt;
                const isUntrusted = tamperedAt !== null && e.n > tamperedAt;
                return (
                  <li
                    key={e.n}
                    className={`ribbon-seg${isTorn ? " torn" : ""}${
                      isUntrusted ? " untrusted" : ""
                    }`}
                  >
                    <div>
                      <strong>#{e.n}</strong> {e.text}
                    </div>
                    <div>
                      {e.prev_hash.slice(0, 8)} &rarr;{" "}
                      {isTorn ? "deadbeef" : e.hash.slice(0, 8)}
                    </div>
                    {isUntrusted && (
                      <div style={{ fontWeight: 700 }}>NO LONGER TRUSTED</div>
                    )}
                  </li>
                );
              })}
          </ol>
        </div>
      </section>

      {benchmark && <PunchCard blocked={benchmark.blocked} total={benchmark.total} />}

      <footer className="site-foot">
        <span>Sentra Gateway &middot; Out-of-band countersignature desk</span>
        <span>Nothing ran without you.</span>
      </footer>
    </>
  );
}
