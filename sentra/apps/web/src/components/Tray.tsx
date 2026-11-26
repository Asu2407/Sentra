import type { ProposalView } from "../types.ts";

export function Tray({
  proposals,
  selectedId,
  onSelect,
}: {
  proposals: ProposalView[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <section aria-label="Held proposals">
      <div className="lbl">
        In tray <span>{proposals.length} held</span>
      </div>
      <div className="tray">
        {proposals.length === 0 ? (
          <p className="empty">Tray empty. Nothing is waiting on you.</p>
        ) : (
          proposals.map((p) => {
            const isLow = p.trust === "LOW" || p.origin === "Stranger";
            const srcLabel = p.source === "mcp" ? "LIVE MCP" : "DEMO";
            return (
              <button
                key={p.id}
                type="button"
                className={`slip${isLow ? " low" : ""}`}
                aria-current={selectedId === p.id ? "true" : undefined}
                onClick={() => onSelect(p.id)}
              >
                <div className="sn">
                  <span>No. {p.no ?? p.id}</span>
                  <span className={`badge-src ${p.source === "mcp" ? "mcp" : ""}`}>
                    {srcLabel}
                  </span>
                </div>
                <div className="tt">{p.title}</div>
                <div className="ss">{p.trust ?? p.origin ?? "HELD"}</div>
              </button>
            );
          })
        )}
      </div>
    </section>
  );
}
