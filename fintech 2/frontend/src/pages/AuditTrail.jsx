import { useEffect, useState } from "react";
import BaselineComparison from "../components/BaselineComparison";
import EvidencePanel from "../components/EvidencePanel";
import RoutingWhyPanel from "../components/RoutingWhyPanel";
import { getAuditTrail, getComplaint, getComplaints } from "../lib/api";
import { prettyLabel } from "../lib/complaint-helpers";

/* ── Tab definitions ── */
const TABS = [
  { key: "overview",  label: "Overview" },
  { key: "evidence",  label: "Evidence" },
  { key: "timeline",  label: "Agent trail" },
  { key: "baseline",  label: "AI vs baseline" },
];

/* ── Pretty-print agent names ── */
function agentDisplayName(raw) {
  return (raw ?? "")
    .replace(/Agent$/i, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim() || raw;
}

/* ── Format a decision string: strip leading JSON blobs ── */
function cleanDecision(decision) {
  if (!decision) return "";
  let result = decision.trim();
  // If the whole string looks like it starts with JSON, strip it
  if (/^\{/.test(result)) {
    // Find the end of the outermost JSON object, counting all bracket types
    let depth = 0;
    let inString = false;
    let escape = false;
    let end = 0;
    for (let i = 0; i < result.length; i++) {
      const ch = result[i];
      if (escape) { escape = false; continue; }
      if (ch === "\\") { escape = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === "{" || ch === "[") depth++;
      if (ch === "}" || ch === "]") depth--;
      if (depth === 0) { end = i + 1; break; }
    }
    if (end > 0) {
      result = result.slice(end).trim();
    }
  }
  return result || decision;
}

export default function AuditTrail() {
  const [complaints, setComplaints] = useState([]);
  const [selectedComplaintId, setSelectedComplaintId] = useState("");
  const [analysis, setAnalysis] = useState(null);
  const [auditTrail, setAuditTrail] = useState([]);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("overview");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadComplaints() {
      try {
        const payload = await getComplaints(20);
        if (cancelled) return;
        const items = payload.complaints ?? [];
        setComplaints(items);
        if (items[0]?.complaint_id) {
          setSelectedComplaintId(items[0].complaint_id);
        }
      } catch (loadError) {
        if (!cancelled) setError(loadError.message);
      }
    }

    loadComplaints();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadDetail() {
      if (!selectedComplaintId) return;
      setLoading(true);
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
        if (!cancelled) setError(loadError.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadDetail();
    return () => { cancelled = true; };
  }, [selectedComplaintId]);

  const classification = analysis?.classification ?? {};
  const compliance = analysis?.compliance_risk ?? {};
  const routing = analysis?.routing ?? {};
  const qa = analysis?.qa_validation ?? {};

  function handleSelectComplaint(id) {
    setSelectedComplaintId(id);
    setActiveTab("overview");
  }

  return (
    <div className="audit-layout">
      {error ? <div className="banner banner--error">{error}</div> : null}

      {/* ── Left : Complaint picker ── */}
      <aside className="audit-layout__sidebar panel">
        <div className="panel__header">
          <div>
            <p className="section-kicker">Cases</p>
            <h2>Processed</h2>
          </div>
          <span className="pill">{complaints.length}</span>
        </div>
        <div className="selector-list">
          {complaints.map((c) => (
            <button
              key={c.complaint_id}
              type="button"
              className={
                selectedComplaintId === c.complaint_id
                  ? "selector-list__item is-active"
                  : "selector-list__item"
              }
              onClick={() => handleSelectComplaint(c.complaint_id)}
            >
              <span>{c.complaint_id}</span>
              <small>{c.issue ?? c.product ?? "Awaiting analysis"}</small>
            </button>
          ))}
        </div>
      </aside>

      {/* ── Right : Detail area ── */}
      <div className="audit-layout__main">
        {loading ? (
          <p className="empty-state" style={{ padding: 24 }}>Loading audit detail…</p>
        ) : !analysis ? (
          <p className="empty-state" style={{ padding: 24 }}>Select a complaint to inspect.</p>
        ) : (
          <>
            {/* ── Headline bar ── */}
            <div className="audit-headline">
              <div>
                <p className="section-kicker">{selectedComplaintId}</p>
                <h2>{classification.issue ?? "Awaiting classification"}</h2>
              </div>
              <div className="audit-headline__pills">
                <span className="pill">{classification.product ?? "—"}</span>
                <span className={`pill pill--${String(compliance.risk_level ?? "low").toLowerCase()}`}>
                  {compliance.risk_level ?? "—"}
                </span>
                <span className="pill pill--sky">
                  {routing.assigned_team ?? "Unrouted"}
                </span>
                <span className={`pill ${qa.passed ? "pill--low" : "pill--critical"}`}>
                  QA {qa.passed ? "Pass" : "Fail"}
                </span>
              </div>
            </div>

            {/* ── Quick KPI strip ── */}
            <div className="audit-kpis">
              <div className="audit-kpi">
                <span>Severity</span>
                <strong>{classification.severity ?? "—"}</strong>
              </div>
              <div className="audit-kpi">
                <span>Risk score</span>
                <strong>{compliance.risk_score ?? "—"}<small>/100</small></strong>
              </div>
              <div className="audit-kpi">
                <span>Priority</span>
                <strong>{prettyLabel(routing.priority) ?? "—"}</strong>
              </div>
              <div className="audit-kpi">
                <span>SLA</span>
                <strong>{routing.sla_hours ? `${routing.sla_hours}h` : "—"}</strong>
              </div>
              <div className="audit-kpi">
                <span>QA score</span>
                <strong>{typeof qa.overall_score === "number" ? `${Math.round(qa.overall_score * 100)}%` : "—"}</strong>
              </div>
              <div className="audit-kpi">
                <span>Agents run</span>
                <strong>{auditTrail.length}</strong>
              </div>
            </div>

            {/* ── Tab bar ── */}
            <div className="audit-tabs">
              {TABS.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  className={activeTab === tab.key ? "audit-tab is-active" : "audit-tab"}
                  onClick={() => setActiveTab(tab.key)}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* ── Tab content ── */}
            <div className="audit-tab-content">
              {activeTab === "overview" && (
                <div className="audit-overview-grid">
                  <article className="mini-panel">
                    <p className="section-kicker">Complaint narrative</p>
                    <p>{analysis.complaint?.narrative}</p>
                  </article>
                  <article className="mini-panel">
                    <p className="section-kicker">Compliance assessment</p>
                    <h4>{compliance.risk_level ?? "Unknown"}</h4>
                    <p>{compliance.reasoning}</p>
                    {compliance.flags?.length ? (
                      <div className="timeline__chips" style={{ marginTop: 8 }}>
                        {compliance.flags.slice(0, 6).map((f) => (
                          <span key={`${f.regulation}-${f.description}`} className="pill pill--critical">
                            {f.regulation}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </article>
                  <RoutingWhyPanel analysis={analysis} />
                  {qa.reasoning ? (
                    <article className="mini-panel">
                      <p className="section-kicker">QA validation</p>
                      <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                        <span className={`pill ${qa.passed ? "pill--low" : "pill--critical"}`}>
                          {qa.passed ? "Passed" : "Failed"}
                        </span>
                        {typeof qa.overall_score === "number" ? (
                          <span className="pill pill--sky">
                            Score: {Math.round(qa.overall_score * 100)}%
                          </span>
                        ) : null}
                      </div>
                      <p>{qa.reasoning}</p>
                      {qa.improvements?.length ? (
                        <ul className="audit-improvements">
                          {qa.improvements.map((imp) => (
                            <li key={imp}>{imp}</li>
                          ))}
                        </ul>
                      ) : null}
                    </article>
                  ) : null}
                </div>
              )}

              {activeTab === "evidence" && (
                <EvidencePanel analysis={analysis} inline />
              )}

              {activeTab === "timeline" && (
                <div className="timeline">
                  {auditTrail.length ? (
                    auditTrail.map((entry) => (
                      <article key={`${entry.agent_name}-${entry.timestamp}`} className="timeline__entry">
                        <div className="timeline__marker" />
                        <div className="timeline__body">
                          <div className="timeline__header">
                            <h3>{agentDisplayName(entry.agent_name)}</h3>
                            <span>{new Date(entry.timestamp).toLocaleString()}</span>
                          </div>
                          {entry.decision ? (
                            <p className="timeline__decision">{cleanDecision(entry.decision)}</p>
                          ) : null}
                          <p>{entry.reasoning}</p>
                          {entry.evidence_spans?.length ? (
                            <div className="timeline__chips">
                              {entry.evidence_spans.map((ev) => (
                                <span key={ev} className="pill">{ev}</span>
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
              )}

              {activeTab === "baseline" && (
                <div className="result-grid">
                  <BaselineComparison analysis={analysis} />
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
