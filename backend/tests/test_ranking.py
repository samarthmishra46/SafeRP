import pytest

from core.domain.geo import METERS_PER_MILE
from core.domain.ranking import explain, fmt_miles, rank, rank_key, summarize
from core.domain.risk import RiskLevel

L, M, H, S, NT = (
    RiskLevel.LOW,
    RiskLevel.MODERATE,
    RiskLevel.HIGH,
    RiskLevel.SEVERE,
    RiskLevel.NO_TRAVEL,
)
MI = METERS_PER_MILE


def summary(nt=0.0, sev=0.0, high=0.0, mod=0.0, low=100.0, minutes=120):
    owned = [nt * MI, sev * MI, high * MI, mod * MI, low * MI]
    levels = [NT, S, H, M, L]
    total = sum(owned)
    return summarize(owned, levels, total, minutes * 60)


def test_summarize_miles_and_weighted_average():
    s = summarize([10 * MI, 30 * MI], [S, L], 40 * MI, 3600)
    assert s.miles(S) == pytest.approx(10)
    assert s.miles(L) == pytest.approx(30)
    assert s.avg_risk == pytest.approx(3 * 10 / 40)
    assert s.max_level == S


def test_no_travel_miles_rank_first():
    a = summary(nt=1, minutes=60)
    b = summary(sev=50, minutes=200)
    assert rank([a, b]) == [1, 0]


def test_severe_then_high_then_avg_then_time():
    base = summary(sev=5, high=5, mod=10, minutes=100)
    more_severe = summary(sev=6, high=0, mod=0, minutes=50)
    more_high = summary(sev=5, high=6, mod=0, minutes=50)
    higher_avg = summary(sev=5, high=5, mod=20, minutes=50)
    slower = summary(sev=5, high=5, mod=10, minutes=101)
    order = rank([more_severe, more_high, higher_avg, slower, base])
    assert order == [4, 3, 2, 1, 0]


def test_rounding_prevents_float_noise_from_deciding():
    # 0.04 Severe miles rounds to 0.0, so the faster route wins.
    noisy = summary(sev=0.04, low=99.96, minutes=100)
    clean = summary(minutes=110)
    assert rank_key(noisy)[1] == 0.0
    assert rank([clean, noisy]) == [1, 0]


def test_seconds_do_not_decide_time():
    a = summarize([MI], [L], MI, 600.4)
    b = summarize([MI], [L], MI, 599.6)
    assert rank_key(a) == rank_key(b)
    assert rank([a, b]) == [0, 1]  # full tie keeps input order


def test_full_tie_keeps_input_order():
    a, b, c = summary(), summary(), summary()
    assert rank([a, b, c]) == [0, 1, 2]


def test_explain_severe_difference_with_time_cost():
    names = ["Route A", "Route B"]
    a = summary(sev=18, low=82, minutes=100)
    b = summary(minutes=114)
    order = rank([a, b])
    assert explain(names, [a, b], order) == (
        "Route B has 0 Severe miles vs 18 on Route A, and is 14 minutes longer."
    )


def test_explain_no_travel_and_faster():
    names = ["Route A", "Route B"]
    a = summary(nt=4.5, minutes=100)
    b = summary(minutes=95)
    assert explain(names, [a, b], rank([a, b])) == (
        "Route B has 0 No Travel miles vs 4.5 on Route A, and is also 5 minutes faster."
    )


def test_explain_average_risk():
    names = ["Route A", "Route B"]
    a = summary(mod=50, low=50, minutes=100)
    b = summary(mod=10, low=90, minutes=100)
    text = explain(names, [a, b], rank([a, b]))
    assert text.startswith("Route B and Route A tie on No Travel, Severe and High miles")
    assert "(0.10 vs 0.50)" in text
    assert text.endswith("takes about the same time.")


def test_explain_time_only_and_full_tie_and_single():
    names = ["Route A", "Route B"]
    a, b = summary(minutes=100), summary(minutes=170)
    assert explain(names, [a, b], rank([a, b])) == (
        "Route A and Route B carry the same weather risk; Route A is 1 h 10 min faster."
    )
    a, b = summary(), summary()
    assert "tied on risk and travel time" in explain(names, [a, b], rank([a, b]))
    assert explain(["Route A"], [a], [0]) == "Route A is the only route available."


def test_fmt_miles():
    assert fmt_miles(18.0) == "18"
    assert fmt_miles(18.04) == "18"
    assert fmt_miles(4.46) == "4.5"


def test_explain_in_kilometres_converts_values_but_not_the_ranking():
    names = ["Route A", "Route B"]
    a = summary(sev=18, low=82, minutes=100)
    b = summary(minutes=114)
    order = rank([a, b])
    assert order == [1, 0]
    assert explain(names, [a, b], order, "km") == (
        "Route B has 0 Severe km vs 29 on Route A, and is 14 minutes longer."
    )
