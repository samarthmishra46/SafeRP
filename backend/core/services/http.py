"""Shared HTTP session: connection pooling, timeouts, one retry with backoff."""

from __future__ import annotations

import logging
import socket
from concurrent.futures import ThreadPoolExecutor

import requests
from django.conf import settings
from requests.adapters import HTTPAdapter
from urllib3.util import connection as urllib3_connection
from urllib3.util.retry import Retry

from core.errors import UpstreamError

logger = logging.getLogger(__name__)


if settings.HTTP_FORCE_IPV4:
    # Some networks time out on AAAA lookups (15 s per new connection); resolve IPv4 only.
    urllib3_connection.allowed_gai_family = lambda: socket.AF_INET


def _make_session() -> requests.Session:
    retry = Retry(
        total=1,
        connect=1,
        read=1,
        status=1,
        backoff_factor=0.6,
        status_forcelist=(500, 502, 503, 504),
        allowed_methods=frozenset({"GET"}),
        raise_on_status=False,
    )
    adapter = HTTPAdapter(max_retries=retry, pool_connections=8, pool_maxsize=32)
    session = requests.Session()
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    session.headers["User-Agent"] = "SafeRP/1.0 (truck route weather planner)"
    return session


session = _make_session()

# Shared pool for fanning out upstream calls; threads are cheap and calls are I/O bound.
executor = ThreadPoolExecutor(max_workers=settings.UPSTREAM_WORKERS, thread_name_prefix="upstream")


def get_json(service: str, url: str, params: dict) -> tuple[int, dict | list]:
    """GET and decode JSON. Network failures become UpstreamError; HTTP errors are returned."""
    try:
        response = session.get(url, params=params, timeout=settings.HTTP_TIMEOUT_SECONDS)
    except requests.Timeout as exc:
        raise UpstreamError(service, "the request timed out") from exc
    except requests.RequestException as exc:
        # Never echo the URL: it may carry an access token.
        logger.warning("%s request failed: %s", service, type(exc).__name__)
        raise UpstreamError(service, "the service could not be reached") from exc
    try:
        return response.status_code, response.json()
    except ValueError as exc:
        raise UpstreamError(service, f"unexpected response (HTTP {response.status_code})") from exc
