import os

os.environ["USE_MOCKS"] = "true"

from fastapi.testclient import TestClient

from app.database import Base, engine
from app.main import app


def setup_function():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)


def test_health():
    client = TestClient(app)
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_research_stream_saves_report(monkeypatch):
    monkeypatch.setenv("USE_MOCKS", "true")
    client = TestClient(app)

    response = client.post("/api/research", json={"company_name": "Acme"})

    assert response.status_code == 200
    body = response.text
    assert "event: report" in body
    assert "event: section" in body
    assert "event: complete" in body

    reports = client.get("/api/reports").json()
    assert len(reports) == 1
    assert reports[0]["company_name"] == "Acme"

    detail = client.get(f"/api/reports/{reports[0]['id']}")
    assert detail.status_code == 200
    assert detail.json()["data"]["overview"]


def test_invalid_company_name():
    client = TestClient(app)
    response = client.post("/api/research", json={"company_name": "!!!"})
    assert response.status_code == 422


def test_delete_report_lifecycle():
    client = TestClient(app)
    client.post("/api/research", json={"company_name": "Globex"})
    report_id = client.get("/api/reports").json()[0]["id"]

    assert client.delete(f"/api/reports/{report_id}").status_code == 204
    assert client.get(f"/api/reports/{report_id}").status_code == 404
