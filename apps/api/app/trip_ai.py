import os

from fastapi import APIRouter, HTTPException, Request

from .deepseek import DeepSeekServiceError, request_deepseek_trip_plan
from .maps import search_place_candidates
from .planner import build_itinerary
from .recommendation_schemas import PlaceCandidate, clock_minutes
from .recommendations import normalized_name, product_category, throttle
from .schemas import ItineraryDay, ItineraryItem, TripRequest
from .trip_ai_schemas import AiTripPlanResponse, ModelTripEnvelope


router = APIRouter()


async def collect_trip_candidates(request: TripRequest) -> dict[str, list[PlaceCandidate]]:
    queries = ["景点", "博物馆", "公园", "特色美食", *request.required_places, *request.interests]
    unique_queries = list(dict.fromkeys(value.strip() for value in queries if value.strip()))[:10]
    result: dict[str, list[PlaceCandidate]] = {}
    for city in dict.fromkeys(request.destinations):
        seen: set[str] = set()
        seen_names: set[str] = set()
        candidates: list[PlaceCandidate] = []
        for query in unique_queries:
            for candidate in await search_place_candidates(city, query[:50], 10):
                name = normalized_name(candidate.name)
                if candidate.id in seen or name in seen_names:
                    continue
                seen.add(candidate.id)
                seen_names.add(name)
                candidates.append(candidate)
                if len(candidates) >= 30:
                    break
            if len(candidates) >= 30:
                break
        result[city] = candidates
    return result


def _clock(value: int) -> str:
    return f"{value // 60:02d}:{value % 60:02d}"


def materialize_trip_plan(
    request: TripRequest,
    candidates: dict[str, list[PlaceCandidate]],
    model: ModelTripEnvelope,
) -> AiTripPlanResponse:
    base = build_itinerary(request)
    by_day = {day.day: day for day in model.days}
    if len(by_day) != request.days or set(by_day) != set(range(1, request.days + 1)):
        raise HTTPException(502, "AI 未生成完整的每日行程，请重试。")

    required_names = {normalized_name(value) for value in request.required_places}
    used_ids: set[str] = set()
    days: list[ItineraryDay] = []
    for base_day in base.days:
        model_day = by_day[base_day.day]
        available = {value.id: value for value in candidates.get(base_day.city, [])}
        items: list[ItineraryItem] = []
        for suggestion in model_day.items:
            candidate = available.get(suggestion.candidate_id)
            start = clock_minutes(suggestion.time)
            end = start + suggestion.duration_minutes
            if not candidate or candidate.id in used_ids or end >= 24 * 60:
                raise HTTPException(502, "AI 返回了不可用的地点或时间，请重试。")
            used_ids.add(candidate.id)
            items.append(ItineraryItem(
                time=suggestion.time,
                end_time=_clock(end),
                name=candidate.name,
                category=product_category(candidate.category),
                duration_minutes=suggestion.duration_minutes,
                description=suggestion.reason,
                cost=round(suggestion.cost),
                locked=normalized_name(candidate.name) in required_names,
                verified_hours=False,
                notice="开放时间与费用需出发前确认",
                coordinate=candidate.coordinate,
                poi_id=candidate.id,
                address=candidate.address,
                citycode=candidate.citycode,
                location_source="amap",
            ))
        days.append(base_day.model_copy(update={"title": model_day.title.strip(), "items": items}))

    tickets = sum(item.cost * request.travelers for day in days for item in day.items)
    estimated = base.budget.estimated_total - base.budget.tickets + tickets
    budget = base.budget.model_copy(update={
        "tickets": tickets,
        "estimated_total": estimated,
        "remaining": base.budget.total_available - estimated,
    })
    itinerary = base.model_copy(update={
        "days": days,
        "budget": budget,
        "data_notice": "AI 结合高德真实地点生成；开放时间、票价和交通仍需出发前确认。",
    })
    notices = [value.strip() for value in [model.summary, *model.warnings] if value.strip()]
    return AiTripPlanResponse(itinerary=itinerary, notices=notices)


@router.post("/api/trips/generate-ai", response_model=AiTripPlanResponse)
async def generate_ai_trip(payload: TripRequest, request: Request) -> AiTripPlanResponse:
    if not os.getenv("DEEPSEEK_API_KEY", "").strip():
        raise HTTPException(503, "AI 行程服务未配置，可使用普通生成。")
    if not os.getenv("AMAP_WEB_SERVICE_KEY", "").strip():
        raise HTTPException(503, "高德地点服务未配置，可使用普通生成。")
    throttle(request)
    candidates = await collect_trip_candidates(payload)
    if any(not candidates.get(city) for city in dict.fromkeys(payload.destinations)):
        raise HTTPException(502, "部分城市没有找到可用的真实地点，请调整目的地或使用普通生成。")
    day_context = [{"day": day.day, "city": day.city, "date": day.date} for day in build_itinerary(payload).days]
    try:
        model = await request_deepseek_trip_plan(payload, day_context, candidates)
    except DeepSeekServiceError as error:
        headers = {"Retry-After": error.retry_after} if error.retry_after else None
        raise HTTPException(error.status_code, error.detail, headers=headers) from None
    return materialize_trip_plan(payload, candidates, model)
