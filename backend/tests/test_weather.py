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


def test_hourly_frame_reads_bucket_closing_the_hour():
    from core.domain.weather import hourly_frame

    s = make_series(gust=lambda i: i, speed=lambda i: 100 + i, rain=lambda i: i / 100)
    f = hourly_frame(s, T0 + timedelta(hours=2), 0, "gust")
    assert (f.wind_mph, f.rain_in) == (3, 0.03)
    assert hourly_frame(s, T0 + timedelta(hours=2), 1, "sustained").wind_mph == 103
    assert hourly_frame(s, T0, 71, "gust").wind_mph is None


def _pirate_payload(hours=6):
    t0 = int(T0.timestamp())
    return {
        "hourly": {
            "data": [
                {
                    "time": t0 + i * 3600,
                    "windSpeed": 10.0 + i,
                    "windGust": 20.0 + i,
                    "windBearing": 270,
                    "temperature": 32.0,
                    "rainIntensity": 0.1 * i,
                    "snowIntensity": 0.5 if i == 3 else 0.0,
                    "iceIntensity": 0.05 if i == 2 else 0.0,
                }
                for i in range(hours)
            ]
        }
    }


def test_pirate_weather_hour_starting_values_land_in_the_bucket_that_closes_the_hour():
    from core.domain.weather import parse_pirate_weather

    s = parse_pirate_weather(_pirate_payload())
    assert s.start == T0 and s.length == 7
    # ETA 02:20 lies in Pirate's 02:00 hour -> rate 0.2 (+0.05 freezing rain), gust 22.
    sample = s.sample(T0 + timedelta(hours=2, minutes=20))
    assert sample.rain_in == 0.25
    assert sample.wind_gust_mph == 22
    assert sample.wind_speed_mph == 12  # nearest hour (02:00)
    assert sample.temperature_c == 0
    assert s.sample(T0 + timedelta(hours=3, minutes=1)).snow_in == 0.5
    # The hour before the data starts is unknown.
    assert s.sample(T0).rain_in is None


def test_pirate_weather_legacy_precip_fields():
    from core.domain.weather import parse_pirate_weather

    payload = {
        "hourly": {
            "data": [
                {"time": int(T0.timestamp()), "precipIntensity": 0.1, "precipType": "snow"},
                {"time": int(T0.timestamp()) + 3600, "precipIntensity": 0.2, "precipType": "rain"},
            ]
        }
    }
    s = parse_pirate_weather(payload)
    assert s.sample(T0 + timedelta(minutes=30)).snow_in == 1.0
    assert s.sample(T0 + timedelta(hours=1, minutes=30)).rain_in == 0.2
