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

const palette = ["#9fe870", "#054d28", "#37382f", "#ffc091", "#38c8ff", "#868685"];

const tooltipStyle = {
  backgroundColor: "#0e0f0c",
  border: "none",
  borderRadius: "8px",
  color: "#ffffff",
  fontSize: "12px",
  fontWeight: 600,
  padding: "8px 12px",
};

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

      <section className="panel chart-panel panel--wide">
        <div className="panel__header">
          <div>
            <p className="section-kicker">Trend</p>
            <h2>Complaints over time</h2>
          </div>
        </div>
        <div className="chart-wrap">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trends?.complaints_over_time ?? []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e8ebe6" />
              <XAxis dataKey="date" stroke="#868685" tick={{ fontSize: 11 }} />
              <YAxis stroke="#868685" tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Line
                type="monotone"
                dataKey="count"
                stroke="#9fe870"
                strokeWidth={2}
                dot={{ r: 4, fill: "#9fe870", stroke: "#163300", strokeWidth: 1.5 }}
                activeDot={{ r: 6, fill: "#163300" }}
              />
            </LineChart>
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
                innerRadius={50}
                outerRadius={75}
                paddingAngle={3}
                strokeWidth={0}
              >
                {(trends?.risk_breakdown ?? []).map((entry, index) => (
                  <Cell key={entry.name} fill={palette[index % palette.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
              <Legend
                wrapperStyle={{ fontSize: "11px", fontWeight: 600 }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="panel chart-panel panel--wide">
        <div className="panel__header">
          <div>
            <p className="section-kicker">Mix</p>
            <h2>Product distribution</h2>
          </div>
        </div>
        <div className="chart-wrap">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={trends?.product_breakdown ?? []} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#e8ebe6" />
              <XAxis type="number" stroke="#868685" tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" width={100} stroke="#868685" tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={20}>
                {(trends?.product_breakdown ?? []).map((entry, index) => (
                  <Cell key={entry.name} fill={palette[index % palette.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="panel">
        <div className="panel__header">
          <div>
            <p className="section-kicker">Timing</p>
            <h2>Avg handling time</h2>
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
            <p className="empty-state">Appears after completed analyses.</p>
          )}
        </div>
      </section>

      <section className="panel">
        <div className="panel__header">
          <div>
            <p className="section-kicker">Severity</p>
            <h2>Severity snapshot</h2>
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
