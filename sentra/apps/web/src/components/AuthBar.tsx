import { useEffect, useState } from "react";

export function AuthBar({
  authenticated,
  user,
  csrf,
  mode = "sandbox",
  onLoggedIn,
  onLoggedOut,
}: {
  authenticated: boolean;
  user: string | null;
  csrf?: string | null;
  mode?: "sandbox" | "live";
  onLoggedIn: (csrf: string, user: string) => void;
  onLoggedOut: () => void;
}) {
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [googleStatus, setGoogleStatus] = useState<{
    configured: boolean;
    connected: boolean;
    email: string | null;
    live_writes?: boolean;
  } | null>(null);

  useEffect(() => {
    if (!authenticated) {
      setGoogleStatus(null);
      return;
    }
    let cancelled = false;
    fetch("/api/oauth/google/status", { credentials: "include", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!cancelled && j && typeof j.connected === "boolean") {
          setGoogleStatus(j);
        }
      })
      .catch(() => {
        // Ignore transient errors
      });
    return () => {
      cancelled = true;
    };
  }, [authenticated]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !password) return;
    setBusy(true);
    setErr("");
    try {
      const r = await fetch("/api/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErr(j.detail || "Sign-in failed");
        return;
      }
      setPassword("");
      onLoggedIn(j.csrf, j.user);
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    await fetch("/api/logout", { method: "POST", credentials: "include" });
    onLoggedOut();
  }

  async function handleGoogleDisconnect() {
    const r = await fetch("/api/oauth/google/disconnect", {
      method: "POST",
      credentials: "include",
      headers: csrf ? { "X-Sentra-CSRF": csrf } : {},
    });
    if (r.ok) {
      setGoogleStatus((cur) => (cur ? { ...cur, connected: false, email: null } : cur));
    }
  }

  return (
    <div
      style={{
        margin: "8px clamp(16px, 4vw, 48px)",
        padding: "10px 14px",
        background: "var(--paper)",
        border: "2px solid var(--ink)",
        boxShadow: "5px 5px 0 var(--ink)",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 12,
        fontFamily: "var(--type)",
        fontSize: 13,
      }}
    >
      {authenticated ? (
        <>
          <span>
            Signed in as <strong>{user ?? "local-approver"}</strong> (CSRF active)
            {" · "}
            <span
              className={`chip ${mode === "live" || googleStatus?.live_writes ? "bad" : ""}`}
              style={{ padding: "2px 8px", fontSize: 11 }}
              title={
                mode === "live" || googleStatus?.live_writes
                  ? "Live Google Calendar/Mail writes enabled"
                  : "Local sandbox mode (no external writes)"
              }
            >
              {mode === "live" || googleStatus?.live_writes ? "LIVE" : "SANDBOX"}
            </span>
            {googleStatus && (
              <>
                {" · "}
                {googleStatus.connected
                  ? `Google OAuth: ${googleStatus.email ?? "connected"}`
                  : "No external OAuth"}
              </>
            )}
          </span>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {googleStatus?.configured && !googleStatus.connected && (
              <a className="btn-desk" href="/api/oauth/google/start">
                Connect Google
              </a>
            )}
            {googleStatus?.connected && (
              <button
                type="button"
                className="btn-desk"
                onClick={handleGoogleDisconnect}
              >
                Disconnect Google
              </button>
            )}
            <button type="button" className="btn-desk" onClick={handleLogout}>
              Sign out
            </button>
          </div>
        </>
      ) : (
        <form
          onSubmit={handleLogin}
          style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}
        >
          <label htmlFor="approver-pw">
            <strong>Approver password</strong>
          </label>
          <input
            id="approver-pw"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter approver password"
            style={{
              border: "2px solid var(--ink)",
              padding: "6px 10px",
              fontFamily: "var(--type)",
              background: "var(--paper)",
            }}
          />
          <button type="submit" className="btn-desk primary" disabled={busy}>
            Sign in
          </button>
          {err && <span style={{ color: "var(--red)", fontWeight: 700 }}>{err}</span>}
        </form>
      )}
    </div>
  );
}
