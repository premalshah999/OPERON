import { NavLink, Route, Routes, useLocation } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import ProcessComplaint from "./pages/ProcessComplaint";
import Analytics from "./pages/Analytics";
import AuditTrail from "./pages/AuditTrail";
import Triage from "./pages/Triage";
import Supervisor from "./pages/Supervisor";
import Sidebar from "./components/Sidebar";

const pageMeta = {
  "/": {
    eyebrow: "Overview",
    title: "Complaint intelligence",
    description:
      "Track intake volume, regulatory risk, and routing decisions from one control center.",
  },
  "/process": {
    eyebrow: "Pipeline",
    title: "Run the 5-agent workflow",
    description:
      "Submit a complaint, stream each agent, and review the resolution package.",
  },
  "/analytics": {
    eyebrow: "Analytics",
    title: "Trend analysis",
    description:
      "Explore volume, severity mix, and routing concentration across activity.",
  },
  "/triage": {
    eyebrow: "Triage",
    title: "Queue workbench",
    description:
      "Slice by product, risk, state, channel, and tags before assigning.",
  },
  "/supervisor": {
    eyebrow: "Supervisor",
    title: "Oversight dashboard",
    description:
      "Track human-review cases, regulatory hotspots, and SLA drift.",
  },
  "/audit": {
    eyebrow: "Audit",
    title: "Decision trail",
    description:
      "Review classification, flag, escalation, and resolution audit chain.",
  },
};

function TopNav() {
  return (
    <header className="top-nav">
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <div className="nav-brand">
          <div className="nav-brand__logo">CAI</div>
          <span className="nav-brand__name">Complaint AI</span>
        </div>
        <nav className="top-nav__links">
          <NavLink to="/" end>Overview</NavLink>
          <NavLink to="/triage">Triage</NavLink>
          <NavLink to="/supervisor">Supervisor</NavLink>
          <NavLink to="/process">Process</NavLink>
          <NavLink to="/analytics">Analytics</NavLink>
          <NavLink to="/audit">Audit</NavLink>
        </nav>
      </div>
      <div className="status-pill">
        <span className="status-pill__dot" />
        Online
      </div>
    </header>
  );
}

function AppShell() {
  const location = useLocation();
  const hero = pageMeta[location.pathname] ?? pageMeta["/"];

  return (
    <div className="app-shell">
      {/* Sidebar kept in DOM but hidden via CSS for React Router compatibility */}
      <Sidebar />

      <div className="app-shell__content">
        <TopNav />

        <div className="hero-panel">
          <div>
            <p className="hero-panel__eyebrow">{hero.eyebrow}</p>
            <h1>{hero.title}</h1>
            <p className="hero-panel__description">{hero.description}</p>
          </div>
          <div className="hero-panel__callout">
            <span>5 agents</span>
            <span>SQLite log</span>
            <span>SSE stream</span>
          </div>
        </div>

        <main className="page-shell">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/triage" element={<Triage />} />
            <Route path="/supervisor" element={<Supervisor />} />
            <Route path="/process" element={<ProcessComplaint />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/audit" element={<AuditTrail />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return <AppShell />;
}
