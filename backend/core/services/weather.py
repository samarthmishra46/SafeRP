"""Open-Meteo forecast client: batched multi-location requests with per-point caching."""

from __future__ import annotations

import logging
from collections.abc import Iterable
from datetime import UTC, datetime

from django.conf import settings

from core.domain.evaluate import WeatherKey
from core.domain.weather import (
    HourlySeries,
    floor_hour,
    parse_open_meteo_location,
    parse_pirate_weather,
)
from core.errors import UpstreamError

from . import cache
from .http import executor, get_json

logger = logging.getLogger(__name__)

SERVICE = "Open-Meteo"
TTL_SECONDS = 30 * 60
CHUNK_SIZE = 100
PAST_HOURS = 2
HOURLY_VARS = (
    "wind_speed_10m",
    "wind_gusts_10m",
    "wind_direction_10m",
    "rain",
    "showers",
    "snowfall",
    "temperature_2m",
)


def _cache_key(run_hour: datetime, key: WeatherKey) -> str:
    # The run hour stands in for the forecast model run: keys roll over every hour and
    # entries expire after 30 minutes, so data is never more than ~30 minutes stale.
    return cache.make_key(
        "wx",
        settings.WEATHER_PROVIDER,
        run_hour.strftime("%Y%m%d%H"),
        f"{key[0]:.2f}",
        f"{key[1]:.2f}",
    )


def _fetch_chunk(keys: list[WeatherKey]) -> list[HourlySeries]:
    params = {
        "latitude": ",".join(f"{lat:.2f}" for lat, _ in keys),
        "longitude": ",".join(f"{lon:.2f}" for _, lon in keys),
        "hourly": ",".join(HOURLY_VARS),
        "wind_speed_unit": "mph",
        "precipitation_unit": "inch",
        "timezone": "GMT",
        "past_hours": PAST_HOURS,
        "forecast_hours": settings.FORECAST_HORIZON_HOURS + 2,
    }
    url = settings.OPEN_METEO_URL
    if settings.OPEN_METEO_API_KEY:
        # Paid plan: its own quota instead of the free per-IP limits.
        url = settings.OPEN_METEO_CUSTOMER_URL
        params["apikey"] = settings.OPEN_METEO_API_KEY
    status, body = get_json(SERVICE, url, params)
    if status == 429:
        # Open-Meteo says which limit was hit ("Minutely/Hourly/Daily API request limit
        # exceeded..."). The free limits are per IP, and cloud hosts often share outbound IPs.
        reason = body.get("reason") if isinstance(body, dict) else None
        raise UpstreamError(
            SERVICE, f"free-tier limit reached ({reason})" if reason else "free-tier limit reached"
        )
    if status != 200:
        reason = body.get("reason") if isinstance(body, dict) else None
        raise UpstreamError(SERVICE, reason or f"unexpected response (HTTP {status})")
    locations = body if isinstance(body, list) else [body]
    if len(locations) != len(keys):
        raise UpstreamError(SERVICE, "returned a different number of locations than requested")
    try:
        return [parse_open_meteo_location(loc) for loc in locations]
    except (KeyError, IndexError, ValueError) as exc:
        raise UpstreamError(SERVICE, "returned malformed forecast data") from exc


PIRATE_SERVICE = "Pirate Weather"


def _fetch_pirate(key: WeatherKey) -> HourlySeries:
    """One location from Pirate Weather (no batching: every location is one API call)."""
    if not settings.PIRATE_WEATHER_API_KEY:
        raise UpstreamError(PIRATE_SERVICE, "the server has no PIRATE_WEATHER_API_KEY configured")
    lat, lon = key
    # The key goes in a header (Pirate Weather accepts a placeholder in the path), so it never
    # appears in URLs or logs.
    status, body = get_json(
        PIRATE_SERVICE,
        f"{settings.PIRATE_WEATHER_URL}/key/{lat:.2f},{lon:.2f}",
        {
            "units": "us",
            "extend": "hourly",
            "version": "2",
            "exclude": "currently,minutely,daily,alerts",
        },
        headers={"apikey": settings.PIRATE_WEATHER_API_KEY},
    )
    if status in (401, 403):
        raise UpstreamError(
            PIRATE_SERVICE, "the API key was rejected (check PIRATE_WEATHER_API_KEY)"
        )
    if status == 429:
        raise UpstreamError(PIRATE_SERVICE, "the API call quota is used up for now")
    if status != 200 or not isinstance(body, dict):
        message = body.get("message") if isinstance(body, dict) else None
        raise UpstreamError(PIRATE_SERVICE, message or f"unexpected response (HTTP {status})")
    try:
        return parse_pirate_weather(body)
    except (KeyError, IndexError, TypeError, ValueError) as exc:
        raise UpstreamError(PIRATE_SERVICE, "returned malformed forecast data") from exc


def _fetch_missing(missing: list[WeatherKey]) -> list[HourlySeries]:
    if settings.WEATHER_PROVIDER == "pirate-weather":
        return list(executor.map(_fetch_pirate, missing))
    chunks = [missing[i : i + CHUNK_SIZE] for i in range(0, len(missing), CHUNK_SIZE)]
    return [series for chunk in executor.map(_fetch_chunk, chunks) for series in chunk]


def fetch_forecasts(
    keys: Iterable[WeatherKey], now: datetime | None = None
) -> dict[WeatherKey, HourlySeries]:
    """Hourly series for every key (lat, lon rounded to 2 decimals), using the cache first."""
    unique = list(dict.fromkeys(keys))
    run_hour = floor_hour(now or datetime.now(UTC))
    cache_keys = {k: _cache_key(run_hour, k) for k in unique}
    hits = cache.get_many(list(cache_keys.values()))
    result: dict[WeatherKey, HourlySeries] = {}
    missing: list[WeatherKey] = []
    for k in unique:
        series = hits.get(cache_keys[k])
        if series is not None:
            result[k] = series
        else:
            missing.append(k)

    if missing:
        fresh: dict[str, HourlySeries] = {}
        for k, series in zip(missing, _fetch_missing(missing), strict=True):
            result[k] = series
            fresh[cache_keys[k]] = series
        cache.put_many(fresh, TTL_SECONDS)
    logger.info("forecasts: %d cached, %d fetched", len(unique) - len(missing), len(missing))
    return result
