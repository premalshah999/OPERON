import { useEffect, useState } from "react";
import ComplaintCard from "../components/ComplaintCard";
import RoutingWhyPanel from "../components/RoutingWhyPanel";
import { prettyLabel } from "../lib/complaint-helpers";
import { getComplaint, getComplaints } from "../lib/api";

const initialFilters = {
  product: "",
  risk_level: "",
  customer_state: "",
  channel: "",
  tag: "",
  vulnerable_only: false,
  needs_review: "",
  high_risk: "",
};

function normaliseFilterValue(value) {
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  return value;
}

export default function Triage() {
  const [filters, setFilters] = useState(initialFilters);
  const [options, setOptions] = useState(null);
  const [complaints, setComplaints] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [selectedComplaintId, setSelectedComplaintId] = useState("");
  const [analysis, setAnalysis] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const payload = await getComplaints(60, filters);
        if (cancelled) {
          return;
        }
        setComplaints(payload.complaints ?? []);
        setTotalCount(payload.total ?? 0);
        setOptions(payload.available_filters ?? null);
        setSelectedComplaintId((current) => {
          if (payload.complaints?.some((item) => item.complaint_id === current)) {
            return current;
          }
          return payload.complaints?.[0]?.complaint_id ?? "";
        });
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
  }, [filters]);

  useEffect(() => {
    let cancelled = false;

    async function loadDetail() {
      if (!selectedComplaintId) {
        setAnalysis(null);
        return;
      }

      try {
        const payload = await getComplaint(selectedComplaintId);
        if (!cancelled) {
          setAnalysis(payload);
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

  function updateFilter(key, value) {
    setFilters((current) => ({ ...current, [key]: normaliseFilterValue(value) }));
  }

  const summary = {
    total: totalCount,
    highRisk: complaints.filter((item) => item.high_regulatory_risk).length,
    needsReview: complaints.filter((item) => item.needs_human_review).length,
    vulnerable: complaints.filter((item) => item.vulnerable_customer).length,
  };

  return (
    <div className="page-grid triage-grid">
      {error ? <div className="banner banner--error">{error}</div> : null}

      <section className="panel panel--wide triage-filters">
        <div className="panel__header">
          <div>
            <p className="section-kicker">Batch triage</p>
            <h2>Filter the queue before you work it</h2>
          </div>
        </div>

        <div className="filter-toolbar">
          <label className="field">
            <span>Product</span>
            <select value={filters.product} onChange={(event) => updateFilter("product", event.target.value)}>
              <option value="">All</option>
              {(options?.products ?? []).map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Risk</span>
            <select value={filters.risk_level} onChange={(event) => updateFilter("risk_level", event.target.value)}>
              <option value="">All</option>
              {(options?.risk_levels ?? []).map((value) => (
                <option key={value} value={value}>{prettyLabel(value)}</option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>State</span>
            <select value={filters.customer_state} onChange={(event) => updateFilter("customer_state", event.target.value)}>
              <option value="">All</option>
              {(options?.states ?? []).map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Channel</span>
            <select value={filters.channel} onChange={(event) => updateFilter("channel", event.target.value)}>
              <option value="">All</option>
              {(options?.channels ?? []).map((value) => (
                <option key={value} value={value}>{prettyLabel(value)}</option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Tag</span>
            <select value={filters.tag} onChange={(event) => updateFilter("tag", event.target.value)}>
              <option value="">All</option>
              {(options?.tags ?? []).map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Needs review</span>
            <select value={String(filters.needs_review)} onChange={(event) => updateFilter("needs_review", event.target.value)}>
              <option value="">Any</option>
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          </label>

          <label className="field">
            <span>High risk</span>
            <select value={String(filters.high_risk)} onChange={(event) => updateFilter("high_risk", event.target.value)}>
              <option value="">Any</option>
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          </label>

          <label className="field field--checkbox">
            <input
              type="checkbox"
              checked={filters.vulnerable_only}
              onChange={(event) => updateFilter("vulnerable_only", event.target.checked)}
            />
            <span>Vulnerable tags only</span>
          </label>
        </div>

        <div className="chip-grid">
          <div className="chip-card"><span>Visible cases</span><strong>{summary.total}</strong></div>
          <div className="chip-card"><span>Needs review</span><strong>{summary.needsReview}</strong></div>
          <div className="chip-card"><span>High risk</span><strong>{summary.highRisk}</strong></div>
          <div className="chip-card"><span>Vulnerable-tag</span><strong>{summary.vulnerable}</strong></div>
        </div>
      </section>

      <section className="panel panel--wide">
        <div className="panel__header">
          <div>
            <p className="section-kicker">Queue</p>
            <h2>Filtered complaint batch</h2>
          </div>
        </div>

        <div className="complaint-list">
          {complaints.length ? (
            complaints.map((complaint) => (
              <ComplaintCard
                key={complaint.complaint_id}
                complaint={complaint}
                compact
                onClick={() => setSelectedComplaintId(complaint.complaint_id)}
              />
            ))
          ) : (
            <p className="empty-state">No complaints match the current triage filters.</p>
          )}
        </div>
      </section>

      <section className="panel">
        <div className="panel__header">
          <div>
            <p className="section-kicker">Selected case</p>
            <h2>{analysis?.complaint_id ?? "Choose a complaint"}</h2>
          </div>
        </div>

        {analysis ? (
          <div className="result-stack">
            <article className="mini-panel">
              <p className="section-kicker">Queue summary</p>
              <h4>{analysis.classification?.issue ?? "Awaiting analysis"}</h4>
              <p>{analysis.complaint?.narrative}</p>
            </article>
            <RoutingWhyPanel analysis={analysis} />
          </div>
        ) : (
          <p className="empty-state">Select a complaint to see the routing context.</p>
        )}
      </section>
    </div>
  );
}
