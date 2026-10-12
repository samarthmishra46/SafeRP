from datetime import timedelta

from core.domain.hazards import frame_levels, hazard_row, round_direction
from core.domain.risk import RiskLevel
from core.domain.weather import Frame, hourly_frame
from tests.helpers import T0, make_series


def test_frame_levels_use_table_thresholds_without_load_rules():
    assert frame_levels(Frame(47.0, 0.3, 2.0)) == (
        RiskLevel.SEVERE,
        RiskLevel.HIGH,
        RiskLevel.SEVERE,
    )
    assert frame_levels(Frame(None, None, None)) == (RiskLevel.LOW,) * 3


def test_hazard_row_encodes_one_digit_per_point():
    row = hazard_row([Frame(10, 0, 0, 181), Frame(25, 0.1, 0.5, 4), Frame(55, 1.01, 3.01, None)])
    assert (row.wind, row.rain, row.snow) == ("014", "014", "014")
    assert row.wind_dir == [180, 0, None]


def test_round_direction_wraps():
    assert round_direction(356) == 0
    assert round_direction(234.9) == 230
    assert round_direction(None) is None


def test_hourly_frame_carries_instant_wind_direction():
    s = make_series()
    s.wind_direction[:] = [i * 10 for i in range(s.length)]
    f = hourly_frame(s, T0 + timedelta(hours=2), 1, "gust")
    assert f.wind_direction_deg == 30  # instant at the start of the hour (index 3)
