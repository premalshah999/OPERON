"""
Normalization pipeline for sparse / non-granular complaint inputs.
Supports heuristic mapping with optional LLM-assisted cleanup when configured.
"""
from __future__ import annotations

import asyncio
import csv
import io
import json
from typing import Any

import httpx


FIELD_ALIASES = {
    "narrative": ["narrative", "complaint", "complaint_what_happened", "description", "details", "summary", "text"],
    "product": ["product", "raw_product", "category", "line_of_business"],
    "channel": ["channel", "submitted_via", "source_channel", "intake_channel"],
    "customer_state": ["customer_state", "state", "consumer_state"],
    "date_received": ["date_received", "received_at", "created_at", "submitted_at", "date"],
    "tags": ["tags", "flags", "special_tags", "consumer_tags"],
    "issue": ["issue", "problem", "complaint_issue", "sub_issue"],
    "company": ["company", "institution", "bank", "lender"],
}


def _normalize_key(value: str) -> str:
    return value.strip().lower().replace(" ", "_").replace("-", "_")


def _coerce_tags(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [str(v).strip() for v in value if str(v).strip()]
    if isinstance(value, str):
        parts = [part.strip() for part in value.replace("|", ",").split(",")]
        return [part for part in parts if part]
    return [str(value).strip()]


def _compose_narrative(row: dict[str, Any]) -> str:
    issue = row.get("issue") or row.get("sub_issue") or row.get("problem")
    company = row.get("company") or row.get("institution")
    product = row.get("product") or row.get("category")
    details = row.get("details") or row.get("summary") or row.get("description")
    fragments = [fragment for fragment in [issue, details, company, product] if fragment]
    if not fragments:
        return ""
    if details:
        return str(details)
    return ". ".join(str(fragment) for fragment in fragments)


def _pick(row: dict[str, Any], field: str) -> Any:
    normalized = {_normalize_key(key): value for key, value in row.items()}
    for alias in FIELD_ALIASES[field]:
        if alias in normalized and normalized[alias] not in (None, "", []):
            return normalized[alias]
    return None


def _heuristic_normalize_row(row: dict[str, Any], row_index: int) -> dict[str, Any]:
    narrative = _pick(row, "narrative")
    issue = _pick(row, "issue")
    if not narrative:
        narrative = _compose_narrative(row)

    tags = _coerce_tags(_pick(row, "tags"))
    product = _pick(row, "product")
    channel = (_pick(row, "channel") or "web")
    customer_state = _pick(row, "customer_state")
    date_received = _pick(row, "date_received")
    company = _pick(row, "company")

    missing_fields = []
    if not narrative:
        missing_fields.append("narrative")
    if not product:
        missing_fields.append("product")
    if not issue:
        missing_fields.append("issue")

    matched_fields = sum(1 for value in [narrative, product, issue, channel, customer_state, date_received, tags] if value)
    confidence = round(min(0.98, 0.35 + matched_fields * 0.09 - len(missing_fields) * 0.08), 2)
    recommendations = []
    if "narrative" in missing_fields:
        recommendations.append("Add a fuller free-text complaint narrative for stronger evidence extraction.")
    if "product" in missing_fields:
        recommendations.append("Provide a product/category column for more reliable routing.")
    if "issue" in missing_fields:
        recommendations.append("Provide an issue or problem field to reduce ambiguity.")

    return {
        "row_index": row_index,
        "normalized": {
            "narrative": str(narrative or ""),
            "product": str(product or ""),
            "channel": str(channel or "web"),
            "customer_state": str(customer_state or ""),
            "date_received": str(date_received or ""),
            "tags": tags,
            "issue": str(issue or ""),
            "company": str(company or ""),
        },
        "confidence": confidence,
        "missing_fields": missing_fields,
        "recommendations": recommendations,
        "used_llm": False,
        "raw_row": row,
    }


def _strict_schema(schema: dict[str, Any]) -> dict[str, Any]:
    converted = {}
    for key, value in schema.items():
        if key == "properties":
            converted[key] = {name: _strict_schema(prop) for name, prop in value.items()}
        elif key == "items":
            converted[key] = _strict_schema(value)
        else:
            converted[key] = [_strict_schema(item) if isinstance(item, dict) else item for item in value] if isinstance(value, list) else (_strict_schema(value) if isinstance(value, dict) else value)
    if converted.get("type") == "object":
        converted.setdefault("additionalProperties", False)
    return converted


def _llm_normalize_row(api_key: str, row: dict[str, Any]) -> dict[str, Any] | None:
    schema = {
        "type": "object",
        "properties": {
            "narrative": {"type": "string"},
            "product": {"type": "string"},
            "channel": {"type": "string"},
            "customer_state": {"type": "string"},
            "date_received": {"type": "string"},
            "tags": {"type": "array", "items": {"type": "string"}},
            "issue": {"type": "string"},
            "company": {"type": "string"},
            "confidence": {"type": "number"},
            "missing_fields": {"type": "array", "items": {"type": "string"}},
            "recommendations": {"type": "array", "items": {"type": "string"}},
        },
        "required": [
            "narrative",
            "product",
            "channel",
            "customer_state",
            "date_received",
            "tags",
            "issue",
            "company",
            "confidence",
            "missing_fields",
            "recommendations",
        ],
    }

    payload = {
        "model": "gpt-4o-mini-2024-07-18",
        "messages": [
            {
                "role": "system",
                "content": "You normalize messy complaint records into a consistent intake schema. Return valid JSON only.",
            },
            {
                "role": "user",
                "content": "Normalize this complaint row into a structured complaint intake object. Prefer preserving original meaning.\n\n"
                + json.dumps(row, ensure_ascii=False),
            },
        ],
        "response_format": {
            "type": "json_schema",
            "json_schema": {
                "name": "normalized_complaint_row",
                "strict": True,
                "schema": _strict_schema(schema),
            },
        },
    }

    with httpx.Client(base_url="https://api.openai.com/v1/", timeout=45.0, headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}) as client:
        response = client.post("chat/completions", json=payload)
        response.raise_for_status()
        content = response.json()["choices"][0]["message"]["content"]
        if isinstance(content, list):
            content = "".join(part.get("text", "") for part in content if isinstance(part, dict))
        return json.loads(content)


def _parse_rows(text: str | None = None, records: list[dict[str, Any]] | None = None) -> list[dict[str, Any]]:
    if records:
        return records
    text = (text or "").strip()
    if not text:
        return []
    if text.startswith("[") or text.startswith("{"):
        parsed = json.loads(text)
        if isinstance(parsed, list):
            return [row for row in parsed if isinstance(row, dict)]
        if isinstance(parsed, dict):
            for key in ("rows", "records", "items", "data"):
                value = parsed.get(key)
                if isinstance(value, list):
                    return [row for row in value if isinstance(row, dict)]
            return [parsed]
    reader = csv.DictReader(io.StringIO(text))
    return [dict(row) for row in reader]


async def normalize_input(
    *,
    api_key: str,
    mode: str,
    text: str | None = None,
    records: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    rows = _parse_rows(text=text, records=records)
    normalized_rows = []
    llm_mode = mode == "llm_assisted" and bool(api_key)

    for idx, row in enumerate(rows):
        normalized = _heuristic_normalize_row(row, idx)
        if llm_mode and normalized["confidence"] < 0.82:
            try:
                llm_result = await asyncio.to_thread(_llm_normalize_row, api_key, row)
                if llm_result:
                    normalized["normalized"] = {
                        "narrative": llm_result.get("narrative", normalized["normalized"]["narrative"]),
                        "product": llm_result.get("product", normalized["normalized"]["product"]),
                        "channel": llm_result.get("channel", normalized["normalized"]["channel"]),
                        "customer_state": llm_result.get("customer_state", normalized["normalized"]["customer_state"]),
                        "date_received": llm_result.get("date_received", normalized["normalized"]["date_received"]),
                        "tags": llm_result.get("tags", normalized["normalized"]["tags"]),
                        "issue": llm_result.get("issue", normalized["normalized"]["issue"]),
                        "company": llm_result.get("company", normalized["normalized"]["company"]),
                    }
                    normalized["confidence"] = round(float(llm_result.get("confidence") or normalized["confidence"]), 2)
                    normalized["missing_fields"] = llm_result.get("missing_fields", normalized["missing_fields"])
                    normalized["recommendations"] = llm_result.get("recommendations", normalized["recommendations"])
                    normalized["used_llm"] = True
            except Exception:
                pass
        normalized_rows.append(normalized)

    high_conf = sum(1 for row in normalized_rows if row["confidence"] >= 0.85)
    return {
        "mode": mode,
        "rows": normalized_rows,
        "total_rows": len(normalized_rows),
        "high_confidence_rows": high_conf,
        "needs_review_rows": len(normalized_rows) - high_conf,
    }

