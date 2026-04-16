"""
FastAPI application — REST API + SSE endpoints for the complaint categorization system.
"""
from __future__ import annotations

import asyncio
import json
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any, Optional

from dotenv import load_dotenv
from fastapi import BackgroundTasks, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sse_starlette.sse import EventSourceResponse

from backend.agents.orchestrator import Orchestrator
from backend.data.sample_complaints import SAMPLE_COMPLAINTS
from backend.database import (
    create_schedule,
    delete_schedule,
    get_all_complaints,
    get_audit_trail,
    get_complaint,
    get_dashboard_stats,
    get_dashboard_trends,
    get_latest_review_decision,
    get_normalization_batch,
    get_normalization_rows,
    get_schedule,
    init_db,
    list_schedule_runs,
    list_schedules,
    save_normalization_batch,
    save_normalization_rows,
    save_review_decision,
    update_schedule_status,
)
from backend.services.cfpb_proxy import proxy_get
from backend.services.normalization import normalize_input
from backend.services.scheduler import SchedulerService, cadence_to_delta

# Load environment variables
load_dotenv()
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _coerce_query_params(request: Request, exclude: set[str] | None = None) -> list[tuple[str, str]]:
    excluded = exclude or set()
    return [(key, value) for key, value in request.query_params.multi_items() if key not in excluded]


def _serialize_datetime(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


def _next_run_at(cadence: str, run_at: str | None = None, active: bool = True) -> str | None:
    if not active:
        return None
    if run_at:
        return run_at
    if cadence == "once":
        return _utc_now().isoformat()
    return (_utc_now() + cadence_to_delta(cadence)).isoformat()


def _flatten_complaint_summary(record: dict[str, Any]) -> dict[str, Any]:
    classification = record.get("classification_result", {}) or {}
    compliance = record.get("compliance_result", {}) or {}
    routing = record.get("routing_result", {}) or {}
    enrichment = record.get("analysis_enrichment", {}) or {}
    criticality = enrichment.get("criticality") or {}
    baseline = enrichment.get("baseline") or {}
    review_gate = enrichment.get("review_gate") or {}
    source_metadata = enrichment.get("source_metadata") or {}
    tags = record.get("tags", []) or []
    vulnerable_tags = [
        tag for tag in tags
        if str(tag).lower() in {"older american", "servicemember"}
    ]

    return {
        "complaint_id": record["complaint_id"],
        "status": record["status"],
        "product": classification.get("product"),
        "issue": classification.get("issue"),
        "severity": classification.get("severity"),
        "risk_level": compliance.get("risk_level"),
        "risk_score": compliance.get("risk_score"),
        "assigned_team": routing.get("assigned_team"),
        "priority": routing.get("priority"),
        "submitted_at": record["submitted_at"],
        "completed_at": record.get("completed_at"),
        "narrative_preview": record["narrative"][:150] + "..." if len(record["narrative"]) > 150 else record["narrative"],
        "channel": record.get("channel", "web"),
        "customer_state": record.get("customer_state"),
        "tags": tags,
        "vulnerable_tags": vulnerable_tags,
        "processing_time_ms": record.get("total_processing_time_ms"),
        "criticality_score": criticality.get("score"),
        "criticality_level": criticality.get("level"),
        "needs_human_review": review_gate.get("needs_human_review", False),
        "review_reason_codes": review_gate.get("review_reason_codes", []),
        "sla_breach_risk": review_gate.get("sla_breach_risk", False),
        "source": source_metadata.get("source", "manual_analysis"),
        "source_label": source_metadata.get("source_label"),
        "baseline_delta": baseline.get("comparison"),
        "latest_review_decision": record.get("latest_review_decision"),
    }


def _queue_matches(summary: dict[str, Any], queue: str | None) -> bool:
    if not queue or queue == "All":
        return True
    if queue == "Needs Human Review":
        return bool(summary.get("needs_human_review"))
    if queue == "High Regulatory Risk":
        return summary.get("risk_level") in {"HIGH", "CRITICAL"}
    if queue == "SLA Breach Risk":
        return bool(summary.get("sla_breach_risk"))
    return queue in (summary.get("review_reason_codes") or [])


def _complaint_matches_filters(
    summary: dict[str, Any],
    *,
    product: str | None = None,
    risk_level: str | None = None,
    customer_state: str | None = None,
    channel: str | None = None,
    tag: str | None = None,
    vulnerable_only: bool = False,
    needs_review: bool | None = None,
    high_risk: bool | None = None,
    sla_risk: bool | None = None,
    source: str | None = None,
) -> bool:
    tags = [str(item).lower() for item in (summary.get("tags") or [])]
    vulnerable_tags = [str(item).lower() for item in (summary.get("vulnerable_tags") or [])]

    if product and summary.get("product") != product:
        return False
    if risk_level and summary.get("risk_level") != risk_level:
        return False
    if customer_state and summary.get("customer_state") != customer_state:
        return False
    if channel and summary.get("channel") != channel:
        return False
    if source and summary.get("source") != source:
        return False
    if tag and tag.lower() not in {*tags, *vulnerable_tags}:
        return False
    if vulnerable_only and not summary.get("vulnerable_tags"):
        return False
    if needs_review is not None and bool(summary.get("needs_human_review")) is not needs_review:
        return False
    if high_risk is not None:
        is_high_risk = summary.get("risk_level") in {"HIGH", "CRITICAL"}
        if is_high_risk is not high_risk:
            return False
    if sla_risk is not None and bool(summary.get("sla_breach_risk")) is not sla_risk:
        return False
    return True


def _build_filter_options(summaries: list[dict[str, Any]]) -> dict[str, list[str]]:
    return {
        "products": sorted({str(item["product"]) for item in summaries if item.get("product")}),
        "risk_levels": sorted({str(item["risk_level"]) for item in summaries if item.get("risk_level")}),
        "states": sorted({str(item["customer_state"]) for item in summaries if item.get("customer_state")}),
        "channels": sorted({str(item["channel"]) for item in summaries if item.get("channel")}),
        "tags": sorted({str(tag) for item in summaries for tag in item.get("tags", []) if tag}),
        "sources": sorted({str(item["source"]) for item in summaries if item.get("source")}),
    }


def _build_supervisor_snapshot(summaries: list[dict[str, Any]], queue_limit: int = 6) -> dict[str, Any]:
    needs_review = sorted(
        [item for item in summaries if item.get("needs_human_review")],
        key=lambda item: (
            -(item.get("criticality_score") or 0),
            -(item.get("risk_score") or 0),
            item.get("submitted_at") or "",
        ),
        reverse=False,
    )
    high_risk = sorted(
        [item for item in summaries if item.get("risk_level") in {"HIGH", "CRITICAL"}],
        key=lambda item: (-(item.get("risk_score") or 0), -(item.get("criticality_score") or 0)),
    )
    sla_risk = sorted(
        [item for item in summaries if item.get("sla_breach_risk")],
        key=lambda item: (-(item.get("criticality_score") or 0), item.get("submitted_at") or ""),
    )

    return {
        "counts": {
            "needs_human_review": len(needs_review),
            "high_regulatory_risk": len(high_risk),
            "sla_breach_risk": len(sla_risk),
            "vulnerable_customer_cases": sum(1 for item in summaries if item.get("vulnerable_tags")),
        },
        "queues": {
            "needs_human_review": needs_review[:queue_limit],
            "high_regulatory_risk": high_risk[:queue_limit],
            "sla_breach_risk": sla_risk[:queue_limit],
        },
    }


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize database and scheduler on startup."""
    init_db()
    scheduler = SchedulerService(orchestrator)
    app.state.scheduler = scheduler
    await scheduler.start()
    try:
        yield
    finally:
        await scheduler.stop()


app = FastAPI(
    title="Complaint Categorization AI",
    description="Agentic AI system for financial complaint classification, risk assessment, and resolution",
    version="1.1.0",
    lifespan=lifespan,
)

# CORS for frontend dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize orchestrator
orchestrator = Orchestrator(api_key=OPENAI_API_KEY)


# ──────────────────────────────────────────────
# Request Models
# ──────────────────────────────────────────────

class AnalyzeRequest(BaseModel):
    narrative: str
    product: Optional[str] = None
    issue: Optional[str] = None
    company: Optional[str] = None
    channel: str = "web"
    customer_state: Optional[str] = None
    customer_id: Optional[str] = None
    date_received: Optional[str] = None
    tags: list[str] = Field(default_factory=list)
    complaint_id: Optional[str] = None
    source: str = "manual_analysis"
    source_label: Optional[str] = None
    normalization: Optional[dict[str, Any]] = None
    normalization_batch_id: Optional[int] = None
    normalization_row_index: Optional[int] = None
    schedule_id: Optional[int] = None
    schedule_run_id: Optional[int] = None


class BatchRequest(BaseModel):
    complaint_ids: list[str] = Field(default_factory=list)
    count: int = 5


class NormalizationRequest(BaseModel):
    mode: str = "heuristic"
    text: Optional[str] = None
    records: list[dict[str, Any]] = Field(default_factory=list)
    source_name: Optional[str] = None


class NormalizationSubmitRequest(NormalizationRequest):
    submit_for_analysis: bool = True


class ScheduleCreateRequest(BaseModel):
    name: str
    mode: str
    cadence: str
    source_type: str
    payload: dict[str, Any] = Field(default_factory=dict)
    status: str = "active"
    run_at: Optional[str] = None


class PauseScheduleRequest(BaseModel):
    paused: bool = True


class ReviewDecisionRequest(BaseModel):
    action: str
    reviewer: Optional[str] = None
    notes: Optional[str] = None


# ──────────────────────────────────────────────
# API Endpoints
# ──────────────────────────────────────────────

@app.get("/api/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy", "service": "complaint-categorization-ai"}


@app.get("/api/complaints/samples")
async def get_samples():
    """Get all sample CFPB complaints."""
    samples = []
    for c in SAMPLE_COMPLAINTS:
        samples.append({
            "id": c["id"],
            "narrative": c["narrative"],
            "narrative_preview": c["narrative"][:150] + "...",
            "product": c.get("product", ""),
            "channel": c.get("channel", "web"),
            "customer_state": c.get("customer_state", ""),
            "tags": c.get("tags", []),
            "date_received": c.get("date_received", ""),
        })
    return {"samples": samples, "total": len(samples)}


@app.post("/api/complaints/analyze")
async def analyze_complaint(request: AnalyzeRequest, background_tasks: BackgroundTasks):
    """
    Submit a complaint for full agent pipeline analysis.
    Returns complaint_id immediately; use SSE endpoint to stream progress.
    """
    if not OPENAI_API_KEY or OPENAI_API_KEY == "your-api-key-here":
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY not configured")

    if not request.narrative.strip():
        raise HTTPException(status_code=400, detail="Complaint narrative is required")

    complaint_id = request.complaint_id or f"CMP-{id(request) % 100000:05d}"
    metadata = {
        "id": complaint_id,
        "product": request.product,
        "issue": request.issue,
        "company": request.company,
        "channel": request.channel,
        "customer_state": request.customer_state,
        "customer_id": request.customer_id,
        "date_received": request.date_received,
        "tags": request.tags,
        "source": request.source,
        "source_label": request.source_label,
        "normalization": request.normalization,
        "normalization_batch_id": request.normalization_batch_id,
        "normalization_row_index": request.normalization_row_index,
        "schedule_id": request.schedule_id,
        "schedule_run_id": request.schedule_run_id,
    }

    background_tasks.add_task(
        orchestrator.process_complaint,
        narrative=request.narrative,
        metadata=metadata,
    )

    return {
        "complaint_id": complaint_id,
        "status": "processing",
        "message": "Complaint submitted for analysis. Use SSE endpoint to stream progress.",
    }


@app.post("/api/complaints/analyze/sync")
async def analyze_complaint_sync(request: AnalyzeRequest):
    """
    Submit a complaint and wait for full analysis (synchronous).
    Use this for direct results without SSE.
    """
    if not OPENAI_API_KEY or OPENAI_API_KEY == "your-api-key-here":
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY not configured")

    if not request.narrative.strip():
        raise HTTPException(status_code=400, detail="Complaint narrative is required")

    complaint_id = request.complaint_id or f"CMP-{id(request) % 100000:05d}"
    metadata = {
        "id": complaint_id,
        "product": request.product,
        "issue": request.issue,
        "company": request.company,
        "channel": request.channel,
        "customer_state": request.customer_state,
        "customer_id": request.customer_id,
        "date_received": request.date_received,
        "tags": request.tags,
        "source": request.source,
        "source_label": request.source_label,
        "normalization": request.normalization,
        "normalization_batch_id": request.normalization_batch_id,
        "normalization_row_index": request.normalization_row_index,
        "schedule_id": request.schedule_id,
        "schedule_run_id": request.schedule_run_id,
    }

    await orchestrator.process_complaint(
        narrative=request.narrative,
        metadata=metadata,
    )

    result = get_complaint(complaint_id)
    if not result:
        raise HTTPException(status_code=500, detail="Analysis completed but result was not found")
    return result


@app.get("/api/complaints/analyze/{complaint_id}/stream")
async def stream_analysis(complaint_id: str):
    """SSE endpoint to stream agent progress for a complaint."""

    async def event_generator():
        last_index = 0
        max_wait = 300  # 5 minutes max
        waited = 0

        while waited < max_wait:
            events = orchestrator.get_events(complaint_id)

            while last_index < len(events):
                event = events[last_index]
                yield {
                    "event": "agent_update",
                    "data": json.dumps(event),
                }
                last_index += 1

                if event.get("agent") == "Orchestrator" and event.get("status") in ("completed", "failed"):
                    full_result = get_complaint(complaint_id)
                    yield {
                        "event": "analysis_complete",
                        "data": json.dumps(full_result if full_result else {"error": "Result not found"}),
                    }
                    orchestrator.cleanup_job(complaint_id)
                    return

            await asyncio.sleep(0.5)
            waited += 0.5

        yield {
            "event": "timeout",
            "data": json.dumps({"message": "Analysis timed out"}),
        }

    return EventSourceResponse(event_generator())


@app.get("/api/complaints")
async def list_complaints(
    limit: int = 50,
    offset: int = 0,
    product: Optional[str] = None,
    risk_level: Optional[str] = None,
    customer_state: Optional[str] = None,
    channel: Optional[str] = None,
    tag: Optional[str] = None,
    vulnerable_only: bool = False,
    needs_review: Optional[bool] = None,
    high_risk: Optional[bool] = None,
    sla_risk: Optional[bool] = None,
    source: Optional[str] = None,
):
    """List all processed complaints with summary data."""
    complaints = get_all_complaints(limit=max(limit + offset, 500), offset=0)
    summaries = [_flatten_complaint_summary(record) for record in complaints]
    filtered = [
        summary for summary in summaries
        if _complaint_matches_filters(
            summary,
            product=product,
            risk_level=risk_level,
            customer_state=customer_state,
            channel=channel,
            tag=tag,
            vulnerable_only=vulnerable_only,
            needs_review=needs_review,
            high_risk=high_risk,
            sla_risk=sla_risk,
            source=source,
        )
    ]
    window = filtered[offset:offset + limit]
    return {
        "complaints": window,
        "total": len(filtered),
        "available_filters": _build_filter_options(summaries),
    }


@app.get("/api/complaints/{complaint_id}")
async def get_complaint_detail(complaint_id: str):
    """Get full analysis for a specific complaint."""
    result = get_complaint(complaint_id)
    if not result:
        raise HTTPException(status_code=404, detail="Complaint not found")
    return result


@app.get("/api/complaints/{complaint_id}/baseline")
async def get_baseline_comparison(complaint_id: str):
    detail = get_complaint(complaint_id)
    if not detail:
        raise HTTPException(status_code=404, detail="Complaint not found")
    return {
        "complaint_id": complaint_id,
        "baseline": detail.get("baseline"),
        "criticality": detail.get("criticality"),
        "review_gate": detail.get("review_gate"),
    }


@app.get("/api/audit/{complaint_id}")
async def get_audit(complaint_id: str):
    """Get full audit trail for a complaint."""
    trail = get_audit_trail(complaint_id)
    if not trail:
        raise HTTPException(status_code=404, detail="No audit trail found")
    return {"complaint_id": complaint_id, "audit_trail": trail}


@app.get("/api/dashboard/stats")
async def dashboard_stats():
    """Get aggregate dashboard statistics."""
    return get_dashboard_stats()


@app.get("/api/dashboard/trends")
async def dashboard_trends(days: int = 14):
    """Get chart-ready complaint trend data."""
    return get_dashboard_trends(limit_days=days)


@app.get("/api/dashboard/supervisor")
async def dashboard_supervisor(limit: int = 6):
    complaints = get_all_complaints(limit=500, offset=0)
    summaries = [_flatten_complaint_summary(record) for record in complaints]
    return _build_supervisor_snapshot(summaries, queue_limit=limit)


@app.post("/api/complaints/batch")
async def batch_process(request: BatchRequest, background_tasks: BackgroundTasks):
    """Batch-process multiple sample complaints."""
    if not OPENAI_API_KEY or OPENAI_API_KEY == "your-api-key-here":
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY not configured")

    if request.complaint_ids:
        samples = [sample for sample in SAMPLE_COMPLAINTS if sample["id"] in request.complaint_ids]
    else:
        samples = SAMPLE_COMPLAINTS[:request.count]

    submitted = []
    for sample in samples:
        metadata = {
            "id": sample["id"],
            "product": sample.get("product"),
            "channel": sample.get("channel", "web"),
            "customer_state": sample.get("customer_state"),
            "tags": sample.get("tags", []),
            "date_received": sample.get("date_received"),
            "source": "synthetic_seed",
            "source_label": "sample_batch",
        }
        background_tasks.add_task(
            orchestrator.process_complaint,
            narrative=sample["narrative"],
            metadata=metadata,
        )
        submitted.append(sample["id"])

    return {
        "submitted": submitted,
        "count": len(submitted),
        "message": f"Submitted {len(submitted)} complaints for processing",
    }


@app.get("/api/cfpb")
async def cfpb_search_compat(request: Request):
    """Compatibility search endpoint for the frontend's historical `/api/cfpb` usage."""
    return await proxy_get("/", _coerce_query_params(request))


@app.get("/api/cfpb/search")
async def cfpb_search(request: Request):
    return await proxy_get("/", _coerce_query_params(request))


@app.get("/api/cfpb/complaints/{complaint_id}")
async def cfpb_detail(complaint_id: str):
    return await proxy_get(f"/{complaint_id}")


@app.get("/api/cfpb/trends")
async def cfpb_trends(request: Request):
    return await proxy_get("/trends", _coerce_query_params(request))


@app.get("/api/cfpb/geo/states")
async def cfpb_geo_states(request: Request):
    return await proxy_get("/geo/states", _coerce_query_params(request))


@app.get("/api/cfpb/suggest")
async def cfpb_suggest(request: Request):
    kind = request.query_params.get("kind", "search")
    if kind == "company":
        path = "/_suggest_company"
    elif kind == "zip":
        path = "/_suggest_zip"
    else:
        path = "/_suggest"
    return await proxy_get(path, _coerce_query_params(request, exclude={"kind"}))


@app.post("/api/normalize/preview")
async def normalization_preview(request: NormalizationRequest):
    result = await normalize_input(
        api_key=OPENAI_API_KEY,
        mode=request.mode,
        text=request.text,
        records=request.records,
    )
    return result


@app.post("/api/normalize/submit")
async def normalization_submit(request: NormalizationSubmitRequest, background_tasks: BackgroundTasks):
    result = await normalize_input(
        api_key=OPENAI_API_KEY,
        mode=request.mode,
        text=request.text,
        records=request.records,
    )
    batch_summary = {
        "mode": request.mode,
        "total_rows": result["total_rows"],
        "high_confidence_rows": result["high_confidence_rows"],
        "needs_review_rows": result["needs_review_rows"],
    }
    batch_id = save_normalization_batch(
        mode=request.mode,
        source_name=request.source_name,
        raw_payload={"text": request.text, "records": request.records},
        summary=batch_summary,
    )
    save_normalization_rows(batch_id, result["rows"])

    submitted_ids: list[str] = []
    if request.submit_for_analysis:
        if not OPENAI_API_KEY or OPENAI_API_KEY == "your-api-key-here":
            raise HTTPException(status_code=500, detail="OPENAI_API_KEY not configured")
        for row in result["rows"]:
            normalized = row.get("normalized", {})
            narrative = str(normalized.get("narrative") or "").strip()
            if not narrative:
                continue
            complaint_id = f"NORM-{batch_id}-{int(row.get('row_index', 0)):03d}"
            submitted_ids.append(complaint_id)
            background_tasks.add_task(
                orchestrator.process_complaint,
                narrative=narrative,
                metadata={
                    "id": complaint_id,
                    "product": normalized.get("product"),
                    "issue": normalized.get("issue"),
                    "company": normalized.get("company"),
                    "channel": normalized.get("channel", "web"),
                    "customer_state": normalized.get("customer_state"),
                    "date_received": normalized.get("date_received"),
                    "tags": normalized.get("tags", []),
                    "source": "normalized_batch",
                    "source_label": request.source_name or f"Normalization batch {batch_id}",
                    "normalization_batch_id": batch_id,
                    "normalization_row_index": row.get("row_index"),
                    "normalization": {
                        "confidence": row.get("confidence"),
                        "missing_fields": row.get("missing_fields", []),
                        "recommendations": row.get("recommendations", []),
                        "used_llm": row.get("used_llm", False),
                    },
                },
            )

    return {
        "batch_id": batch_id,
        "summary": batch_summary,
        "rows": result["rows"],
        "submitted_ids": submitted_ids,
    }


@app.get("/api/normalization/{batch_id}")
async def normalization_batch_detail(batch_id: int):
    batch = get_normalization_batch(batch_id)
    if not batch:
        raise HTTPException(status_code=404, detail="Normalization batch not found")
    return {
        "batch": batch,
        "rows": get_normalization_rows(batch_id),
    }


@app.get("/api/schedules")
async def schedule_list():
    schedules = list_schedules()
    return {
        "schedules": [
            {
                **schedule,
                "runs": list_schedule_runs(int(schedule["id"]))[:5],
            }
            for schedule in schedules
        ],
        "total": len(schedules),
    }


@app.post("/api/schedules")
async def schedule_create(request: ScheduleCreateRequest):
    schedule_id = create_schedule(
        name=request.name,
        mode=request.mode,
        cadence=request.cadence,
        source_type=request.source_type,
        payload=request.payload,
        status=request.status,
        next_run_at=_next_run_at(
            cadence=request.cadence,
            run_at=request.run_at,
            active=request.status == "active",
        ),
    )
    schedule = get_schedule(schedule_id)
    return {"schedule": schedule}


@app.post("/api/schedules/{schedule_id}/run")
async def schedule_run(schedule_id: int, background_tasks: BackgroundTasks):
    scheduler: SchedulerService = app.state.scheduler
    schedule = get_schedule(schedule_id)
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")

    async def execute():
        await scheduler.execute_schedule(schedule_id, triggered_by="manual")

    background_tasks.add_task(execute)
    return {"status": "queued", "schedule_id": schedule_id}


@app.post("/api/schedules/{schedule_id}/pause")
async def schedule_pause(schedule_id: int, request: PauseScheduleRequest):
    schedule = get_schedule(schedule_id)
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")
    update_schedule_status(schedule_id, "paused" if request.paused else "active")
    updated = get_schedule(schedule_id)
    return {"schedule": updated}


@app.delete("/api/schedules/{schedule_id}")
async def schedule_delete(schedule_id: int):
    schedule = get_schedule(schedule_id)
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")
    delete_schedule(schedule_id)
    return {"deleted": True, "schedule_id": schedule_id}


@app.get("/api/schedules/{schedule_id}/runs")
async def schedule_runs(schedule_id: int):
    schedule = get_schedule(schedule_id)
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")
    return {"schedule_id": schedule_id, "runs": list_schedule_runs(schedule_id)}


@app.get("/api/supervisor/queue")
async def supervisor_queue(
    queue: str = "All",
    limit: int = 100,
    offset: int = 0,
):
    complaints = get_all_complaints(limit=limit, offset=offset)
    summaries = [_flatten_complaint_summary(record) for record in complaints]
    filtered = [summary for summary in summaries if _queue_matches(summary, queue)]
    return {
        "queue": queue,
        "complaints": filtered,
        "total": len(filtered),
    }


@app.post("/api/supervisor/review/{complaint_id}")
async def supervisor_review(complaint_id: str, request: ReviewDecisionRequest):
    detail = get_complaint(complaint_id)
    if not detail:
        raise HTTPException(status_code=404, detail="Complaint not found")
    save_review_decision(
        complaint_id=complaint_id,
        action=request.action,
        reviewer=request.reviewer,
        notes=request.notes,
    )
    return {
        "complaint_id": complaint_id,
        "review_decision": get_latest_review_decision(complaint_id),
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)
