import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Nav } from "../components/Nav.tsx";
import { AuthBar } from "../components/AuthBar.tsx";
import { Tray } from "../components/Tray.tsx";
import { SlipForm } from "../components/SlipForm.tsx";
import { GatePanel } from "../components/GatePanel.tsx";
import { PunchCard } from "../components/PunchCard.tsx";
import { ApiKeysPanel } from "../components/ApiKeysPanel.tsx";
import { InboxDemoPanel } from "../components/InboxDemoPanel.tsx";
import type {
  AuditEntryView,
  ExecutionView,
  ProposalView,
  QuarantineView,
  SceneStage,
} from "../types.ts";

export function Dashboard() {
  const { id: routeId } = useParams<{ id?: string }>();
  const [proposals, setProposals] = useState<ProposalView[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(routeId ?? null);
  const [quarantine, setQuarantine] = useState<QuarantineView[]>([]);
  const [executions, setExecutions] = useState<ExecutionView[]>([]);
  const [audit, setAudit] = useState<AuditEntryView[]>([]);
  const [chainValid, setChainValid] = useState(true);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState("");
  const [lastVerdict, setLastVerdict] = useState<{
    id: string;
    verdict: "APPROVED" | "DENIED";
  } | null>(null);
  const [sceneStage, setSceneStage] = useState<SceneStage>("tray");
  const [announcement, setAnnouncement] = useState("");
  const [csrf, setCsrf] = useState<string | null>(null);
  const [authUser, setAuthUser] = useState<string | null>(null);
  const [mode, setMode] = useState<"sandbox" | "live">("sandbox");
  const [benchmark, setBenchmark] = useState<{ blocked: number; total: number } | null>(null);

  const animatingRef = useRef(false);
  const animatedIdsRef = useRef<Set<string>>(new Set());

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
      setSelectedId((cur) =>
        cur && nextProps.some((p) => p.id === cur)
          ? cur
          : nextProps[0]?.id ?? null
      );

      if (isPoll) {
        const freshMcp = nextProps.find(
          (p) => p.source === "mcp" && !animatedIdsRef.current.has(p.id)
        );
        if (freshMcp) {
          animatedIdsRef.current.add(freshMcp.id);
          animatingRef.current = true;
          setSceneStage("agent");
          setAnnouncement(`New MCP proposal staged: ${freshMcp.title}`);
          setTimeout(() => setSceneStage("tray"), 550);
          setTimeout(() => {
            animatingRef.current = false;
          }, 1100);
        }
      } else {
        for (const p of nextProps) {
          if (p.source === "mcp") animatedIdsRef.current.add(p.id);
        }
      }
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
    if (!csrf) return;
    fetch("/api/benchmark", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j && Number.isFinite(j.blocked) && Number.isFinite(j.total)) {
          setBenchmark({ blocked: j.blocked, total: j.total });
        }
      })
      .catch(() => {});
  }, [csrf]);

  const selected = proposals.find((p) => p.id === selectedId) ?? proposals[0] ?? null;

  async function handleApprove(p: ProposalView) {
    if (busy) return;
    if (!csrf) {
      setHint("Sign in above to countersign proposals.");
      document.getElementById("approver-pw")?.focus();
      return;
    }
    setBusy(true);
    animatingRef.current = true;
    setHint("");
    try {
      const r = await fetch(`/api/proposals/${encodeURIComponent(p.id)}/approve`, {
        method: "POST",
        credentials: "include",
        headers: csrf ? { "X-Sentra-CSRF": csrf } : {},
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setHint(j.detail || "Action blocked by Sentra gate.");
        setSceneStage("blocked");
        setAnnouncement(`Blocked ${p.title}`);
        setTimeout(() => {
          setSceneStage("tray");
          animatingRef.current = false;
        }, 1200);
        return;
      }

      setLastVerdict({ id: p.id, verdict: "APPROVED" });
      setSceneStage("gate");
      setAnnouncement(`Approved ${p.title}`);
      setTimeout(() => setSceneStage("vault"), 700);
      setTimeout(async () => {
        setSceneStage("tray");
        setLastVerdict(null);
        animatingRef.current = false;
        await fetchState(false);
      }, 1700);
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
    setHint("");
    try {
      const r = await fetch(`/api/proposals/${encodeURIComponent(p.id)}/reject`, {
        method: "POST",
        credentials: "include",
        headers: csrf ? { "X-Sentra-CSRF": csrf } : {},
      });
      if (!r.ok) {
        setHint("Could not deny proposal.");
        animatingRef.current = false;
        return;
      }
      setLastVerdict({ id: p.id, verdict: "DENIED" });
      setSceneStage("denied");
      setAnnouncement(`Denied ${p.title}`);
      setTimeout(async () => {
        setSceneStage("tray");
        setLastVerdict(null);
        animatingRef.current = false;
        await fetchState(false);
      }, 1300);
    } finally {
      setBusy(false);
    }
  }

  async function handleRestoreQuarantine(qid: string) {
    if (!csrf) {
      setHint("Sign in above to restore quarantined items.");
      document.getElementById("approver-pw")?.focus();
      return;
    }
    await fetch(`/api/quarantine/${encodeURIComponent(qid)}/restore`, {
      method: "POST",
      credentials: "include",
      headers: { "X-Sentra-CSRF": csrf },
    });
    await fetchState(false);
  }

  async function handleVerifyChain() {
    const r = await fetch("/api/audit/verify", { cache: "no-store" });
    if (!r.ok) return;
    const j = await r.json();
    setChainValid(!!j.valid);
    if (Array.isArray(j.entries)) setAudit(j.entries);
    setAnnouncement(j.valid ? "Audit chain verified valid." : "Audit chain broken.");
  }

  const approvedCount = audit.filter((e) => e.text.startsWith("approved ")).length;
  const deniedCount = audit.filter((e) => e.text.startsWith("rejected ")).length;

  return (
    <>
      <Nav active="dashboard" />
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
      <section className="intro">
        <h1>Approval console</h1>
        <p>
          Inspect live proposals held by the gateway, check provenance, and
          countersign Approve or Deny.
        </p>
      </section>

      <main className="desk" aria-label="Live approval console">
        <Tray
          proposals={proposals}
          selectedId={selected?.id ?? null}
          onSelect={(id) => {
            setSelectedId(id);
            setHint("");
          }}
        />
        <SlipForm
          proposal={selected}
          busy={busy}
          lastVerdict={lastVerdict}
          hint={hint}
          onApprove={handleApprove}
          onDeny={handleDeny}
        />
        <GatePanel
          audit={audit}
          chainValid={chainValid}
          heldCount={proposals.length}
          approvedCount={approvedCount}
          deniedCount={deniedCount}
          quarantine={quarantine}
          executions={executions}
          sceneStage={sceneStage}
          announcement={announcement}
          onRestoreQuarantine={handleRestoreQuarantine}
          onVerifyChain={handleVerifyChain}
        />
      </main>

      {benchmark && <PunchCard blocked={benchmark.blocked} total={benchmark.total} />}

      {csrf && (
        <InboxDemoPanel csrf={csrf} onIngested={() => fetchState(false)} />
      )}

      {csrf && <ApiKeysPanel csrf={csrf} />}

      <footer className="site-foot">
        <span>Sentra Gateway &middot; Out-of-band countersignature desk</span>
        <span>Nothing ran without you.</span>
      </footer>
    </>
  );
}
