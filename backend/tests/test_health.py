from django.test import Client


def test_health_ok():
    response = Client().get("/api/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_unknown_route_is_404():
    assert Client().get("/api/nope").status_code == 404


def test_token_cleanup_forgives_paste_mistakes():
    from saferp.settings import clean_token

    assert clean_token("pk.abc") == "pk.abc"
    assert clean_token('  "pk.abc"\n') == "pk.abc"
    assert clean_token("MAPBOX_ACCESS_TOKEN=pk.abc") == "pk.abc"
    assert clean_token("MAPBOX_ACCESS_TOKEN='pk.abc' ") == "pk.abc"
    assert clean_token("") == ""


def test_health_reports_malformed_token(settings):
    settings.MAPBOX_ACCESS_TOKEN = "not-a-token"
    assert Client().get("/api/health").json()["mapboxConfigured"] is False
    settings.MAPBOX_ACCESS_TOKEN = "pk.eyJ1Ijoi.abc-123_x"
    assert Client().get("/api/health").json()["mapboxConfigured"] is True
