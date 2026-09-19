from app.planner import build_itinerary
from app.schemas import TripRequest
from app.main import app
from fastapi.testclient import TestClient


def sample_request() -> TripRequest:
    return TripRequest(
        origin="南京",
        destinations=["苏州", "杭州"],
        date_mode="fixed",
        start_date="2026-10-02",
        days=4,
        travelers=2,
        budget_per_person=3000,
        pace="balanced",
        interests=["园林", "历史", "美食"],
        required_places=["拙政园"],
        return_to_origin=True,
    )


def test_round_trip_returns_to_origin_and_preserves_required_place() -> None:
    itinerary = build_itinerary(sample_request())

    assert itinerary.route == ["南京", "苏州", "杭州", "南京"]
    assert any(item.name == "拙政园" and item.locked for day in itinerary.days for item in day.items)


def test_budget_uses_per_person_amount_and_traveler_count() -> None:
    itinerary = build_itinerary(sample_request())

    assert itinerary.travelers == 2
    assert itinerary.budget.total_available == 6000
    assert itinerary.budget.estimated_total <= 6000
    assert itinerary.budget.remaining == itinerary.budget.total_available - itinerary.budget.estimated_total


def test_unverified_opening_hours_are_marked_for_confirmation() -> None:
    itinerary = build_itinerary(sample_request())

    unverified = [item for day in itinerary.days for item in day.items if not item.verified_hours]
    assert unverified
    assert all(item.notice == "需出发前确认" for item in unverified)


def test_generate_endpoint_returns_an_itinerary() -> None:
    response = TestClient(app).post("/api/trips/generate", json=sample_request().model_dump())

    assert response.status_code == 200
    assert response.json()["travelers"] == 2
    assert response.json()["route"] == ["南京", "苏州", "杭州", "南京"]
