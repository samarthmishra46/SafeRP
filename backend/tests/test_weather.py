from datetime import timedelta

from core.domain.weather import combine_rain, parse_open_meteo_location
from tests.helpers import T0, make_series


def test_precip_uses_bucket_containing_eta():
    # Rain value at index i equals i / 100, so the bucket index is readable.
    s = make_series(rain=lambda i: i / 100)
    sample = s.sample(T0 + timedelta(hours=2, minutes=20))
    assert sample.rain_in == 0.03  # the 03:00 bucket covers 02:00-03:00
    assert sample.valid_hour == T0 + timedelta(hours=2)


def test_exact_hour_belongs_to_its_own_bucket():
    s = make_series(rain=lambda i: i / 100)
    assert s.sample(T0 + timedelta(hours=3)).rain_in == 0.03


def test_instantaneous_values_use_nearest_hour():
    s = make_series(speed=lambda i: i)
    assert s.sample(T0 + timedelta(hours=2, minutes=20)).wind_speed_mph == 2
    assert s.sample(T0 + timedelta(hours=2, minutes=40)).wind_speed_mph == 3


def test_gust_uses_preceding_hour_bucket():
    s = make_series(gust=lambda i: i)
    assert s.sample(T0 + timedelta(hours=2, minutes=20)).wind_gust_mph == 3


def test_sample_outside_series_is_none():
    s = make_series(hours=5)
    assert s.sample(T0 - timedelta(hours=1)) is None
    assert s.sample(T0 + timedelta(hours=4, minutes=1)) is None
    assert s.sample(T0 + timedelta(hours=4)) is not None


def test_rain_plus_showers_avoids_float_noise():
    assert combine_rain(0.07, 0.03) == 0.10
    assert combine_rain(None, 0.2) == 0.2
    assert combine_rain(None, None) is None


def test_metric_selection():
    s = make_series(gust=40, speed=20).sample(T0 + timedelta(hours=1))
    assert s.wind_for_metric("gust") == 40
    assert s.wind_for_metric("sustained") == 20


def test_parse_open_meteo_location():
    payload = {
        "hourly": {
            "time": ["2026-01-15T00:00", "2026-01-15T01:00"],
            "wind_speed_10m": [5.0, 6.0],
            "wind_gusts_10m": [9.0, None],
            "wind_direction_10m": [180, 190],
            "rain": [0.0, 0.1],
            "showers": [0.0, 0.05],
            "snowfall": [0.0, 0.0],
            "temperature_2m": [1.0, 2.0],
        }
    }
    s = parse_open_meteo_location(payload)
    assert s.start == T0
    sample = s.sample(T0 + timedelta(minutes=30))
    assert sample.rain_in == 0.15
    assert sample.wind_gust_mph is None
