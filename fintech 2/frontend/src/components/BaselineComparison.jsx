import { compareRoutingToBaseline } from "../lib/complaint-helpers";

export default function BaselineComparison({ analysis }) {
  const { baseline, comparisons } = compareRoutingToBaseline(analysis);

  return (
    <article className="mini-panel baseline-panel">
      <p className="section-kicker">AI vs baseline</p>
      <h4>Demo workflow comparison</h4>
      <div className="baseline-table">
        {comparisons.map((row) => (
          <div key={row.label} className="baseline-table__row">
            <span>{row.label}</span>
            <div className={row.match ? "baseline-diff baseline-diff--match" : "baseline-diff baseline-diff--delta"}>
              <strong>{row.ai}</strong>
              <small>AI</small>
            </div>
            <div className="baseline-diff">
              <strong>{row.baseline}</strong>
              <small>Baseline</small>
            </div>
          </div>
        ))}
      </div>

      <div className="baseline-panel__notes">
        {baseline.reasons.map((reason) => (
          <p key={reason}>{reason}</p>
        ))}
      </div>
    </article>
  );
}
