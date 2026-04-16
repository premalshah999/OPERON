function clampRisk(value) {
  const numeric = Number(value ?? 0);
  if (Number.isNaN(numeric)) {
    return 0;
  }
  return Math.max(0, Math.min(100, numeric));
}

function riskTone(score) {
  if (score >= 76) {
    return "critical";
  }
  if (score >= 51) {
    return "high";
  }
  if (score >= 26) {
    return "medium";
  }
  return "low";
}

export default function RiskGauge({ score = 0, label = "Risk score" }) {
  const normalized = clampRisk(score);
  const tone = riskTone(normalized);

  return (
    <div className={`risk-gauge risk-gauge--${tone}`}>
      <div
        className="risk-gauge__dial"
        style={{ "--risk-score": `${normalized}%` }}
      >
        <div className="risk-gauge__inner">
          <strong>{normalized}</strong>
          <span>/ 100</span>
        </div>
      </div>
      <p>{label}</p>
    </div>
  );
}
