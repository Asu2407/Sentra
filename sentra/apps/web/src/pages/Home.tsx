import { Link } from "react-router-dom";
import { Nav } from "../components/Nav.tsx";

export function Home() {
  const mcpUrl =
    typeof window !== "undefined" && window.location?.origin
      ? `${window.location.origin}/mcp`
      : "http://127.0.0.1:8001/mcp";

  return (
    <>
      <Nav active="home" />
      <main className="intro">
        <h1>
          Your AI plans.
          <br />
          You countersign.
        </h1>
        <p>
          Sentra holds every state-changing write your AI agent proposes until
          you inspect its provenance and stamp it in the Approval console.
        </p>
        <div className="btns-row">
          <Link className="btn-desk primary" to="/dashboard">
            Open Approval console
          </Link>
          <Link className="btn-desk" to="/control-room">
            Open The Counter
          </Link>
        </div>

        <section className="guide-box" aria-label="Beginner guideline for opening Sentra MCP">
          <h2>Beginner guideline: opening Sentra MCP</h2>
          <ol className="guide-steps">
            <li>
              <strong>Start the shared database &amp; API:</strong> run{" "}
              <code>npm run dev:api</code> (and <code>npm run dev:web</code> in
              dev) with <code>MONGODB_URI</code> set in <code>sentra/.env</code>.
            </li>
            <li>
              <strong>Connect your MCP client (Antigravity, VS Code, or Cursor):</strong>{" "}
              point an HTTP MCP server to{" "}
              <code>{mcpUrl}</code>{" "}
              (with <code>Authorization: Bearer &lt;token&gt;</code>) — no local
              Node command needed.{" "}
              <em>(Stdio via <code>sentra/apps/mcp/dist/server.js</code> is also supported.)</em>
            </li>
            <li>
              <strong>Stage &amp; countersign:</strong> ask your AI to run{" "}
              <code>detect_conflicts</code> or <code>propose_action</code>.
              Trusted proposals appear as <strong>LIVE MCP</strong> slips in the{" "}
              <Link to="/dashboard">Approval console</Link>; sign in to Approve
              or Deny before the 300s timer expires.
            </li>
          </ol>
        </section>
      </main>
      <footer className="site-foot">
        <span>Sentra Gateway &middot; Out-of-band countersignature desk</span>
        <span>Nothing ran without you.</span>
      </footer>
    </>
  );
}
