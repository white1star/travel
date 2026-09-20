import httpx
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.recommendation_schemas import PlaceCandidate
from app.trip_ai_schemas import ModelTripDay, ModelTripEnvelope, ModelTripItem


def trip_body(**overrides):
    value = {
        "origin": "南京",
        "destinations": ["苏州"],
        "date_mode": "flexible",
        "start_date": None,
        "days": 2,
        "travelers": 2,
        "budget_per_person": 3000,
        "pace": "balanced",
        "interests": ["园林古迹"],
        "required_places": [],
        "return_to_origin": True,
    }
    value.update(overrides)
    return value


@pytest.fixture(autouse=True)
def ai_environment(monkeypatch):
    from app.recommendations import _windows

    _windows.clear()
    monkeypatch.setenv("AMAP_WEB_SERVICE_KEY", "amap-secret")
    monkeypatch.setenv("DEEPSEEK_API_KEY", "deepseek-secret")
    yield
    _windows.clear()


def test_ai_trip_requires_server_side_keys(monkeypatch):
    monkeypatch.delenv("DEEPSEEK_API_KEY")

    response = TestClient(app).post("/api/trips/generate-ai", json=trip_body())

    assert response.status_code == 503
    assert "AI" in response.json()["detail"]
    assert "deepseek-secret" not in response.text


def test_trip_model_parser_requires_complete_json_response():
    from app.deepseek import parse_deepseek_trip_response

    response = httpx.Response(200, json={
        "choices": [{
            "finish_reason": "stop",
            "message": {"content": '{"days":[{"day":1,"title":"文化一日","items":[{"candidate_id":"poi-1","time":"09:00","duration_minutes":90,"cost":0,"reason":"顺路"}]}],"summary":"文化游","warnings":[]}'},
        }]
    })

    assert parse_deepseek_trip_response(response).days[0].items[0].candidate_id == "poi-1"


def test_ai_trip_materializes_only_real_candidates(monkeypatch):
    import app.trip_ai as module

    candidates = {
        "苏州": [
            PlaceCandidate(id="poi-1", name="苏州博物馆", address="东北街", citycode="0512", coordinate=(120.62, 31.32), category="博物馆"),
            PlaceCandidate(id="poi-2", name="拙政园", address="东北街", citycode="0512", coordinate=(120.63, 31.33), category="风景名胜"),
        ]
    }

    async def fake_candidates(*_args, **_kwargs):
        return candidates

    async def fake_model(*_args, **_kwargs):
        return ModelTripEnvelope(
            days=[
                ModelTripDay(day=1, title="园林初见", items=[ModelTripItem(candidate_id="poi-1", time="09:30", duration_minutes=120, cost=0, reason="室内参观")]),
                ModelTripDay(day=2, title="经典园林", items=[ModelTripItem(candidate_id="poi-2", time="10:00", duration_minutes=120, cost=80, reason="经典必游")]),
            ],
            summary="两天苏州文化之旅",
            warnings=["开放时间需确认"],
        )

    monkeypatch.setattr(module, "collect_trip_candidates", fake_candidates)
    monkeypatch.setattr(module, "request_deepseek_trip_plan", fake_model)

    response = TestClient(app).post("/api/trips/generate-ai", json=trip_body())

    assert response.status_code == 200
    payload = response.json()
    assert [day["items"][0]["name"] for day in payload["itinerary"]["days"]] == ["苏州博物馆", "拙政园"]
    assert payload["itinerary"]["days"][0]["items"][0]["poi_id"] == "poi-1"
    assert payload["itinerary"]["days"][0]["items"][0]["coordinate"] == [120.62, 31.32]
    assert payload["itinerary"]["data_notice"].startswith("AI")
    assert payload["itinerary"]["budget"]["allocations"]["lodging"] > 0
    assert "开放时间需确认" in payload["notices"]


def test_ai_trip_rejects_hallucinated_or_incomplete_days(monkeypatch):
    import app.trip_ai as module

    async def fake_candidates(*_args, **_kwargs):
        return {"苏州": [PlaceCandidate(id="poi-1", name="苏州博物馆", coordinate=(120.62, 31.32))]}

    async def fake_model(*_args, **_kwargs):
        return ModelTripEnvelope(
            days=[ModelTripDay(day=1, title="错误计划", items=[ModelTripItem(candidate_id="made-up", time="09:00", duration_minutes=60, cost=0, reason="虚构")])],
            summary="",
            warnings=[],
        )

    monkeypatch.setattr(module, "collect_trip_candidates", fake_candidates)
    monkeypatch.setattr(module, "request_deepseek_trip_plan", fake_model)

    response = TestClient(app).post("/api/trips/generate-ai", json=trip_body())

    assert response.status_code == 502
    assert "可用" in response.json()["detail"] or "完整" in response.json()["detail"]
