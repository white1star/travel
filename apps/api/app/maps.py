"""AMap boundaries: credentials stay here, provider failures never become demo data."""
import math
import os
import re
from collections import OrderedDict, deque
from time import monotonic
from typing import Literal

import httpx
from fastapi import APIRouter, HTTPException, Query, Request, Response
from pydantic import BaseModel, field_validator

from .recommendation_schemas import PlaceCandidate

router = APIRouter()
_windows: OrderedDict[str, deque[float]] = OrderedDict()


def throttle(request: Request) -> None:
    # A bounded, per-process safeguard. Production needs a shared authenticated limiter.
    identity = request.client.host if request.client else "unknown"
    now = monotonic()
    hits = _windows.setdefault(identity, deque())
    _windows.move_to_end(identity)
    while hits and now - hits[0] >= 60:
        hits.popleft()
    if len(hits) >= 60:
        raise HTTPException(429, "地图请求过于频繁，请稍后重试。", headers={"Retry-After": "60"})
    hits.append(now)
    while len(_windows) > 1024:
        _windows.popitem(last=False)


def coordinate(value) -> tuple[float, float]:
    if isinstance(value, str):
        value = value.split(",")
    lng, lat = map(float, value)
    if not math.isfinite(lng) or not math.isfinite(lat) or not -180 <= lng <= 180 or not -90 <= lat <= 90 or (lng == 0 and lat == 0):
        raise ValueError("invalid coordinate")
    return lng, lat


class RouteRequest(BaseModel):
    origin: tuple[float, float]
    destination: tuple[float, float]
    mode: Literal["walking", "driving", "transit"]
    citycode: str | None = None
    destination_citycode: str | None = None

    @field_validator("origin", "destination")
    @classmethod
    def validate_coordinate(cls, value):
        return coordinate(value)

    @field_validator("citycode", "destination_citycode")
    @classmethod
    def validate_citycode(cls, value):
        if value is not None and not re.fullmatch(r"\d{3,6}", value):
            raise ValueError("invalid city code")
        return value


async def provider(path: str, params: dict) -> dict:
    key = os.getenv("AMAP_WEB_SERVICE_KEY", "").strip()
    if not key:
        raise HTTPException(503, "高德地点和路线服务未配置，仍可手动编辑行程。")
    try:
        async with httpx.AsyncClient(timeout=8, follow_redirects=False) as client:
            response = await client.get(f"https://restapi.amap.com/{path}", params={**params, "key": key})
            response.raise_for_status()
            result = response.json()
    except (httpx.HTTPError, ValueError):
        raise HTTPException(502, "地图服务暂时不可用，请重试。") from None
    if not isinstance(result, dict) or result.get("status") != "1":
        raise HTTPException(502, "地图服务请求未成功，请检查授权、额度或稍后重试。")
    return result


@router.get("/api/maps/status")
def status():
    js_key = os.getenv("AMAP_JS_KEY", "").strip()
    map_available = bool(js_key and os.getenv("AMAP_JS_SECURITY_CODE", "").strip())
    return {"search_available": bool(os.getenv("AMAP_WEB_SERVICE_KEY", "").strip()), "map_available": map_available, "js_key": js_key if map_available else None}


@router.get("/api/maps/places")
async def places(request: Request, query: str = Query(min_length=1, max_length=80), city: str = Query(min_length=1, max_length=50)):
    query, city = query.strip(), city.strip()
    if not query or not city:
        raise HTTPException(422, "请填写搜索词和城市。")
    throttle(request)
    found = await search_place_candidates(city, query)
    return {"places": [place.model_dump() for place in found]}


async def search_place_candidates(city: str, query: str, page_size: int = 10) -> list[PlaceCandidate]:
    result = await provider("v5/place/text", {"keywords": query, "region": city, "city_limit": "true", "page_size": str(max(1, min(page_size, 25)))})
    found: list[PlaceCandidate] = []
    pois = result.get("pois")
    if not isinstance(pois, list):
        raise HTTPException(502, "地点服务返回异常，请重试。")
    for poi in pois:
        try:
            location = coordinate(poi.get("location", ""))
            if not poi.get("id") or not poi.get("name"):
                continue
            found.append(PlaceCandidate(id=str(poi["id"]), name=str(poi["name"]), coordinate=location, address=poi.get("address") if isinstance(poi.get("address"), str) else "", citycode=poi.get("citycode") if isinstance(poi.get("citycode"), str) else "", category=poi.get("type") if isinstance(poi.get("type"), str) else "地点"))
        except (ValueError, TypeError, AttributeError):
            continue
    return found


def geometry(path: dict, mode: str) -> list[tuple[float, float]]:
    steps = path.get("steps", [])
    if mode == "transit":
        steps = []
        for segment in path.get("segments", []):
            steps.extend(segment.get("walking", {}).get("steps", []))
            buslines = segment.get("bus", {}).get("buslines", [])
            if buslines:
                steps.append(buslines[0])
            for name in ("railway", "taxi"):
                if segment.get(name):
                    steps.append(segment[name])
    points = []
    for step in steps:
        line = step.get("polyline")
        if not isinstance(line, str) or not line.strip():
            # Keep distance/time, but never bridge a segment the provider did not locate.
            return []
        for point in line.split(";"):
            if not point:
                continue
            parsed = coordinate(point)
            if not points or points[-1] != parsed:
                points.append(parsed)
    return points


@router.post("/api/maps/route")
async def route(payload: RouteRequest, request: Request):
    params = {"origin": ",".join(f"{v:.6f}" for v in payload.origin), "destination": ",".join(f"{v:.6f}" for v in payload.destination), "show_fields": "cost,polyline"}
    if payload.mode == "transit":
        if not payload.citycode:
            raise HTTPException(422, "公交规划需要地点所在城市编码，请重新搜索选择地点。")
        params.update(city1=payload.citycode, city2=payload.destination_citycode or payload.citycode, AlternativeRoute="1")
    throttle(request)
    endpoint = "transit/integrated" if payload.mode == "transit" else payload.mode
    result = await provider(f"v5/direction/{endpoint}", params)
    try:
        routes = result["route"].get("transits" if payload.mode == "transit" else "paths", [])
        if not routes:
            raise HTTPException(404, "未找到此交通方式的路线，可尝试其他方式。")
        path = routes[0]
        distance = int(path["distance"])
        duration = int(path["cost"]["duration"])
        if distance < 0 or duration < 0:
            raise ValueError("negative route values")
        return {"mode": payload.mode, "distance_meters": distance, "duration_seconds": duration, "polyline": geometry(path, payload.mode)}
    except (KeyError, ValueError, TypeError, AttributeError):
        raise HTTPException(502, "路线数据不完整，未生成预计耗时。请重试。") from None


@router.get("/_AMapService/{path:path}")
async def js_proxy(path: str, request: Request):
    # Only SDK-owned support requests are allowed; POI/routing use our validated APIs.
    if path not in ("v4/map/styles", "v4/map/styles/", "v4/map/styles/texture", "v3/log/init"):
        raise HTTPException(404, "不支持此地图代理请求。")
    key, secret = os.getenv("AMAP_JS_KEY", "").strip(), os.getenv("AMAP_JS_SECURITY_CODE", "").strip()
    if not key or not secret:
        raise HTTPException(503, "地图展示服务未配置。")
    if request.query_params.get("key") != key or len(request.url.query) > 4096:
        raise HTTPException(403, "地图请求无效。")
    throttle(request)
    params = {k: v for k, v in request.query_params.items() if k not in ("jscode", "callback")}
    params["jscode"] = secret
    try:
        async with httpx.AsyncClient(timeout=8, follow_redirects=False) as client:
            response = await client.get(f"https://webapi.amap.com/{path}", params=params)
            response.raise_for_status()
    except httpx.HTTPError:
        raise HTTPException(502, "地图样式加载失败。") from None
    return Response(response.content, media_type=response.headers.get("content-type", "application/json"), headers={"Cache-Control": "no-store"})
