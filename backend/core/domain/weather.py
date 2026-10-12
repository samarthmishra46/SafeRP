"""Hourly forecast series and sampling at an arbitrary ETA.

Open-Meteo hourly values come in two flavours:
* instantaneous (wind speed, wind direction, temperature): valid at the timestamp;
* preceding-hour (rain, showers, snowfall sums; gusts maximum): the value at T covers (T-1h, T].

So an ETA of 14:20 reads precipitation and gusts from the 15:00 bucket (the hour that
contains it) and instantaneous values from the nearest timestamp, 14:00.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

HOUR = timedelta(hours=1)


@dataclass(frozen=True)
class WeatherSample:
    wind_speed_mph: float | None
    wind_gust_mph: float | None
    wind_direction_deg: float | None
    rain_in: float | None  # rain + showers over the hour containing the ETA
    snow_in: float | None
    temperature_c: float | None
    valid_hour: datetime  # start of the preceding-hour bucket used for precipitation

    def wind_for_metric(self, metric: str) -> float | None:
        return self.wind_gust_mph if metric == "gust" else self.wind_speed_mph


@dataclass(frozen=True)
class HourlySeries:
    """Hourly forecast for one location. `start` is the UTC timestamp of index 0."""

    start: datetime
    wind_speed: list[float | None]
    wind_gust: list[float | None]
    wind_direction: list[float | None]
    rain: list[float | None]
    showers: list[float | None]
    snowfall: list[float | None]
    temperature: list[float | None]

    @property
    def length(self) -> int:
        return len(self.wind_speed)

    @property
    def end(self) -> datetime:
        return self.start + HOUR * (self.length - 1)

    def index_of(self, at: datetime) -> float:
        return (at - self.start) / HOUR

    def covers(self, at: datetime) -> bool:
        return 0 <= self._bucket_index(at) < self.length

    def _bucket_index(self, at: datetime) -> int:
        """Index of the preceding-hour bucket that contains `at`."""
        # Tolerate sub-second float noise so an exact hour stays in its own bucket.
        return math.ceil(round(self.index_of(at), 6))

    def sample(self, at: datetime) -> WeatherSample | None:
        """Forecast at `at`, or None when the series does not cover that time."""
        bucket = self._bucket_index(at)
        nearest = max(0, min(self.length - 1, round(self.index_of(at))))
        if not 0 <= bucket < self.length:
            return None
        return WeatherSample(
            wind_speed_mph=self.wind_speed[nearest],
            wind_gust_mph=self.wind_gust[bucket],
            wind_direction_deg=self.wind_direction[nearest],
            rain_in=combine_rain(self.rain[bucket], self.showers[bucket]),
            snow_in=self.snowfall[bucket],
            temperature_c=self.temperature[nearest],
            valid_hour=self.start + HOUR * (bucket - 1),
        )


def combine_rain(rain: float | None, showers: float | None) -> float | None:
    """Rain rate = rain + showers, rounded so 0.07 + 0.03 compares equal to 0.10."""
    if rain is None and showers is None:
        return None
    return round((rain or 0.0) + (showers or 0.0), 4)


def floor_hour(at: datetime) -> datetime:
    return at.astimezone(UTC).replace(minute=0, second=0, microsecond=0)


def parse_open_meteo_location(payload: dict) -> HourlySeries:
    """Build a series from one Open-Meteo location object (timezone=GMT, iso8601 times)."""
    hourly = payload["hourly"]
    times = hourly["time"]
    start = datetime.fromisoformat(times[0]).replace(tzinfo=UTC)
    n = len(times)

    def col(name: str) -> list[float | None]:
        values = hourly.get(name) or [None] * n
        return list(values)

    return HourlySeries(
        start=start,
        wind_speed=col("wind_speed_10m"),
        wind_gust=col("wind_gusts_10m"),
        wind_direction=col("wind_direction_10m"),
        rain=col("rain"),
        showers=col("showers"),
        snowfall=col("snowfall"),
        temperature=col("temperature_2m"),
    )


def parse_pirate_weather(payload: dict) -> HourlySeries:
    """Build a series from a Pirate Weather response (units=us, extend=hourly, version=2).

    Pirate Weather's hourly point at `time` describes the hour *starting* then: rates and gusts
    for [t, t+1h) and instantaneous-style values at t. In this module's convention a bucket is
    stamped with the hour it ends at, so rates and gusts move one slot later; the first bucket
    (the hour before the data starts) is unknown. Units: inches/hour, mph; °F becomes °C.
    Freezing rain (`iceIntensity`) counts as rain: it is liquid precipitation on the road.
    """
    points = payload["hourly"]["data"]
    start = datetime.fromtimestamp(points[0]["time"], UTC)

    def get(p: dict, key: str) -> float | None:
        value = p.get(key)
        return None if value is None else float(value)

    def rain(p: dict) -> float | None:
        if "rainIntensity" in p or "iceIntensity" in p:
            return (get(p, "rainIntensity") or 0.0) + (get(p, "iceIntensity") or 0.0)
        # Older responses: one liquid-equivalent intensity plus a type.
        if p.get("precipType") in ("rain", "sleet"):
            return get(p, "precipIntensity")
        return 0.0 if p.get("precipType") in ("snow", "none", None) else None

    def snow(p: dict) -> float | None:
        if "snowIntensity" in p:
            return get(p, "snowIntensity")
        if p.get("precipType") == "snow" and p.get("precipIntensity") is not None:
            return float(p["precipIntensity"]) * 10  # ~10:1 snow-to-liquid ratio
        return 0.0

    def celsius(p: dict) -> float | None:
        f = get(p, "temperature")
        return None if f is None else round((f - 32) * 5 / 9, 2)

    # Instants at index k (length n + 1, last unknown); buckets shifted to index k + 1.
    def instants(fn) -> list[float | None]:
        return [fn(p) for p in points] + [None]

    def buckets(fn) -> list[float | None]:
        return [None] + [fn(p) for p in points]

    return HourlySeries(
        start=start,
        wind_speed=instants(lambda p: get(p, "windSpeed")),
        wind_gust=buckets(lambda p: get(p, "windGust")),
        # Treated like Dark Sky's windBearing: where the wind comes from.
        wind_direction=instants(lambda p: get(p, "windBearing")),
        rain=buckets(rain),
        showers=buckets(lambda p: 0.0),  # already included in rain
        snowfall=buckets(snow),
        temperature=instants(celsius),
    )


@dataclass(frozen=True)
class Frame:
    wind_mph: float | None
    rain_in: float | None
    snow_in: float | None
    wind_direction_deg: float | None = None  # meteorological: where the wind blows FROM


def hourly_frame(series: HourlySeries, anchor: datetime, hour: int, wind_metric: str) -> Frame:
    """Conditions during the hour [anchor + hour, anchor + hour + 1h) for the heatmap.

    `anchor` is a whole UTC hour. Precipitation and gusts come from the bucket that closes the
    hour; sustained wind from the instant that opens it.
    """
    base = round(series.index_of(anchor))
    bucket, instant = base + hour + 1, base + hour
    if not (instant >= 0 and bucket < series.length):
        return Frame(None, None, None, None)
    wind = series.wind_gust[bucket] if wind_metric == "gust" else series.wind_speed[instant]
    return Frame(
        wind_mph=wind,
        rain_in=combine_rain(series.rain[bucket], series.showers[bucket]),
        snow_in=series.snowfall[bucket],
        wind_direction_deg=series.wind_direction[instant],
    )
