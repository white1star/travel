import os
import re
from collections import OrderedDict, deque
from time import monotonic

from fastapi import APIRouter, HTTPException, Request

from .deepseek import DeepSeekServiceError, request_deepseek_recommendations
from .recommendation_schemas import DayRecommendation, DayRecommendationRequest, DayRecommendationResponse
from .recommendation_schemas import ModelRecommendationEnvelope, PlaceCandidate, clock_minutes
from .maps import search_place_candidates


router = APIRouter()
_windows: OrderedDict[str, deque[float]] = OrderedDict()


def throttle(request: Request) -> None:
    identity = request.client.host if request.client else "unknown"
    now = monotonic()
    hits = _windows.setdefault(identity, deque())
    _windows.move_to_end(identity)
    while hits and now - hits[0] >= 60:
        hits.popleft()
    if len(hits) >= 6:
        raise HTTPException(429, "AI 推荐请求较多，请稍后重试。", headers={"Retry-After": "60"})
    hits.append(now)
    while len(_windows) > 1024:
        _windows.popitem(last=False)


def normalized_name(value: str) -> str:
    return re.sub(r"\s+", "", value).casefold()


async def collect_candidates(
    city: str,
    user_request: str,
    existing_ids: set[str],
    existing_names: set[str],
) -> list[PlaceCandidate]:
    queries = ["景点", "博物馆", "公园", "特色美食"]
    extra = re.sub(r"[\r\n\t]+", " ", user_request).strip()[:20]
    if extra and extra not in queries:
        queries.append(extra)
    batches = [await search_place_candidates(city, query, 10) for query in queries]
    known_names = {normalized_name(value) for value in existing_names}
    seen_ids = set(existing_ids)
    result: list[PlaceCandidate] = []
    for candidate in (value for batch in batches for value in batch):
        name = normalized_name(candidate.name)
        if candidate.id in seen_ids or name in known_names:
            continue
        seen_ids.add(candidate.id)
        known_names.add(name)
        result.append(candidate)
        if len(result) == 24:
            break
    return result


def format_clock(minutes: int) -> str:
    return f"{minutes // 60:02d}:{minutes % 60:02d}"


def product_category(value: str) -> str:
    if any(label in value for label in ("餐饮", "美食", "餐厅", "小吃")):
        return "餐饮"
    if any(label in value for label in ("住宿", "宾馆", "酒店", "民宿")):
        return "住宿"
    if any(label in value for label in ("机场", "火车站", "汽车站", "地铁站")):
        return "市内交通"
    return value.strip() or "景点"


def materialize_recommendations(
    candidates: list[PlaceCandidate],
    model: ModelRecommendationEnvelope,
) -> DayRecommendationResponse:
    by_id = {value.id: value for value in candidates}
    seen: set[str] = set()
    recommendations: list[DayRecommendation] = []
    for suggestion in model.recommendations:
        candidate = by_id.get(suggestion.candidate_id)
        if not candidate or candidate.id in seen:
            continue
        start = clock_minutes(suggestion.time)
        end = start + suggestion.duration_minutes
        if end >= 24 * 60:
            continue
        seen.add(candidate.id)
        recommendations.append(DayRecommendation(
            poi_id=candidate.id,
            name=candidate.name,
            address=candidate.address,
            citycode=candidate.citycode,
            coordinate=candidate.coordinate,
            category=product_category(candidate.category),
            time=suggestion.time,
            end_time=format_clock(end),
            duration_minutes=suggestion.duration_minutes,
            cost=suggestion.cost,
            reason=suggestion.reason,
            notice="开放时间与费用需出发前确认",
        ))
    if not recommendations:
        raise HTTPException(502, "AI 没有生成可用的真实地点，请调整要求后重试。")
    return DayRecommendationResponse(
        recommendations=recommendations,
        summary=model.summary.strip(),
        warnings=[value.strip() for value in model.warnings if isinstance(value, str) and value.strip()],
    )


@router.post("/api/recommendations/day", response_model=DayRecommendationResponse)
async def recommend_day(payload: DayRecommendationRequest, request: Request) -> DayRecommendationResponse:
    if not os.getenv("DEEPSEEK_API_KEY", "").strip():
        raise HTTPException(503, "AI 推荐服务未配置，仍可手动添加安排。")
    if not os.getenv("AMAP_WEB_SERVICE_KEY", "").strip():
        raise HTTPException(503, "高德地点服务未配置，仍可手动添加安排。")
    throttle(request)
    candidates = await collect_candidates(
        payload.city,
        payload.request,
        existing_ids={value.poi_id for value in payload.existing_items if value.poi_id},
        existing_names={value.name for value in payload.existing_items},
    )
    if not candidates:
        raise HTTPException(502, "没有找到可用于推荐的真实地点，请调整要求后重试。")
    try:
        model = await request_deepseek_recommendations(payload, candidates)
    except DeepSeekServiceError as error:
        headers = {"Retry-After": error.retry_after} if error.retry_after else None
        raise HTTPException(error.status_code, error.detail, headers=headers) from None
    return materialize_recommendations(candidates, model)
