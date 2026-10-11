"""Cache helpers that never let a cache outage break a request."""

from __future__ import annotations

import hashlib
import logging
import re
from typing import Any

from django.core.cache import cache

logger = logging.getLogger(__name__)
_SAFE = re.compile(r"[A-Za-z0-9_.,:|-]*")


def make_key(prefix: str, *parts: Any) -> str:
    raw = "|".join(str(p) for p in parts)
    if len(raw) > 120 or not _SAFE.fullmatch(raw):
        raw = hashlib.sha1(raw.encode()).hexdigest()
    return f"{prefix}:{raw}"


def get(key: str) -> Any:
    try:
        return cache.get(key)
    except Exception:
        logger.warning("cache get failed", exc_info=True)
        return None


def put(key: str, value: Any, ttl: int) -> None:
    try:
        cache.set(key, value, ttl)
    except Exception:
        logger.warning("cache set failed", exc_info=True)


def get_many(keys: list[str]) -> dict[str, Any]:
    try:
        return cache.get_many(keys)
    except Exception:
        logger.warning("cache get_many failed", exc_info=True)
        return {}


def put_many(values: dict[str, Any], ttl: int) -> None:
    try:
        cache.set_many(values, ttl)
    except Exception:
        logger.warning("cache set_many failed", exc_info=True)
