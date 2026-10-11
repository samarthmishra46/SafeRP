from datetime import UTC, datetime

from core.domain.weather import HourlySeries

T0 = datetime(2026, 1, 15, 0, 0, tzinfo=UTC)


def make_series(hours=72, start=T0, gust=10.0, speed=5.0, rain=0.0, showers=0.0, snow=0.0):
    """Hourly series where each field is a constant or a function of the hour index."""

    def col(v):
        return [float(v(i)) if callable(v) else float(v) for i in range(hours)]

    return HourlySeries(
        start=start,
        wind_speed=col(speed),
        wind_gust=col(gust),
        wind_direction=col(180),
        rain=col(rain),
        showers=col(showers),
        snowfall=col(snow),
        temperature=col(5),
    )
