import { useEffect, useState } from "react";
import ComplaintCard from "../components/ComplaintCard";
import StatCard from "../components/StatCard";
import { getComplaints, getDashboardStats } from "../lib/api";

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [complaints, setComplaints] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [statsPayload, complaintsPayload] = await Promise.all([
          getDashboardStats(),
          getComplaints(8),
        ]);
        if (cancelled) {
          return;
        }
        setStats(statsPayload);
        setComplaints(complaintsPayload.complaints ?? []);
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
            <p className="section-kicker">Product breakdown</p>
            <h2>Where complaints are landing</h2>
          </div>
        </div>
        <div className="bar-stack">
          {productEntries.length ? (
            productEntries.map(([label, value]) => (
              <div key={label} className="bar-stack__row">
                <div className="bar-stack__meta">
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
                <div
                  className="bar-stack__fill"
                  style={{
                    width: `${productEntries[0] ? (value / productEntries[0][1]) * 100 : 0}%`,
                  }}
                />
              </div>
            ))
          ) : (
            <p className="empty-state">Product distribution appears after analysis runs.</p>
          )}
        </div>
      </section>
    </div>
  );
}
