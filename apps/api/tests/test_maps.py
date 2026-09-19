import httpx
import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture(autouse=True)
def keys(monkeypatch):
    for name in ("AMAP_WEB_SERVICE_KEY", "AMAP_JS_KEY", "AMAP_JS_SECURITY_CODE"):
        monkeypatch.delenv(name, raising=False)


def upstream(monkeypatch, payload):
    async def get(self, url, *, params):
        assert url.startswith("https://restapi.amap.com/")
        assert params["key"] == "server-secret"
        return httpx.Response(200, json=payload, request=httpx.Request("GET", url))
    monkeypatch.setattr(httpx.AsyncClient, "get", get)
    monkeypatch.setenv("AMAP_WEB_SERVICE_KEY", "server-secret")


def test_status_discloses_availability_but_not_secrets(monkeypatch):
    monkeypatch.setenv("AMAP_WEB_SERVICE_KEY", "server-secret")
    monkeypatch.setenv("AMAP_JS_KEY", "public-js-key")
    monkeypatch.setenv("AMAP_JS_SECURITY_CODE", "security-secret")
    response = TestClient(app).get("/api/maps/status")
    assert response.status_code == 200
    assert response.json() == {"search_available": True, "map_available": True, "js_key": "public-js-key"}
    assert "server-secret" not in response.text and "security-secret" not in response.text


def test_unconfigured_search_returns_explicit_error():
    response = TestClient(app).get("/api/maps/places", params={"query": "博物馆", "city": "苏州"})
    assert response.status_code == 503
    assert "未配置" in response.json()["detail"]


def test_search_is_city_scoped_and_discards_invalid_locations(monkeypatch):
    async def get(self, url, *, params):
        assert params["region"] == "苏州"
        assert params["city_limit"] == "true"
        assert params["keywords"] == "博物馆"
        return httpx.Response(200, json={"status": "1", "pois": [
            {"id": "B001", "name": "苏州博物馆", "location": "120.6277,31.3241", "address": "东北街204号", "citycode": "0512", "type": "科教文化服务;博物馆"},
            {"id": "bad", "name": "缺少定位", "location": ""},
        ]}, request=httpx.Request("GET", url))
    monkeypatch.setenv("AMAP_WEB_SERVICE_KEY", "server-secret")
    monkeypatch.setattr(httpx.AsyncClient, "get", get)
    response = TestClient(app).get("/api/maps/places", params={"query": " 博物馆 ", "city": "苏州"})
    assert response.status_code == 200
    assert response.json()["places"] == [{"id": "B001", "name": "苏州博物馆", "coordinate": [120.6277, 31.3241], "address": "东北街204号", "citycode": "0512", "category": "科教文化服务;博物馆"}]


@pytest.mark.anyio
async def test_search_place_candidates_matches_public_place_parsing(monkeypatch):
    from app.maps import search_place_candidates

    async def get(self, url, *, params):
        return httpx.Response(200, json={"status": "1", "pois": [
            {"id": "B001", "name": "苏州博物馆", "location": "120.6277,31.3241", "address": "东北街204号", "citycode": "0512", "type": "科教文化服务;博物馆"},
            {"id": "bad", "name": "缺少定位", "location": ""},
        ]}, request=httpx.Request("GET", url))

    monkeypatch.setenv("AMAP_WEB_SERVICE_KEY", "server-secret")
    monkeypatch.setattr(httpx.AsyncClient, "get", get)

    places = await search_place_candidates("苏州", "博物馆")

    assert [place.model_dump() for place in places] == [{"id": "B001", "name": "苏州博物馆", "coordinate": (120.6277, 31.3241), "address": "东北街204号", "citycode": "0512", "category": "科教文化服务;博物馆"}]


def test_provider_failure_is_not_a_successful_empty_result(monkeypatch):
    upstream(monkeypatch, {"status": "0", "info": "INVALID_USER_KEY", "infocode": "10001"})
    response = TestClient(app).get("/api/maps/places", params={"query": "园林", "city": "苏州"})
    assert response.status_code == 502
    assert "server-secret" not in response.text


@pytest.mark.parametrize("mode", ["walking", "driving", "transit"])
def test_route_returns_duration_distance_and_road_geometry(monkeypatch, mode):
    path = {"distance": "850", "cost": {"duration": "620"}, "steps": [{"polyline": "120.62,31.32;120.63,31.33"}]}
    if mode == "transit":
        path = {"distance": "850", "cost": {"duration": "620"}, "segments": [{"walking": {"steps": [{"polyline": "120.62,31.32;120.63,31.33"}]}}]}
    upstream(monkeypatch, {"status": "1", "route": {"transits" if mode == "transit" else "paths": [path]}})
    response = TestClient(app).post("/api/maps/route", json={"origin": [120.62, 31.32], "destination": [120.63, 31.33], "mode": mode, "citycode": "0512"})
    assert response.status_code == 200
    assert response.json() == {"mode": mode, "distance_meters": 850, "duration_seconds": 620, "polyline": [[120.62, 31.32], [120.63, 31.33]]}


def test_route_does_not_invent_a_result_when_no_route_found(monkeypatch):
    upstream(monkeypatch, {"status": "1", "route": {"paths": []}})
    response = TestClient(app).post("/api/maps/route", json={"origin": [120.62, 31.32], "destination": [120.63, 31.33], "mode": "walking"})
    assert response.status_code == 404


def test_invalid_route_and_blank_search_are_rejected():
    client = TestClient(app)
    assert client.post("/api/maps/route", json={"origin": [0, 0], "destination": [200, 90], "mode": "walking"}).status_code == 422
    assert client.get("/api/maps/places", params={"query": "  ", "city": "苏州"}).status_code == 422


def test_development_origin_3001_can_access_api():
    response = TestClient(app).options("/api/maps/route", headers={"Origin": "http://127.0.0.1:3001", "Access-Control-Request-Method": "POST"})
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://127.0.0.1:3001"


def test_js_proxy_cannot_be_used_as_an_arbitrary_api_proxy(monkeypatch):
    monkeypatch.setenv("AMAP_JS_KEY", "public-js-key")
    monkeypatch.setenv("AMAP_JS_SECURITY_CODE", "security-secret")
    response = TestClient(app).get("/_AMapService/v3/place/text", params={"key": "public-js-key"})
    assert response.status_code == 404


def test_js_proxy_allows_only_the_sdk_log_endpoint_without_exposing_security_code(monkeypatch):
    async def get(self, url, *, params):
        assert url == "https://webapi.amap.com/v3/log/init"
        assert params["key"] == "public-js-key"
        assert params["jscode"] == "security-secret"
        assert "callback" not in params
        return httpx.Response(
            200,
            content=b'{"status":"1"}',
            headers={"content-type": "application/json"},
            request=httpx.Request("GET", url),
        )

    monkeypatch.setenv("AMAP_JS_KEY", "public-js-key")
    monkeypatch.setenv("AMAP_JS_SECURITY_CODE", "security-secret")
    monkeypatch.setattr(httpx.AsyncClient, "get", get)

    response = TestClient(app).get(
        "/_AMapService/v3/log/init",
        params={"key": "public-js-key", "callback": "unsafe", "eventId": "resource.load"},
    )

    assert response.status_code == 200
    assert response.json() == {"status": "1"}
    assert "security-secret" not in response.text


def test_unknown_required_place_is_not_given_an_unrelated_poi_coordinate():
    from app.planner import build_itinerary
    from test_planner import sample_request
    request = sample_request()
    request.required_places = ["尚未收录的集合点"]
    result = build_itinerary(request)
    item = next(item for day in result.days for item in day.items if item.name == "尚未收录的集合点")
    assert item.coordinate == (0, 0)


@pytest.mark.parametrize("mode", ["walking", "transit"])
def test_missing_middle_geometry_is_not_bridged_with_an_invented_line(monkeypatch, mode):
    before, after = {"polyline": "120.62,31.32;120.63,31.33"}, {"polyline": "120.64,31.34;120.65,31.35"}
    path = {"distance": "900", "cost": {"duration": "660"}, "steps": [before, {"instruction": "坐标未返回"}, after]}
    if mode == "transit":
        path = {"distance": "900", "cost": {"duration": "660"}, "segments": [{"walking": {"steps": [before]}}, {"railway": {"name": "列车", "distance": "400"}}, {"walking": {"steps": [after]}}]}
    upstream(monkeypatch, {"status": "1", "route": {"transits" if mode == "transit" else "paths": [path]}})
    response = TestClient(app).post("/api/maps/route", json={"origin": [120.62,31.32], "destination": [120.65,31.35], "mode": mode, "citycode": "0512"})
    assert response.status_code == 200
    assert response.json()["duration_seconds"] == 660
    assert response.json()["polyline"] == []
