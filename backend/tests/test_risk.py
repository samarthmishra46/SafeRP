import pytest

from core.domain.risk import (
    RiskLevel,
    apply_load_rules,
    classify,
    rain_level,
    snow_level,
    wind_level,
)

L, M, H, S, NT = (
    RiskLevel.LOW,
    RiskLevel.MODERATE,
    RiskLevel.HIGH,
    RiskLevel.SEVERE,
    RiskLevel.NO_TRAVEL,
)


@pytest.mark.parametrize(
    ("mph", "expected"),
    [
        (0, L),
        (24.9, L),
        (25, M),
        (34.9, M),
        (34.99, M),
        (35, H),
        (44.9, H),
        (45, S),
        (54.9, S),
        (55, NT),  # wind uses >= 55
        (80, NT),
    ],
)
def test_wind_thresholds(mph, expected):
    assert wind_level(mph) == expected


@pytest.mark.parametrize(
    ("inches", "expected"),
    [
        (0, L),
        (0.09, L),
        (0.10, M),
        (0.24, M),
        (0.25, H),
        (0.49, H),
        (0.50, S),
        (1.00, S),  # 0.50-1.00 inclusive is Severe
        (1.01, NT),  # strictly greater than 1.00
    ],
)
def test_rain_thresholds(inches, expected):
    assert rain_level(inches) == expected


@pytest.mark.parametrize(
    ("inches", "expected"),
    [
        (0, L),
        (0.49, L),
        (0.5, M),
        (0.99, M),
        (1.0, H),
        (1.99, H),
        (2.0, S),
        (3.0, S),  # 2.0-3.0 inclusive is Severe
        (3.01, NT),  # strictly greater than 3.0
    ],
)
def test_snow_thresholds(inches, expected):
    assert snow_level(inches) == expected


@pytest.mark.parametrize(
    ("mph", "load", "expected", "rule_fired"),
    [
        # Wind >= 55: No Travel for any load.
        (55, 1_000, NT, False),
        (55, 80_000, NT, False),
        # Wind 45 to <55: No Travel above 30,000 lb.
        (45, 30_000, S, False),
        (45, 30_001, NT, True),
        (54.9, 30_000, S, False),
        (54.9, 30_001, NT, True),
        (50, 40_000, NT, True),
        # Wind 35 to <45: Severe above 40,000 lb.
        (35, 40_000, H, False),
        (35, 40_001, S, True),
        (44.9, 40_000, H, False),
        (44.9, 40_001, S, True),
        (40, 30_001, H, False),  # the 30,000 lb rule only applies at 45+ mph
        # Below 35 mph the load does not matter.
        (34.9, 80_000, M, False),
        (24.9, 80_000, L, False),
    ],
)
def test_load_rules(mph, load, expected, rule_fired):
    level, rule = apply_load_rules(mph, load)
    assert level == expected
    assert (rule is not None) == rule_fired


def test_classify_takes_max_and_reports_driver():
    r = classify(wind_mph=30, rain_in_per_hour=0.3, snow_in_per_hour=0.0, load_lb=20_000)
    assert r.level == H
    assert r.drivers == ("rain",)
    assert (r.wind_level, r.rain_level, r.snow_level) == (M, H, L)


def test_classify_reports_all_tied_drivers():
    r = classify(wind_mph=36, rain_in_per_hour=0.3, snow_in_per_hour=1.5, load_lb=20_000)
    assert r.level == H
    assert r.drivers == ("wind", "rain", "snow")


def test_classify_low_has_no_driver():
    r = classify(wind_mph=10, rain_in_per_hour=0.0, snow_in_per_hour=0.0, load_lb=20_000)
    assert r.level == L
    assert r.drivers == ()


def test_classify_load_rule_drives_level():
    r = classify(wind_mph=46, rain_in_per_hour=0.6, snow_in_per_hour=0, load_lb=35_000)
    assert r.level == NT
    assert r.drivers == ("wind",)
    assert r.load_rule is not None


def test_classify_load_rule_hidden_when_another_factor_dominates():
    r = classify(wind_mph=36, rain_in_per_hour=1.2, snow_in_per_hour=0, load_lb=45_000)
    assert r.wind_level == S
    assert r.level == NT
    assert r.drivers == ("rain",)
    assert r.load_rule is None


def test_classify_missing_values_are_reported_and_treated_as_calm():
    r = classify(wind_mph=None, rain_in_per_hour=0.12, snow_in_per_hour=None, load_lb=10_000)
    assert r.level == M
    assert r.missing == ("wind", "snow")
