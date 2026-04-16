import { useEffect, useState } from "react";
import ComplaintCard from "../components/ComplaintCard";
import StatCard from "../components/StatCard";
import { getComplaints, getDashboardStats, getSupervisorDashboard } from "../lib/api";

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [supervisor, setSupervisor] = useState(null);
  const [complaints, setComplaints] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [statsPayload, complaintsPayload, supervisorPayload] = await Promise.all([
          getDashboardStats(),
          getComplaints(8),
          getSupervisorDashboard(4),
        ]);
        if (cancelled) {
          return;
        }
        setStats(statsPayload);
        setComplaints(complaintsPayload.complaints ?? []);
        setSupervisor(supervisorPayload);
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError.message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const riskDistributionEntries = Object.entries(stats?.risk_distribution ?? {});
  const productEntries = Object.entries(stats?.product_distribution ?? {});
  const sortedProductEntries = [...productEntries].sort(
    ([leftLabel, leftValue], [rightLabel, rightValue]) => rightValue - leftValue || leftLabel.localeCompare(rightLabel),
  );
  const maxProductCount = sortedProductEntries[0]?.[1] ?? 0;
  const totalProductCount = sortedProductEntries.reduce((sum, [, value]) => sum + value, 0);

  return (
    <div className="page-grid">
      {error ? <div className="banner banner--error">{error}</div> : null}

      <section className="stats-grid">
        <StatCard
          label="Total complaints"
          value={loading ? "..." : stats?.total_complaints ?? 0}
          tone="neutral"
          detail="Stored in SQLite with audit history"
        />
        <StatCard
          label="Complaints today"
          value={loading ? "..." : stats?.complaints_today ?? 0}
          tone="info"
          detail="Fresh intake during the current day"
        />
        <StatCard
          label="Compliance flags"
          value={loading ? "..." : stats?.compliance_flags_caught ?? 0}
          tone="alert"
          detail="Total regulation-linked flags identified"
        />
        <StatCard
          label="Auto-resolution rate"
          value={loading ? "..." : `${stats?.auto_resolution_rate ?? 0}%`}
          tone="success"
          detail="Complaints that completed the full agent flow"
        />
      </section>

      <section className="panel panel--wide">
        <div className="panel__header">
          <div>
            <p className="section-kicker">Recent queue</p>
            <h2>Latest processed complaints</h2>
          </div>
        </div>
        <div className="complaint-list">
          {complaints.length ? (
            complaints.map((complaint) => (
              <ComplaintCard
                key={complaint.complaint_id}
                complaint={complaint}
                compact
              />
            ))
          ) : (
            <p className="empty-state">
              {loading
                ? "Loading complaint feed..."
                : "No processed complaints yet. Run a sample from the Process page."}
            </p>
          )}
        </div>
      </section>

      <section className="panel">
        <div className="panel__header">
          <div>
            <p className="section-kicker">Risk mix</p>
            <h2>Distribution by risk level</h2>
          </div>
        </div>
        <div className="meter-list">
          {riskDistributionEntries.length ? (
            riskDistributionEntries.map(([label, value]) => (
              <div key={label} className="meter-row">
                <span>{label}</span>
                <div className="meter-track">
                  <div
                    className="meter-fill"
                    style={{
                      width: `${stats?.total_complaints ? (value / stats.total_complaints) * 100 : 0}%`,
                    }}
                  />
                </div>
                <strong>{value}</strong>
              </div>
            ))
          ) : (
            <p className="empty-state">No risk data available yet.</p>
          )}
        </div>
      </section>

      <section className="panel">
        <div className="panel__header">
          <div>
            <p className="section-kicker">Supervisor pulse</p>
            <h2>Queues needing attention</h2>
          </div>
        </div>
        <div className="chip-grid">
          <div className="chip-card">
            <span>Needs review</span>
            <strong>{supervisor?.counts?.needs_human_review ?? 0}</strong>
          </div>
          <div className="chip-card">
            <span>High risk</span>
            <strong>{supervisor?.counts?.high_regulatory_risk ?? 0}</strong>
          </div>
          <div className="chip-card">
            <span>SLA risk</span>
            <strong>{supervisor?.counts?.sla_breach_risk ?? 0}</strong>
          </div>
          <div className="chip-card">
            <span>Vulnerable</span>
            <strong>{supervisor?.counts?.vulnerable_customer_cases ?? 0}</strong>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel__header">
          <div>
            <p className="section-kicker">Product breakdown</p>
            <h2>Where complaints are landing</h2>
          </div>
          {sortedProductEntries.length ? (
            <span className="panel__hint">{totalProductCount} complaints</span>
          ) : null}
        </div>
        <div className="product-breakdown">
          {sortedProductEntries.length ? (
            sortedProductEntries.map(([label, value], index) => {
              const share = totalProductCount ? Math.round((value / totalProductCount) * 100) : 0;
              const width = maxProductCount ? Math.min((value / maxProductCount) * 100, 100) : 0;

              return (
                <div key={label} className="product-breakdown__row">
                  <div className="product-breakdown__header">
                    <div className="product-breakdown__label">
                      <span className="product-breakdown__rank">{String(index + 1).padStart(2, "0")}</span>
                      <strong>{label}</strong>
                    </div>
                    <div className="product-breakdown__stats">
                      <span>{share}%</span>
                      <strong>{value}</strong>
                    </div>
                  </div>
                  <div className="product-breakdown__track">
                    <div
                      className="product-breakdown__fill"
                      style={{ width: `${width}%` }}
                    />
                  </div>
                </div>
              );
            })
          ) : (
            <p className="empty-state">Product distribution appears after analysis runs.</p>
          )}
        </div>
      </section>
    </div>
  );
}
