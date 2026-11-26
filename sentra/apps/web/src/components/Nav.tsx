import { Link } from "react-router-dom";

export function Nav({ active }: { active: "home" | "dashboard" | "control-room" }) {
  return (
    <header className="site-head">
      <Link to="/" className="mark">
        Sentra
      </Link>
      <nav aria-label="Primary">
        <Link className={`navb ${active === "home" ? "active" : ""}`} to="/">
          Desk
        </Link>
        <Link
          className={`navb ${active === "dashboard" ? "active" : ""}`}
          to="/dashboard"
        >
          Approval console
        </Link>
        <Link
          className={`navb ${active === "control-room" ? "active" : ""}`}
          to="/control-room"
        >
          3D control room
        </Link>
      </nav>
    </header>
  );
}
