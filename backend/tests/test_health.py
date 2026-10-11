from django.test import Client


def test_health_ok():
    response = Client().get("/api/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_unknown_route_is_404():
    assert Client().get("/api/nope").status_code == 404
