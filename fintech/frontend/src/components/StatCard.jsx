export default function StatCard({ label, value, tone = "neutral", detail }) {
  return (
    <article className={`stat-card stat-card--${tone}`}>
      <p className="stat-card__label">{label}</p>
      <h3 className="stat-card__value">{value}</h3>
      {detail ? <p className="stat-card__detail">{detail}</p> : null}
    </article>
  );
}
