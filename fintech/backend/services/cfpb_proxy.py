"""
Lightweight proxy for the official CFPB complaint API with small in-memory caching.
"""
from __future__ import annotations

import os
import time
from typing import Any

import httpx


BASE_URL = "https://www.consumerfinance.gov/data-research/consumer-complaints/search/api/v1"
TTL_SECONDS = int(os.getenv("CFPB_CACHE_TTL_SECONDS", "120"))
_CACHE: dict[str, tuple[float, dict[str, Any]]] = {}


def _cache_key(path: str, params: list[tuple[str, str]]) -> str:
    return f"{path}?{'&'.join(f'{k}={v}' for k, v in sorted(params))}"


async def proxy_get(path: str, params: list[tuple[str, str]] | None = None) -> dict[str, Any]:
    params = params or []
    key = _cache_key(path, params)
    now = time.time()
    cached = _CACHE.get(key)
    if cached and now - cached[0] < TTL_SECONDS:
        data = dict(cached[1])
        data.setdefault("_proxy_meta", {})
        data["_proxy_meta"].update({"cached": True, "path": path, "fetched_at": cached[0]})
        return data

    async with httpx.AsyncClient(timeout=25.0, headers={"User-Agent": "SentinelAI/1.0"}) as client:
        response = await client.get(f"{BASE_URL}{path}", params=params)
        response.raise_for_status()
        data = response.json()

    data.setdefault("_proxy_meta", {})
    data["_proxy_meta"].update({"cached": False, "path": path, "fetched_at": now})
    _CACHE[key] = (now, data)
    return data

