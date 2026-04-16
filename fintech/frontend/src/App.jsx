import { NavLink, Route, Routes, useLocation } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import ProcessComplaint from "./pages/ProcessComplaint";
import Analytics from "./pages/Analytics";
import AuditTrail from "./pages/AuditTrail";
import Sidebar from "./components/Sidebar";

const pageMeta = {
  "/": {
    eyebrow: "Operations View",
    title: "Complaint intelligence at a glance",
    description:
      "Track intake volume, regulatory risk, and current routing decisions from one control center.",
  },
  "/process": {
    eyebrow: "Live Pipeline",
    title: "Run the 5-agent workflow",
    description:
      "Submit a complaint, stream each specialist agent, and review the final resolution package.",
  },
  "/analytics": {
    eyebrow: "Trend Analysis",
    title: "Watch risk and product patterns emerge",
    description:
      "Explore complaint volume, severity mix, and routing concentration across the latest activity.",
  },
  "/audit": {
    eyebrow: "Explainability",
    title: "Inspect the decision trail",
    description:
      "Review the audit chain behind every classification, flag, escalation, and resolution recommendation.",
  },
};

function TopNav() {
  return (
    <div className="top-nav">
      <div className="top-nav__links">
        <NavLink to="/" end>
          Overview
        </NavLink>
        <NavLink to="/process">Process</NavLink>
        <NavLink to="/analytics">Analytics</NavLink>
        <NavLink to="/audit">Audit</NavLink>
      </div>
      <div className="status-pill">
        <span className="status-pill__dot" />
        Prototype Online
      </div>
    </div>
  );
}

function AppShell() {
  const location = useLocation();
  const hero = pageMeta[location.pathname] ?? pageMeta["/"];

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="app-shell__content">
        <TopNav />
        <header className="hero-panel">
          <div>
            <p className="hero-panel__eyebrow">{hero.eyebrow}</p>
            <h1>{hero.title}</h1>
            <p className="hero-panel__description">{hero.description}</p>
          </div>
          <div className="hero-panel__callout">
            <span>5 agents</span>
            <span>SQLite audit log</span>
            <span>SSE progress stream</span>
          </div>
        </header>

        <main className="page-shell">
          <Routes>
            <Route path="/" element={<Dashboard />} />
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
