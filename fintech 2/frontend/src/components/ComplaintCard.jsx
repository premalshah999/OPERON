import { prettyLabel } from "../lib/complaint-helpers";

export default function ComplaintCard({ complaint, compact = false, onClick }) {
  return (
    <article
      className={`complaint-card ${compact ? "complaint-card--compact" : ""}`}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onClick();
              }
            }
          : undefined
      }
    >
      <div className="complaint-card__top">
        <span className="pill">{complaint.product ?? "Unclassified"}</span>
        <span className={`pill pill--${String(complaint.risk_level ?? "low").toLowerCase()}`}>
          {prettyLabel(complaint.risk_level ?? "low")}
        </span>
      </div>
      <h3>{complaint.issue ?? "Awaiting analysis"}</h3>
      <p>{complaint.narrative_preview}</p>
      <div className="complaint-card__meta">
        <span>{complaint.assigned_team ?? "Pending routing"}</span>
        <span>{prettyLabel(complaint.priority ?? complaint.status)}</span>
        {complaint.customer_state ? <span>{complaint.customer_state}</span> : null}
        {complaint.channel ? <span>{prettyLabel(complaint.channel)}</span> : null}
      </div>
      {complaint.needs_human_review || complaint.sla_breach_risk || complaint.vulnerable_customer ? (
        <div className="timeline__chips complaint-card__signals">
          {complaint.needs_human_review ? <span className="pill pill--amber">Needs review</span> : null}
          {complaint.sla_breach_risk ? <span className="pill pill--orange">SLA risk</span> : null}
          {complaint.vulnerable_customer ? <span className="pill pill--sky">Vulnerable tag</span> : null}
        </div>
      ) : null}
    </article>
  );
}
