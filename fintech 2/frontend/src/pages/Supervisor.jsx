import { useEffect, useState } from "react";
import ComplaintCard from "../components/ComplaintCard";
import RoutingWhyPanel from "../components/RoutingWhyPanel";
import { getComplaint, getSupervisorDashboard } from "../lib/api";

function QueuePanel({ title, kicker, complaints, onSelect }) {
  return (
    <section className="panel">
      <div className="panel__header">
        <div>
          <p className="section-kicker">{kicker}</p>
          <h2>{title}</h2>
        </div>
        <span className="pill">{complaints.length}</span>
      </div>

      <div className="complaint-list">
        {complaints.length ? (
          complaints.map((complaint) => (
            <ComplaintCard
              key={complaint.complaint_id}
              complaint={complaint}
              compact
              onClick={() => onSelect(complaint.complaint_id)}
            />
          ))
        ) : (
          <p className="empty-state">No complaints in this queue right now.</p>
        )}
      </div>
    </section>
  );
}

function BriefModal({ analysis, loading, onClose }) {
  // Close on Escape key
  useEffect(() => {
    function handleKey(event) {
      if (event.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-panel"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Supervisor brief"
      >
        <div className="modal-panel__header">
          <div>
            <p className="section-kicker">Supervisor brief</p>
            <h2>{analysis?.complaint_id ?? "Loading..."}</h2>
          </div>
          <button
            className="modal-panel__close"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {loading ? (
          <div className="modal-panel__body">
            <p className="empty-state">Loading complaint details...</p>
          </div>
        ) : analysis ? (
          <div className="modal-panel__body">
            {/* Classification summary */}
            <article className="mini-panel">
              <p className="section-kicker">Classification</p>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                <span className="pill">{analysis.classification?.product ?? "Unknown"}</span>
                <span className={`pill pill--${String(analysis.compliance_risk?.risk_level ?? "low").toLowerCase()}`}>
                  {analysis.compliance_risk?.risk_level ?? "Unknown risk"}
                </span>
              </div>
              <h4>{analysis.classification?.issue ?? "Awaiting analysis"}</h4>
            </article>

            {/* Narrative */}
            <article className="mini-panel">
              <p className="section-kicker">Narrative</p>
              <p>{analysis.complaint?.narrative}</p>
            </article>

            {/* Compliance reasoning */}
            <article className="mini-panel">
              <p className="section-kicker">Compliance assessment</p>
              <p>{analysis.compliance_risk?.reasoning}</p>
              {analysis.compliance_risk?.flags?.length ? (
                <div className="timeline__chips" style={{ marginTop: 8 }}>
                  {analysis.compliance_risk.flags.slice(0, 5).map((flag) => (
                    <span key={`${flag.regulation}-${flag.description}`} className="pill pill--critical">
                      {flag.regulation}
                    </span>
                  ))}
                </div>
              ) : null}
            </article>

            {/* Review signal */}
            <article className="mini-panel">
              <p className="section-kicker">QA review signal</p>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
                <span className={`pill ${analysis.qa_validation?.passed ? "pill--low" : "pill--critical"}`}>
                  {analysis.qa_validation?.passed ? "Passed" : "Needs review"}
                </span>
                {typeof analysis.qa_validation?.overall_score === "number" ? (
                  <span className="pill pill--sky">
                    Score: {Math.round(analysis.qa_validation.overall_score * 100)}%
                  </span>
                ) : null}
              </div>
              <p>{analysis.qa_validation?.reasoning}</p>
            </article>

            {/* Routing */}
            <RoutingWhyPanel analysis={analysis} />
          </div>
        ) : (
          <div className="modal-panel__body">
            <p className="empty-state">Could not load complaint details.</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Supervisor() {
  const [snapshot, setSnapshot] = useState(null);
  const [selectedComplaintId, setSelectedComplaintId] = useState("");
  const [analysis, setAnalysis] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const payload = await getSupervisorDashboard();
        if (!cancelled) {
          setSnapshot(payload);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError.message);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadDetail() {
      if (!selectedComplaintId) {
        setAnalysis(null);
        return;
      }

      setLoadingDetail(true);
      try {
        const payload = await getComplaint(selectedComplaintId);
        if (!cancelled) {
          setAnalysis(payload);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError.message);
        }
      } finally {
        if (!cancelled) {
          setLoadingDetail(false);
        }
      }
    }

    loadDetail();
    return () => {
      cancelled = true;
    };
  }, [selectedComplaintId]);

  function openBrief(complaintId) {
    setSelectedComplaintId(complaintId);
  }

  function closeBrief() {
    setSelectedComplaintId("");
    setAnalysis(null);
  }

  const counts = snapshot?.counts ?? {};

  return (
    <div className="page-grid supervisor-grid">
      {error ? <div className="banner banner--error">{error}</div> : null}

      <section className="stats-grid">
        <div className="stat-card stat-card--alert">
          <p className="stat-card__label">Needs human review</p>
          <h3 className="stat-card__value">{counts.needs_human_review ?? 0}</h3>
          <p className="stat-card__detail">QA failures, escalations, or immediate-attention cases.</p>
        </div>
        <div className="stat-card stat-card--alert">
          <p className="stat-card__label">High regulatory risk</p>
          <h3 className="stat-card__value">{counts.high_regulatory_risk ?? 0}</h3>
          <p className="stat-card__detail">HIGH or CRITICAL risk exposures needing oversight.</p>
        </div>
        <div className="stat-card stat-card--info">
          <p className="stat-card__label">SLA breach risk</p>
          <h3 className="stat-card__value">{counts.sla_breach_risk ?? 0}</h3>
          <p className="stat-card__detail">Cases drifting close to or beyond their first-response window.</p>
        </div>
        <div className="stat-card stat-card--success">
          <p className="stat-card__label">Vulnerable-customer queue</p>
          <h3 className="stat-card__value">{counts.vulnerable_customer_cases ?? 0}</h3>
          <p className="stat-card__detail">Tagged older, servicemember, or other protected-population complaints.</p>
        </div>
      </section>

      <QueuePanel
        title="Needs review"
        kicker="Supervisor queue"
        complaints={snapshot?.queues?.needs_human_review ?? []}
        onSelect={openBrief}
      />
      <QueuePanel
        title="High risk"
        kicker="Regulatory watch"
        complaints={snapshot?.queues?.high_regulatory_risk ?? []}
        onSelect={openBrief}
      />
      <QueuePanel
        title="SLA risk"
        kicker="Timing watch"
        complaints={snapshot?.queues?.sla_breach_risk ?? []}
        onSelect={openBrief}
      />

      {/* Modal popup for supervisor brief */}
      {selectedComplaintId ? (
        <BriefModal
          analysis={analysis}
          loading={loadingDetail}
          onClose={closeBrief}
        />
      ) : null}
    </div>
  );
}
