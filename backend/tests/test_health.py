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


def test_health_mapbox_check_reports_without_revealing_token(settings):
    import re as _re

    import responses

    settings.MAPBOX_ACCESS_TOKEN = "pk.secret-token"
    settings.MAPBOX_ACCESS_TOKEN_RAW_LENGTH = 16  # e.g. pasted with a trailing newline
    with responses.RequestsMock() as rsps:
        rsps.add(
            responses.GET,
            _re.compile(r"https://api\.mapbox\.com/tokens/v2.*"),
            json={"code": "TokenValid"},
        )
        body = Client().get("/api/health", {"check": "mapbox"}).json()
    info = body["mapbox"]
    assert info["tokenLength"] == 15 and info["rawLength"] == 16
    assert info["mapboxCode"] == "TokenValid" and info["mapboxStatus"] == 200
    assert len(info["fingerprint"]) == 12
    assert "pk.secret-token" not in str(body)


def test_plain_health_does_not_call_mapbox():
    assert "mapbox" not in Client().get("/api/health").json()
