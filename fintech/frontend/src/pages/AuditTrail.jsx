import { useEffect, useState } from "react";
import { getAuditTrail, getComplaint, getComplaints } from "../lib/api";

export default function AuditTrail() {
  const [complaints, setComplaints] = useState([]);
  const [selectedComplaintId, setSelectedComplaintId] = useState("");
  const [analysis, setAnalysis] = useState(null);
  const [auditTrail, setAuditTrail] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadComplaints() {
      try {
        const payload = await getComplaints(20);
        if (cancelled) {
          return;
        }
        const items = payload.complaints ?? [];
        setComplaints(items);
        if (items[0]?.complaint_id) {
          setSelectedComplaintId(items[0].complaint_id);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError.message);
        }
      }
    }

    loadComplaints();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadDetail() {
      if (!selectedComplaintId) {
        return;
      }

      try {
        const [analysisPayload, auditPayload] = await Promise.all([
          getComplaint(selectedComplaintId),
          getAuditTrail(selectedComplaintId),
        ]);
        if (!cancelled) {
          setAnalysis(analysisPayload);
          setAuditTrail(auditPayload.audit_trail ?? []);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError.message);
        }
      }
    }

    loadDetail();
    return () => {
      cancelled = true;
    };
  }, [selectedComplaintId]);

  return (
    <div className="page-grid audit-grid">
      {error ? <div className="banner banner--error">{error}</div> : null}

      <section className="panel">
        <div className="panel__header">
          <div>
            <p className="section-kicker">Complaint selector</p>
            <h2>Pick a processed complaint</h2>
          </div>
        </div>
        <div className="selector-list">
          {complaints.map((complaint) => (
            <button
              key={complaint.complaint_id}
              type="button"
              className={
                selectedComplaintId === complaint.complaint_id
                  ? "selector-list__item is-active"
                  : "selector-list__item"
              }
              onClick={() => setSelectedComplaintId(complaint.complaint_id)}
            >
              <span>{complaint.complaint_id}</span>
              <small>{complaint.issue ?? complaint.product ?? "Awaiting analysis"}</small>
            </button>
          ))}
        </div>
      </section>

      <section className="panel panel--wide">
        <div className="panel__header">
          <div>
            <p className="section-kicker">Decision summary</p>
            <h2>{analysis?.classification?.issue ?? "Audit detail"}</h2>
          </div>
        </div>

        {analysis ? (
          <div className="audit-summary">
            <article className="mini-panel">
              <p className="section-kicker">Complaint</p>
              <h4>{analysis.complaint?.product ?? "Unknown product"}</h4>
              <p>{analysis.complaint?.narrative}</p>
            </article>
            <article className="mini-panel">
              <p className="section-kicker">Compliance</p>
              <h4>{analysis.compliance_risk?.risk_level ?? "Unknown risk"}</h4>
              <p>{analysis.compliance_risk?.reasoning}</p>
            </article>
            <article className="mini-panel">
              <p className="section-kicker">Routing</p>
              <h4>{analysis.routing?.assigned_team ?? "Pending"}</h4>
              <p>{analysis.routing?.reasoning}</p>
            </article>
          </div>
        ) : (
          <p className="empty-state">Select a complaint to view its audit trail.</p>
        )}

        <div className="timeline">
          {auditTrail.length ? (
            auditTrail.map((entry) => (
              <article key={`${entry.agent_name}-${entry.timestamp}`} className="timeline__entry">
                <div className="timeline__marker" />
                <div className="timeline__body">
                  <div className="timeline__header">
                    <h3>{entry.agent_name}</h3>
                    <span>{new Date(entry.timestamp).toLocaleString()}</span>
                  </div>
                  <p className="timeline__decision">{entry.decision}</p>
                  <p>{entry.reasoning}</p>
                  {entry.evidence_spans?.length ? (
                    <div className="timeline__chips">
                      {entry.evidence_spans.map((evidence) => (
                        <span key={evidence} className="pill">
                          {evidence}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              </article>
            ))
          ) : (
            <p className="empty-state">Audit entries appear after a complaint completes the pipeline.</p>
          )}
        </div>
      </section>
    </div>
  );
}
