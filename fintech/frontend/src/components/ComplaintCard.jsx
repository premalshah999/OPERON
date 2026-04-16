function prettyLabel(value) {
  if (!value) {
    return "Unknown";
  }
  return String(value)
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

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
      </div>
    </article>
  );
}
