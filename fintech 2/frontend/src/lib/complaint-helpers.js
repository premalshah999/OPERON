export function prettyLabel(value) {
  if (!value) {
    return "Unknown";
  }

  return String(value)
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

export function formatHours(value) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "N/A";
  }
  if (value < 1) {
    return `${Math.round(value * 60)}m`;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)}h`;
}

export function formatPercent(value) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "N/A";
  }
  return `${Math.round(value * 100)}%`;
}

export function buildBaselineWorkflow(analysis) {
  const complaint = analysis?.complaint ?? {};
  const classification = analysis?.classification ?? {};
  const compliance = analysis?.compliance_risk ?? {};
  const tags = complaint.tags ?? [];
  const channel = complaint.channel ?? "web";
  const issue = `${classification.issue ?? ""} ${classification.sub_issue ?? ""}`.toLowerCase();
  const product = (classification.product ?? complaint.product ?? "").toLowerCase();
  const severity = classification.severity ?? "LOW";
  const riskScore = compliance.risk_score ?? 0;

  let assignedTeam = "Digital Banking Support Team";
  const reasons = [];

  if (channel === "cfpb") {
    assignedTeam = "Executive Response Team";
    reasons.push("CFPB-originated cases get executive handling by default.");
  } else if (riskScore >= 76 || compliance.requires_escalation) {
    assignedTeam = "Legal & Compliance Team";
    reasons.push("Critical regulatory exposure routes directly to compliance leadership.");
  } else if (issue.includes("fraud") || issue.includes("unauthorized")) {
    assignedTeam = "Fraud Investigation Team";
    reasons.push("Fraud and unauthorized activity follow the fraud investigation playbook.");
  } else if (product.includes("credit card")) {
    assignedTeam = "Credit Card Disputes Team";
    reasons.push("Credit card complaints default into the card dispute queue.");
  } else if (product.includes("loan") || product.includes("mortgage")) {
    assignedTeam = product.includes("mortgage")
      ? "Mortgage Servicing Team"
      : "Lending Operations Team";
    reasons.push("Loan and mortgage cases stay with lending specialists.");
  } else if (product.includes("debt")) {
    assignedTeam = "Debt Collection Compliance Team";
    reasons.push("Debt collection issues follow the compliance-led collection workflow.");
  }

  if (tags.some((tag) => /older|elder|servicemember|military|veteran/i.test(tag))) {
    reasons.push("Protected customer tags force a manual escalation checkpoint.");
  }

  let priority = "P4_LOW";
  if (riskScore >= 76 || severity === "CRITICAL") {
    priority = "P1_IMMEDIATE";
  } else if (riskScore >= 51 || severity === "HIGH") {
    priority = "P2_HIGH";
  } else if (severity === "MEDIUM") {
    priority = "P3_MEDIUM";
  }

  const assignedTier = priority === "P1_IMMEDIATE"
    ? "Legal"
    : priority === "P2_HIGH"
      ? "Manager"
      : priority === "P3_MEDIUM"
        ? "Senior"
        : "Junior";

  const slaHours = {
    P1_IMMEDIATE: 4,
    P2_HIGH: 24,
    P3_MEDIUM: 48,
    P4_LOW: 72,
  }[priority];

  const requiresHumanReview = assignedTier !== "Junior" || riskScore >= 51;

  return {
    assignedTeam,
    assignedTier,
    priority,
    slaHours,
    requiresHumanReview,
    reasons,
  };
}

export function compareRoutingToBaseline(analysis) {
  const baseline = buildBaselineWorkflow(analysis);
  const routing = analysis?.routing ?? {};

  return {
    baseline,
    comparisons: [
      {
        label: "Team",
        ai: routing.assigned_team ?? "Pending",
        baseline: baseline.assignedTeam,
      },
      {
        label: "Tier",
        ai: routing.assigned_tier ?? "Pending",
        baseline: baseline.assignedTier,
      },
      {
        label: "Priority",
        ai: prettyLabel(routing.priority ?? "pending"),
        baseline: prettyLabel(baseline.priority),
      },
      {
        label: "SLA",
        ai: routing.sla_hours ? `${routing.sla_hours}h` : "Pending",
        baseline: `${baseline.slaHours}h`,
      },
      {
        label: "Human Review",
        ai: routing.requires_immediate_attention ? "Yes" : "No",
        baseline: baseline.requiresHumanReview ? "Yes" : "No",
      },
    ].map((row) => ({ ...row, match: row.ai === row.baseline })),
  };
}
