function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function collectEvidence(analysis) {
  const classification = analysis?.classification ?? {};
  const compliance = analysis?.compliance_risk ?? {};
  const evidence = [];

  for (const entity of classification.key_entities ?? []) {
    evidence.push({
      id: `entity-${entity}`,
      label: "Key entity",
      fragment: entity,
      note: classification.issue ?? "Classification cue",
      tone: "sky",
    });
  }

  for (const flag of compliance.flags ?? []) {
    if (!flag.evidence_quote) {
      continue;
    }

    evidence.push({
      id: `flag-${flag.regulation}-${flag.evidence_quote}`,
      label: flag.regulation_name ?? flag.regulation ?? "Regulatory flag",
      fragment: flag.evidence_quote,
      note: flag.description,
      tone: (flag.severity ?? "critical").toLowerCase(),
    });
  }

  return evidence.filter(
    (item, index, list) =>
      item.fragment
      && list.findIndex((candidate) => candidate.fragment.toLowerCase() === item.fragment.toLowerCase()) === index,
  );
}

function buildNarrativeMarkup(narrative, evidence) {
  if (!narrative) {
    return [{ text: "Narrative unavailable.", highlighted: false }];
  }

  const matches = evidence
    .map((item) => {
      const regex = new RegExp(escapeRegExp(item.fragment), "i");
      const match = narrative.match(regex);
      if (!match || match.index === undefined) {
        return null;
      }
      return {
        start: match.index,
        end: match.index + match[0].length,
        tone: item.tone,
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.start - right.start || right.end - left.end);

  const filtered = [];
  let cursor = -1;
  for (const match of matches) {
    if (match.start < cursor) {
      continue;
    }
    filtered.push(match);
    cursor = match.end;
  }

  if (!filtered.length) {
    return [{ text: narrative, highlighted: false }];
  }

  const parts = [];
  let position = 0;
  for (const match of filtered) {
    if (match.start > position) {
      parts.push({ text: narrative.slice(position, match.start), highlighted: false });
    }
    parts.push({
      text: narrative.slice(match.start, match.end),
      highlighted: true,
      tone: match.tone,
    });
    position = match.end;
  }

  if (position < narrative.length) {
    parts.push({ text: narrative.slice(position), highlighted: false });
  }

  return parts;
}

export default function EvidencePanel({ analysis, inline }) {
  const evidence = collectEvidence(analysis);
  const narrative = analysis?.complaint?.narrative ?? "";
  const narrativeParts = buildNarrativeMarkup(narrative, evidence);

  const content = (
    <div className="evidence-panel__layout">
      <article className="mini-panel evidence-panel__narrative">
        <p className="section-kicker">Original narrative</p>
        <p className="evidence-panel__copy">
          {narrativeParts.map((part, index) => (
            part.highlighted ? (
              <mark
                key={`${part.text}-${index}`}
                className={`evidence-mark evidence-mark--${part.tone ?? "sky"}`}
              >
                {part.text}
              </mark>
            ) : (
              <span key={`${part.text}-${index}`}>{part.text}</span>
            )
          ))}
        </p>
      </article>

      <aside className="mini-panel evidence-panel__sidebar">
        <p className="section-kicker">Evidence used</p>
        <div className="evidence-panel__list">
          {evidence.length ? (
            evidence.map((item) => (
              <article key={item.id} className="evidence-item">
                <span className={`pill pill--${item.tone}`}>{item.label}</span>
                <strong>{item.fragment}</strong>
                <p>{item.note}</p>
              </article>
            ))
          ) : (
            <p className="empty-state">Structured evidence appears after classification and compliance complete.</p>
          )}
        </div>
      </aside>
    </div>
  );

  if (inline) {
    return content;
  }

  return (
    <section className="panel panel--wide evidence-panel">
      <div className="panel__header">
        <div>
          <p className="section-kicker">Evidence view</p>
          <h2>Side-by-side narrative support</h2>
        </div>
      </div>
      {content}
    </section>
  );
}

