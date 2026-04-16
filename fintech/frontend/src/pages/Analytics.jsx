import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getDashboardStats, getDashboardTrends } from "../lib/api";

const palette = ["#2dd4bf", "#f59e0b", "#f97316", "#fb7185", "#38bdf8", "#94a3b8"];

export default function Analytics() {
  const [trends, setTrends] = useState(null);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [trendsPayload, statsPayload] = await Promise.all([
          getDashboardTrends(),
          getDashboardStats(),
        ]);
        if (!cancelled) {
          setTrends(trendsPayload);
          setStats(statsPayload);
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

  return (
    <div className="page-grid analytics-grid">
      {error ? <div className="banner banner--error">{error}</div> : null}

      <section className="panel chart-panel">
        <div className="panel__header">
          <div>
            <p className="section-kicker">Trend line</p>
            <h2>Complaints over time</h2>
          </div>
        </div>
        <div className="chart-wrap">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trends?.complaints_over_time ?? []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27445d" />
              <XAxis dataKey="date" stroke="#94a3b8" />
              <YAxis stroke="#94a3b8" />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="count"
                stroke="#2dd4bf"
                strokeWidth={3}
                dot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="panel chart-panel">
        <div className="panel__header">
          <div>
            <p className="section-kicker">Mix</p>
            <h2>Product distribution</h2>
          </div>
        </div>
        <div className="chart-wrap">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={trends?.product_breakdown ?? []} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#27445d" />
              <XAxis type="number" stroke="#94a3b8" />
              <YAxis type="category" dataKey="name" width={110} stroke="#94a3b8" />
              <Tooltip />
              <Bar dataKey="value" radius={[0, 10, 10, 0]}>
                {(trends?.product_breakdown ?? []).map((entry, index) => (
                  <Cell key={entry.name} fill={palette[index % palette.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="panel chart-panel">
        <div className="panel__header">
          <div>
            <p className="section-kicker">Risk</p>
            <h2>Risk distribution</h2>
          </div>
        </div>
        <div className="chart-wrap">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={trends?.risk_breakdown ?? []}
                dataKey="value"
                nameKey="name"
                innerRadius={55}
                outerRadius={88}
                paddingAngle={4}
              >
                {(trends?.risk_breakdown ?? []).map((entry, index) => (
                  <Cell key={entry.name} fill={palette[index % palette.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="panel">
        <div className="panel__header">
          <div>
            <p className="section-kicker">Resolution timing</p>
            <h2>Average handling time by product</h2>
          </div>
        </div>
        <div className="meter-list">
          {(trends?.resolution_time_by_product ?? []).length ? (
            trends.resolution_time_by_product.map((row) => (
              <div key={row.product} className="meter-row">
                <span>{row.product}</span>
                <div className="meter-track">
                  <div
                    className="meter-fill meter-fill--amber"
                    style={{
                      width: `${Math.min(row.hours * 10, 100)}%`,
                    }}
                  />
                </div>
                <strong>{row.hours}h</strong>
              </div>
            ))
          ) : (
            <p className="empty-state">Processing time appears after completed analyses.</p>
          )}
        </div>
      </section>

      <section className="panel">
        <div className="panel__header">
          <div>
            <p className="section-kicker">Severity</p>
            <h2>Severity mix snapshot</h2>
          </div>
        </div>
        <div className="chip-grid">
          {Object.entries(stats?.severity_distribution ?? {}).map(([label, value]) => (
            <div key={label} className="chip-card">
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
