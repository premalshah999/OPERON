import { NavLink } from "react-router-dom";

const navItems = [
  {
    to: "/",
    label: "Dashboard",
    meta: "Live queue + stats",
  },
  {
    to: "/triage",
    label: "Triage",
    meta: "Filters + queue",
  },
  {
    to: "/supervisor",
    label: "Supervisor",
    meta: "Review + risk watch",
  },
  {
    to: "/process",
    label: "Process",
    meta: "Run a complaint",
  },
  {
    to: "/analytics",
    label: "Analytics",
    meta: "Charts + trends",
  },
  {
    to: "/audit",
    label: "Audit Trail",
    meta: "Explainability",
  },
];

export default function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="sidebar__brand">
        <div className="sidebar__logo">CAI</div>
        <div>
          <p className="sidebar__eyebrow">Complaint AI</p>
          <h2>Control Center</h2>
        </div>
      </div>

      <nav className="sidebar__nav">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className="sidebar__link"
          >
            <span>{item.label}</span>
            <small>{item.meta}</small>
          </NavLink>
        ))}
      </nav>

      <div className="sidebar__footer">
        <p>Demo focus</p>
        <strong>Classification, risk, routing, resolution, QA</strong>
      </div>
    </aside>
  );
}
