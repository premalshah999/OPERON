"""
Small persistent scheduler for batch and live demo jobs.
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
from typing import Any

from backend.database import (
    complete_schedule_run,
    create_schedule_run,
    get_due_schedules,
    get_normalization_rows,
    get_schedule,
    list_schedule_runs,
    list_schedules,
    touch_schedule_after_run,
)
from backend.data.sample_complaints import SAMPLE_COMPLAINTS
from backend.services.cfpb_proxy import proxy_get


UTC = timezone.utc


def _now() -> datetime:
    return datetime.now(UTC)


def cadence_to_delta(cadence: str) -> timedelta:
    mapping = {
        "once": timedelta(0),
        "hourly": timedelta(hours=1),
        "daily": timedelta(days=1),
        "weekly": timedelta(days=7),
        "monthly": timedelta(days=30),
        "live_1m": timedelta(minutes=1),
        "live_5m": timedelta(minutes=5),
        "live_15m": timedelta(minutes=15),
        "live_60m": timedelta(minutes=60),
    }
    return mapping.get(cadence, timedelta(hours=1))


class SchedulerService:
    def __init__(self, orchestrator):
        self.orchestrator = orchestrator
        self._task: asyncio.Task | None = None
        self._stopped = asyncio.Event()

    async def start(self):
        if self._task and not self._task.done():
            return
        self._stopped.clear()
        self._task = asyncio.create_task(self._loop())

    async def stop(self):
        self._stopped.set()
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass

    async def _loop(self):
        while not self._stopped.is_set():
            due = get_due_schedules(_now().isoformat())
            for schedule in due:
                await self.execute_schedule(schedule["id"], triggered_by="scheduler")
            await asyncio.sleep(30)

    async def execute_schedule(self, schedule_id: int, triggered_by: str = "manual") -> int:
        schedule = get_schedule(schedule_id)
        if not schedule:
            raise ValueError("Schedule not found")

        run_id = create_schedule_run(schedule_id=schedule_id, mode=schedule["mode"], triggered_by=triggered_by)
        summary: dict[str, Any] = {"mode": schedule["mode"], "source_type": schedule["source_type"], "schedule_name": schedule["name"]}
        processed = 0

        try:
            payload = schedule.get("payload") or {}

            if schedule["mode"] == "batch":
                if schedule["source_type"] == "samples":
                    sample_ids = payload.get("complaint_ids") or []
                    count = int(payload.get("count") or 5)
                    samples = [sample for sample in SAMPLE_COMPLAINTS if not sample_ids or sample["id"] in sample_ids][:count]
                    for sample in samples:
                        await self.orchestrator.process_complaint(
                            narrative=sample["narrative"],
                            metadata={
                                "id": sample["id"],
                                "product": sample.get("product"),
                                "channel": sample.get("channel", "web"),
                                "customer_state": sample.get("customer_state"),
                                "date_received": sample.get("date_received"),
                                "tags": sample.get("tags", []),
                                "source": "synthetic_seed",
                                "source_label": schedule["name"],
                                "schedule_id": schedule_id,
                                "schedule_run_id": run_id,
                            },
                        )
                    processed = len(samples)
                    summary["submitted_ids"] = [sample["id"] for sample in samples]
                elif schedule["source_type"] == "normalization_batch":
                    batch_id = int(payload.get("normalization_batch_id") or 0)
                    rows = get_normalization_rows(batch_id)
                    for row in rows:
                        normalized = row.get("normalized_payload") or {}
                        await self.orchestrator.process_complaint(
                            narrative=normalized.get("narrative", ""),
                            metadata={
                                "product": normalized.get("product"),
                                "channel": normalized.get("channel", "web"),
                                "customer_state": normalized.get("customer_state"),
                                "date_received": normalized.get("date_received"),
                                "tags": normalized.get("tags", []),
                                "source": "normalized_batch",
                                "source_label": schedule["name"],
                                "schedule_id": schedule_id,
                                "schedule_run_id": run_id,
                                "normalization_batch_id": batch_id,
                                "normalization_row_index": row.get("row_index"),
                            },
                        )
                    processed = len(rows)
                    summary["normalization_batch_id"] = batch_id
                else:
                    filters = payload.get("filters") or {}
                    latest = await proxy_get("/", [(key, str(value)) for key, value in filters.items()] + [("size", str(payload.get("size") or 25)), ("sort", "created_date_desc")])
                    processed = len(latest.get("hits", {}).get("hits", []))
                    summary["fetched"] = processed
            else:
                filters = payload.get("filters") or {}
                latest = await proxy_get("/", [(key, str(value)) for key, value in filters.items()] + [("size", str(payload.get("size") or 50)), ("sort", "created_date_desc")])
                hits = latest.get("hits", {}).get("hits", [])
                processed = len(hits)
                critical = sum(1 for hit in hits if (hit.get("_source", {}).get("timely") != "Yes") or (hit.get("_source", {}).get("consumer_disputed") == "Yes"))
                summary["fetched"] = processed
                summary["critical"] = critical
                summary["live_filters"] = filters

            complete_schedule_run(run_id, "completed", summary, processed)
            touch_schedule_after_run(schedule_id, _next_run_iso(schedule["cadence"], schedule.get("status", "active") == "active"), processed)
            return run_id
        except Exception as exc:
            complete_schedule_run(run_id, "failed", {"error": str(exc), **summary}, processed)
            touch_schedule_after_run(schedule_id, _next_run_iso(schedule["cadence"], schedule.get("status", "active") == "active"), processed)
            raise


def _next_run_iso(cadence: str, active: bool) -> str | None:
    if not active or cadence == "once":
        return None
    return (_now() + cadence_to_delta(cadence)).isoformat()
