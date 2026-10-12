"""Mapbox Geocoding v6 forward search (autocomplete), proxied so the token stays server-side."""

from __future__ import annotations

from django.conf import settings

from core.errors import UpstreamError

from . import cache
from .http import get_json

SERVICE = "Mapbox Geocoding"
TTL_SECONDS = 24 * 3600
MAX_RESULTS = 6


def _check_token() -> str:
    if not settings.MAPBOX_ACCESS_TOKEN:
        raise UpstreamError(SERVICE, "the server has no Mapbox access token configured")
    return settings.MAPBOX_ACCESS_TOKEN


def _to_place(feature: dict) -> dict | None:
    props = feature.get("properties") or {}
    coords = props.get("coordinates") or {}
    lon, lat = coords.get("longitude"), coords.get("latitude")
    if lon is None or lat is None:
        geometry = feature.get("geometry") or {}
        if geometry.get("type") != "Point":
            return None
        lon, lat = geometry["coordinates"][:2]
    name = props.get("name") or props.get("full_address") or ""
    return {
        "id": props.get("mapbox_id") or feature.get("id") or f"{lon},{lat}",
        "name": name,
        "label": props.get("full_address")
        or ", ".join(p for p in (name, props.get("place_formatted")) if p),
        "context": props.get("place_formatted") or "",
        "type": props.get("feature_type") or "",
        "lon": round(float(lon), 6),
        "lat": round(float(lat), 6),
    }


def search(
    query: str, proximity: tuple[float, float] | None = None, country: str | None = None
) -> list[dict]:
    """Forward search. `country`: ISO code(s), "" for worldwide, None for the server default."""
    q = " ".join(query.split())
    prox = f"{proximity[0]:.2f},{proximity[1]:.2f}" if proximity else ""
    country = (settings.GEOCODE_COUNTRY if country is None else country).lower()
    key = cache.make_key("geo", q.lower(), prox, country or "world")
    cached = cache.get(key)
    if cached is not None:
        return cached

    params = {
        "q": q,
        "autocomplete": "true",
        "limit": MAX_RESULTS,
        "language": "en",
        "access_token": _check_token(),
    }
    if country:
        params["country"] = country
    if prox:
        params["proximity"] = prox

    status, body = get_json(SERVICE, f"{settings.MAPBOX_API_URL}/search/geocode/v6/forward", params)
    if status == 401:
        raise UpstreamError(SERVICE, "the Mapbox access token was rejected")
    if status == 429:
        raise UpstreamError(SERVICE, "rate limit reached, please retry shortly")
    if status != 200 or not isinstance(body, dict):
        raise UpstreamError(SERVICE, f"unexpected response (HTTP {status})")

    places = [p for p in (_to_place(f) for f in body.get("features", [])) if p]
    cache.put(key, places, TTL_SECONDS)
    return places
