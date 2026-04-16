const agentOrder = [
  {
    id: "ClassificationAgent",
    label: "Classification",
    detail: "Product, issue, severity, sentiment",
  },
  {
    id: "ComplianceRiskAgent",
    label: "Compliance",
    detail: "Regulatory flags and risk scoring",
  },
  {
    id: "RoutingAgent",
    label: "Routing",
    detail: "Team, tier, priority, SLA",
  },
  {
    id: "ResolutionAgent",
    label: "Resolution",
    detail: "Action plan and customer response",
  },
  {
    id: "QAValidationAgent",
    label: "QA",
    detail: "Cross-checks and quality score",
  },
];

function getStatusByAgent(events) {
  const byAgent = {};

  for (const event of events) {
    byAgent[event.agent] = event;
  }

  return byAgent;
}

function summarizeResult(result) {
  if (!result) {
    return "";
  }
  if (result.issue) {
    return result.issue;
  }
  if (result.risk_level) {
    return `${result.risk_level} risk`;
  }
  if (result.assigned_team) {
    return result.assigned_team;
  }
  if (result.estimated_resolution_days) {
    return `${result.estimated_resolution_days} day estimate`;
  }
  if (typeof result.overall_score === "number") {
    return `${Math.round(result.overall_score * 100)}% score`;
  }
  return "Completed";
}

export default function AgentPipeline({ events }) {
  const latestByAgent = getStatusByAgent(events);

  return (
    <div className="pipeline">
      {agentOrder.map((agent) => {
        const event = latestByAgent[agent.id];
        const status = event?.status ?? "pending";

        return (
          <article key={agent.id} className={`pipeline-step pipeline-step--${status}`}>
            <div className="pipeline-step__rail" />
            <div className="pipeline-step__node" />
            <div className="pipeline-step__body">
              <div className="pipeline-step__header">
                <div>
                  <p>{agent.label}</p>
                  <small>{agent.detail}</small>
                </div>
                <span className="pipeline-step__status">{status}</span>
              </div>
              <p className="pipeline-step__message">
                {event?.message ?? "Waiting for upstream stage"}
              </p>
              {event?.duration_ms ? (
                <small className="pipeline-step__duration">
                  {event.duration_ms} ms
                </small>
              ) : null}
              {event?.result ? (
                <details className="pipeline-step__details">
                  <summary>{summarizeResult(event.result)}</summary>
                  <pre>{JSON.stringify(event.result, null, 2)}</pre>
                </details>
              ) : null}
            </div>
          </article>
        );
      })}
    </div>
  );
}
