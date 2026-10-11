"""Open-Meteo forecast client: batched multi-location requests with per-point caching."""

from __future__ import annotations

import logging
from collections.abc import Iterable
from datetime import UTC, datetime

from django.conf import settings

from core.domain.evaluate import WeatherKey
from core.domain.weather import HourlySeries, floor_hour, parse_open_meteo_location
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
    return cache.make_key("wx", run_hour.strftime("%Y%m%d%H"), f"{key[0]:.2f}", f"{key[1]:.2f}")


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
    status, body = get_json(SERVICE, settings.OPEN_METEO_URL, params)
    if status == 429:
        raise UpstreamError(SERVICE, "the free-tier rate limit was reached, try again in a minute")
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
        chunks = [missing[i : i + CHUNK_SIZE] for i in range(0, len(missing), CHUNK_SIZE)]
        fresh: dict[str, HourlySeries] = {}
        for chunk, series_list in zip(chunks, executor.map(_fetch_chunk, chunks), strict=True):
            for k, series in zip(chunk, series_list, strict=True):
                result[k] = series
                fresh[cache_keys[k]] = series
        cache.put_many(fresh, TTL_SECONDS)
    logger.info("forecasts: %d cached, %d fetched", len(unique) - len(missing), len(missing))
    return result
