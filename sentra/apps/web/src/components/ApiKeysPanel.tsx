import { useCallback, useEffect, useState } from "react";

interface ApiKeyItem {
  id: string;
  name: string;
  prefix: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

export function ApiKeysPanel({ csrf }: { csrf: string }) {
  const [keys, setKeys] = useState<ApiKeyItem[]>([]);
  const [name, setName] = useState("");
  const [newRawKey, setNewRawKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const loadKeys = useCallback(async () => {
    try {
      const r = await fetch("/api/keys", { credentials: "include", cache: "no-store" });
      if (!r.ok) return;
      const j = await r.json();
      setKeys(j.keys ?? []);
    } catch {
      // Ignore transient errors
    }
  }, []);

  useEffect(() => {
    void loadKeys();
  }, [loadKeys]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !name.trim()) return;
    setBusy(true);
    setErr("");
    try {
      const r = await fetch("/api/keys", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-Sentra-CSRF": csrf,
        },
        body: JSON.stringify({ name: name.trim() }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErr(j.detail || "Failed to create API key");
        return;
      }
      setNewRawKey(j.key ?? null);
      setName("");
      await loadKeys();
    } finally {
      setBusy(false);
    }
  }

  async function handleRevoke(id: string) {
    if (busy) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/keys/${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "include",
        headers: { "X-Sentra-CSRF": csrf },
      });
      if (r.ok) await loadKeys();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-label="MCP API Keys"
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
          gap: 12,
          marginBottom: 12,
        }}
      >
        <div>
          <h2 style={{ fontSize: 18, textTransform: "uppercase" }}>MCP API Keys</h2>
          <p style={{ fontFamily: "var(--type)", fontSize: 12, color: "var(--soft)" }}>
            Issue per-agent keys for /mcp (hashed at rest with SHA-256, revocable anytime).
          </p>
        </div>
        <form
          onSubmit={handleCreate}
          style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}
        >
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Agent or teammate name"
            aria-label="New API key name"
            style={{
              border: "2px solid var(--ink)",
              padding: "6px 10px",
              fontFamily: "var(--type)",
              background: "var(--paper)",
            }}
          />
          <button type="submit" className="btn-desk primary" disabled={busy}>
            Create API key
          </button>
        </form>
      </div>

      {err && (
        <p style={{ color: "var(--red)", fontFamily: "var(--type)", fontSize: 13, marginBottom: 8 }}>
          {err}
        </p>
      )}

      {newRawKey && (
        <div
          style={{
            background: "var(--canary)",
            border: "2px solid var(--ink)",
            padding: "10px 12px",
            marginBottom: 12,
            fontFamily: "var(--type)",
            fontSize: 13,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <div>
            <strong>Shown once — copy now:</strong> <code>{newRawKey}</code>
          </div>
          <button
            type="button"
            className="btn-desk"
            onClick={() => {
              void navigator.clipboard?.writeText(newRawKey);
            }}
          >
            Copy
          </button>
        </div>
      )}

      {keys.length === 0 ? (
        <p style={{ fontFamily: "var(--type)", fontSize: 13, color: "var(--soft)" }}>
          No per-agent keys issued yet.
        </p>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {keys.map((k) => (
            <div
              key={k.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
                flexWrap: "wrap",
                border: "1.5px solid var(--ink)",
                padding: "8px 12px",
                fontFamily: "var(--type)",
                fontSize: 13,
              }}
            >
              <div>
                <strong>{k.name}</strong> &middot; <code>{k.prefix}...</code> &middot;{" "}
                <span className={`chip ${k.revoked_at ? "bad" : ""}`} style={{ padding: "1px 6px" }}>
                  {k.revoked_at ? "REVOKED" : "ACTIVE"}
                </span>
              </div>
              {!k.revoked_at && (
                <button
                  type="button"
                  className="btn-desk danger"
                  disabled={busy}
                  onClick={() => handleRevoke(k.id)}
                >
                  Revoke
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
