"""
Deterministic support engines that enrich the LLM pipeline with:
- baseline workflow comparison
- criticality scoring
- structured evidence mapping
- supervisor review gating
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any


LEVEL_ORDER = {"LOW": 0, "MEDIUM": 1, "HIGH": 2, "CRITICAL": 3}


TEAM_BY_PRODUCT = {
    "credit card": "Credit Card Disputes Team",
    "prepaid": "Credit Card Operations Team",
    "mortgage": "Mortgage Servicing Team",
    "debt": "Debt Collection Compliance Team",
    "student": "Lending Operations Team",
    "vehicle": "Lending Operations Team",
    "loan": "Lending Operations Team",
    "checking": "Digital Banking Support Team",
    "savings": "Digital Banking Support Team",
    "bank": "Digital Banking Support Team",
    "credit reporting": "Legal & Compliance Team",
    "money transfer": "Digital Banking Support Team",
}


@dataclass
class EvidenceMatch:
    quote: str
    start: int
    end: int
    label: str
    source: str


def _safe_text(value: Any) -> str:
    return str(value or "").strip()


def _lower(value: Any) -> str:
    return _safe_text(value).lower()


def _find_span(text: str, snippet: str) -> tuple[int, int]:
    if not text or not snippet:
        return (-1, -1)
    idx = text.lower().find(snippet.lower())
    if idx == -1:
        return (-1, -1)
    return (idx, idx + len(snippet))


def _split_sentences(text: str) -> list[str]:
    if not text.strip():
        return []
    raw = text.replace("\n", " ").split(".")
    sentences = []
    for part in raw:
        cleaned = part.strip(" ;:-")
        if cleaned:
            sentences.append(cleaned + ".")
    return sentences


def _sentence_matches(text: str, keywords: list[str], limit: int = 2, source: str = "heuristic", label: str = "") -> list[dict]:
    sentences = _split_sentences(text)
    matches: list[dict] = []
    lowered_keywords = [k.lower() for k in keywords if k]
    for sentence in sentences:
        lowered = sentence.lower()
        if any(keyword in lowered for keyword in lowered_keywords):
            start, end = _find_span(text, sentence.rstrip("."))
            matches.append({
                "quote": sentence,
                "start": start,
                "end": end,
                "label": label or (keywords[0] if keywords else "evidence"),
                "source": source,
            })
        if len(matches) >= limit:
            break
    return matches


def _contains_any(text: str, keywords: list[str]) -> bool:
    lowered = text.lower()
    return any(keyword.lower() in lowered for keyword in keywords)


def _level_from_score(score: int) -> str:
    if score >= 76:
        return "CRITICAL"
    if score >= 56:
        return "HIGH"
    if score >= 35:
        return "MEDIUM"
    return "LOW"


def _priority_from_score(score: int) -> tuple[str, int]:
    if score >= 76:
        return ("P1_IMMEDIATE", 4)
    if score >= 56:
        return ("P2_HIGH", 24)
    if score >= 35:
        return ("P3_MEDIUM", 48)
    return ("P4_LOW", 72)


def _tier_from_score(score: int) -> str:
    if score >= 76:
        return "Legal"
    if score >= 56:
        return "Manager"
    if score >= 35:
        return "Senior"
    return "Junior"


def _team_for_product(product: str, narrative: str, channel: str) -> str:
    lowered_product = product.lower()
    narrative_lower = narrative.lower()
    if any(word in narrative_lower for word in ["fraud", "identity theft", "unauthorized", "account takeover"]):
        return "Fraud Investigation Team"
    if channel in {"cfpb", "referral"}:
        return "Executive Response Team"
    for key, team in TEAM_BY_PRODUCT.items():
        if key in lowered_product:
            return team
    return "Customer Retention Team"


def build_baseline(
    narrative: str,
    classification: dict | None,
    compliance: dict | None,
    metadata: dict | None,
) -> dict:
    narrative = _safe_text(narrative)
    classification = classification or {}
    compliance = compliance or {}
    metadata = metadata or {}

    product = _safe_text(classification.get("product") or metadata.get("product") or "Unknown")
    channel = _lower(metadata.get("channel") or "web")
    tags = [str(tag) for tag in (metadata.get("tags") or [])]

    score = 18
    factors: list[dict] = []

    def add(points: int, code: str, reason: str):
        nonlocal score
        score += points
        factors.append({"code": code, "points": points, "reason": reason})

    if _contains_any(narrative, ["fraud", "unauthorized", "identity theft", "account takeover"]):
        add(24, "fraud_signal", "Narrative indicates possible fraud or unauthorized activity.")
    if _contains_any(narrative, ["foreclosure", "eviction", "can't access funds", "can not access funds", "could not access funds"]):
        add(22, "customer_harm", "Narrative indicates acute access-to-funds or housing harm.")
    if _contains_any(narrative, ["lawyer", "attorney general", "cfpb", "regulator", "lawsuit", "sue"]):
        add(18, "regulatory_escalation", "Narrative references regulatory or legal escalation.")
    if _contains_any(narrative, ["45 days", "30 days", "weeks ago", "still unresolved", "no response", "nobody contacted me"]):
        add(16, "timeliness", "Narrative suggests missed SLA or prolonged unresolved handling.")
    if _contains_any(narrative, ["elderly", "78-year-old", "retiree", "social security", "servicemember", "military"]):
        add(14, "vulnerable_customer", "Narrative suggests vulnerable-customer protections may apply.")
    if channel in {"cfpb", "referral"}:
        add(10, "executive_channel", "Complaint arrived through a regulator or referral-style channel.")
    if any(tag.lower() in {"older american", "servicemember"} for tag in tags):
        add(12, "tag_escalation", "Complaint carries vulnerable-customer tags.")
    if "mortgage" in product.lower() or "debt" in product.lower():
        add(6, "product_risk", "Product category carries heightened operational exposure.")

    score = max(0, min(100, score))
    level = _level_from_score(score)
    priority, sla_hours = _priority_from_score(score)
    assigned_team = _team_for_product(product, narrative, channel)
    assigned_tier = _tier_from_score(score)
    review_outcome = "HUMAN_REVIEW" if score >= 56 or any(tag.lower() in {"older american", "servicemember"} for tag in tags) else "AUTO_CLEAR"

    because_parts = [
        f"product={product}",
        f"priority={priority}",
        f"team={assigned_team}",
    ]
    if factors:
        because_parts.append(factors[0]["reason"])

    return {
        "severity": level,
        "risk_level": level,
        "risk_score": score,
        "assigned_team": assigned_team,
        "assigned_tier": assigned_tier,
        "priority": priority,
        "sla_hours": sla_hours,
        "review_outcome": review_outcome,
        "factors": factors,
        "reasoning": "Rules-only baseline selected this outcome because " + "; ".join(because_parts) + ".",
    }


def build_evidence_map(
    narrative: str,
    classification: dict | None,
    compliance: dict | None,
    routing: dict | None,
    metadata: dict | None,
) -> dict:
    narrative = _safe_text(narrative)
    classification = classification or {}
    compliance = compliance or {}
    routing = routing or {}
    metadata = metadata or {}

    severity_keywords = [
        classification.get("severity", ""),
        classification.get("urgency", ""),
        "unauthorized",
        "dispute",
        "fees",
        "late",
        "foreclosure",
        "fraud",
        "chargeback",
    ]
    routing_keywords = [
        classification.get("product", ""),
        classification.get("issue", ""),
        routing.get("assigned_team", ""),
        metadata.get("channel", ""),
    ]

    severity_refs = _sentence_matches(narrative, [kw for kw in severity_keywords if kw], label="severity")
    compliance_refs = []
    for flag in compliance.get("flags", []) or []:
        quote = _safe_text(flag.get("evidence_quote"))
        if quote:
            start, end = _find_span(narrative, quote)
            compliance_refs.append({
                "quote": quote,
                "start": start,
                "end": end,
                "label": flag.get("regulation", "compliance"),
                "source": "compliance_flag",
            })
    routing_refs = _sentence_matches(narrative, [kw for kw in routing_keywords if kw], label="routing")

    if not severity_refs:
        severity_refs = _sentence_matches(narrative, ["complaint", "issue", "problem"], limit=1, label="severity_fallback")
    if not routing_refs:
        routing_refs = _sentence_matches(narrative, ["account", "payment", "charge", "loan"], limit=1, label="routing_fallback")

    return {
        "severity": severity_refs,
        "compliance": compliance_refs,
        "routing": routing_refs,
        "review": [],
        "narrative_length": len(narrative),
    }


def build_baseline_delta(
    baseline: dict | None,
    classification: dict | None,
    compliance: dict | None,
    routing: dict | None,
) -> dict:
    baseline = baseline or {}
    classification = classification or {}
    compliance = compliance or {}
    routing = routing or {}

    changed_fields: list[str] = []
    if baseline.get("severity") != classification.get("severity"):
        changed_fields.append("severity")
    if baseline.get("risk_level") != compliance.get("risk_level"):
        changed_fields.append("risk_level")
    if baseline.get("assigned_team") != routing.get("assigned_team"):
        changed_fields.append("assigned_team")
    if baseline.get("priority") != routing.get("priority"):
        changed_fields.append("priority")
    if baseline.get("sla_hours") != routing.get("sla_hours"):
        changed_fields.append("sla_hours")

    risk_delta = abs(int(baseline.get("risk_score") or 0) - int(compliance.get("risk_score") or 0))
    divergence_score = len(changed_fields) + (1 if risk_delta >= 15 else 0)

    return {
        "changed_fields": changed_fields,
        "risk_score_delta": risk_delta,
        "routing_changed": "assigned_team" in changed_fields or "priority" in changed_fields,
        "severity_changed": "severity" in changed_fields or "risk_level" in changed_fields,
        "sla_changed": "sla_hours" in changed_fields,
        "divergence_score": divergence_score,
    }


def build_criticality(
    narrative: str,
    compliance: dict | None,
    routing: dict | None,
    metadata: dict | None,
    baseline_delta: dict | None,
) -> dict:
    narrative = _safe_text(narrative)
    compliance = compliance or {}
    routing = routing or {}
    metadata = metadata or {}
    baseline_delta = baseline_delta or {}
    tags = [str(tag).lower() for tag in (metadata.get("tags") or [])]

    regulatory = round((int(compliance.get("risk_score") or 0)) * 0.35)

    harm_points = 10
    if _contains_any(narrative, ["foreclosure", "eviction", "rent", "can't pay", "cannot pay", "funds", "stolen", "fraud"]):
        harm_points += 20
    if _contains_any(narrative, ["$","dollar", "charged", "fee", "interest", "late fee"]):
        harm_points += 10
    harm_points = min(harm_points, 25)

    timeliness = 6
    if int(routing.get("sla_hours") or 72) <= 24:
        timeliness += 10
    if _contains_any(narrative, ["weeks ago", "45 days", "30 days", "no response", "still unresolved"]):
        timeliness += 10
    timeliness = min(timeliness, 20)

    vulnerable = 0
    if any(tag in {"older american", "servicemember"} for tag in tags):
        vulnerable = 12
    elif _contains_any(narrative, ["retiree", "social security", "military", "servicemember", "fixed income"]):
        vulnerable = 10

    unresolved = 0
    if compliance.get("requires_escalation"):
        unresolved += 8
    if _contains_any(narrative, ["still unresolved", "nobody called", "no one contacted", "refused", "dispute"]):
        unresolved += 8
    unresolved = min(unresolved, 16)

    pattern = min(12, int(baseline_delta.get("divergence_score") or 0) * 4)
    total = max(0, min(100, regulatory + harm_points + timeliness + vulnerable + unresolved + pattern))
    level = _level_from_score(total)
    components = [
        {"code": "regulatory_risk", "label": "Regulatory risk", "score": regulatory, "reason": f"Derived from compliance risk {compliance.get('risk_score', 0)}/100."},
        {"code": "customer_harm", "label": "Customer harm", "score": harm_points, "reason": "Narrative indicates potential consumer harm or monetary impact."},
        {"code": "timeliness_exposure", "label": "Timeliness/SLA exposure", "score": timeliness, "reason": "Derived from urgency signals and target SLA."},
        {"code": "vulnerable_customer", "label": "Vulnerable customer", "score": vulnerable, "reason": "Derived from tags and narrative protections."},
        {"code": "unresolved_signal", "label": "Unresolved/disputed", "score": unresolved, "reason": "Complaint appears unresolved or escalatory."},
        {"code": "pattern_signal", "label": "Pattern divergence", "score": pattern, "reason": "AI-vs-baseline divergence may indicate non-routine handling."},
    ]
    return {
        "score": total,
        "level": level,
        "components": components,
        "sla_breach_risk": timeliness >= 12 or int(routing.get("sla_hours") or 72) <= 24,
        "reasoning": f"Operational criticality is {level} because the complaint combines regulatory exposure, harm signals, and urgency cues.",
    }


def build_review_gate(
    classification: dict | None,
    compliance: dict | None,
    qa: dict | None,
    baseline_delta: dict | None,
    evidence_map: dict | None,
    normalization: dict | None,
    criticality: dict | None,
) -> dict:
    classification = classification or {}
    compliance = compliance or {}
    qa = qa or {}
    baseline_delta = baseline_delta or {}
    evidence_map = evidence_map or {}
    normalization = normalization or {}
    criticality = criticality or {}

    reasons: list[str] = []

    if qa and not qa.get("passed", True):
        reasons.append("QA_FAILED")
    if float(classification.get("confidence") or 0) < 0.78:
        reasons.append("LOW_CLASSIFICATION_CONFIDENCE")
    if compliance.get("risk_level") == "CRITICAL":
        reasons.append("CRITICAL_REGULATORY_RISK")

    severity_evidence = evidence_map.get("severity", [])
    compliance_evidence = evidence_map.get("compliance", [])
    routing_evidence = evidence_map.get("routing", [])
    if not severity_evidence or not compliance_evidence or not routing_evidence:
        reasons.append("WEAK_EVIDENCE_SUPPORT")

    if normalization and float(normalization.get("confidence") or 1) < 0.8:
        reasons.append("NORMALIZATION_UNCERTAINTY")
    if int(baseline_delta.get("divergence_score") or 0) >= 2:
        reasons.append("BASELINE_DIVERGENCE")

    queues: list[str] = []
    if reasons:
        queues.append("Needs Human Review")
    if compliance.get("risk_level") in {"CRITICAL", "HIGH"}:
        queues.append("High Regulatory Risk")
    if criticality.get("sla_breach_risk"):
        queues.append("SLA Breach Risk")

    needs_review = bool(reasons)
    return {
        "needs_human_review": needs_review,
        "review_reason_codes": reasons,
        "queues": queues,
        "sla_breach_risk": bool(criticality.get("sla_breach_risk")),
        "status": "pending" if needs_review else "not_required",
        "because": "Supervisor review required because " + ", ".join(reasons).replace("_", " ").lower() + "." if reasons else "No supervisor review required.",
    }


def attach_review_evidence(narrative: str, evidence_map: dict, review_gate: dict) -> dict:
    if not review_gate.get("review_reason_codes"):
        return evidence_map
    review_refs: list[dict] = []
    keywords = []
    joined = " ".join(review_gate.get("review_reason_codes", []))
    if "LOW_CLASSIFICATION_CONFIDENCE" in joined:
        keywords.extend(["unclear", "not sure", "maybe", "confusing"])
    if "CRITICAL_REGULATORY_RISK" in joined:
        keywords.extend(["law", "regulation", "cfpb", "fraud", "unauthorized"])
    if "WEAK_EVIDENCE_SUPPORT" in joined:
        keywords.extend(["issue", "problem", "complaint"])
    if "NORMALIZATION_UNCERTAINTY" in joined:
        keywords.extend(["unknown", "n/a", "missing"])
    review_refs.extend(_sentence_matches(narrative, keywords or ["issue", "complaint"], label="review"))
    evidence_map["review"] = review_refs
    return evidence_map

