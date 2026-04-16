import { prettyLabel } from "../lib/complaint-helpers";

function buildRoutingDrivers(analysis) {
  const complaint = analysis?.complaint ?? {};
  const classification = analysis?.classification ?? {};
  const compliance = analysis?.compliance_risk ?? {};
  const routing = analysis?.routing ?? {};
  const tags = complaint.tags ?? [];
  const drivers = [
    { label: "Product", value: classification.product ?? complaint.product },
    { label: "Issue", value: classification.issue },
    { label: "Risk", value: compliance.risk_level ? `${compliance.risk_level} · ${compliance.risk_score ?? "?"}/100` : null },
    { label: "Priority", value: prettyLabel(routing.priority) },
    { label: "SLA", value: routing.sla_hours ? `${routing.sla_hours}h first response` : null },
    { label: "Channel", value: complaint.channel },
  ];

  if (compliance.requires_escalation) {
    drivers.push({ label: "Escalation", value: "Compliance escalation required" });
  }
  if (tags.length) {
    drivers.push({ label: "Tags", value: tags.join(", ") });
  }

  return drivers.filter((item) => item.value);
}

export default function RoutingWhyPanel({ analysis }) {
  const routing = analysis?.routing ?? {};
  const drivers = buildRoutingDrivers(analysis);

  return (
    <article className="mini-panel routing-why">
      <p className="section-kicker">Why it routed here</p>
      <h4>{routing.assigned_team ?? "Pending routing"}</h4>
      <p>{routing.reasoning ?? "Routing reasoning will appear after analysis completes."}</p>
      <div className="routing-why__drivers">
        {drivers.map((driver) => (
          <div key={`${driver.label}-${driver.value}`} className="routing-driver">
            <span>{driver.label}</span>
            <strong>{driver.value}</strong>
          </div>
        ))}
      </div>
    </article>
  );
}
