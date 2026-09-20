from datetime import date, datetime, timedelta, timezone
from math import ceil
from uuid import uuid4

from .demo_catalog import DEMO_PLACES
from .schemas import BudgetSummary, Itinerary, ItineraryDay, ItineraryItem, TripRequest


def _date_for_day(request: TripRequest, day_index: int) -> str | None:
    if request.date_mode != "fixed" or not request.start_date:
        return None
    return (date.fromisoformat(request.start_date) + timedelta(days=day_index)).isoformat()


def _places_for_day(city: str, day_index: int) -> list[dict[str, object]]:
    catalog = DEMO_PLACES.get(city, [])
    if not catalog:
        return []
    start = (day_index * 2) % len(catalog)
    return [catalog[start], catalog[(start + 1) % len(catalog)]]


def _required_item(name: str, city: str) -> ItineraryItem:
    return ItineraryItem(
        time="10:00",
        end_time="11:30",
        name=name,
        category="必去地点",
        duration_minutes=90,
        description="用户指定的必去地点，正式版将通过地图服务校验定位与开放信息。",
        cost=0,
        locked=True,
        verified_hours=False,
        notice="需出发前确认",
        coordinate=(0, 0),
    )


def _catalog_item(place: dict[str, object], slot: int, locked: bool) -> ItineraryItem:
    times = [("10:00", "11:30"), ("13:30", "15:30"), ("16:10", "17:30")]
    start, end = times[min(slot, len(times) - 1)]
    verified = bool(place["verified_hours"])
    return ItineraryItem(
        time=start,
        end_time=end,
        name=str(place["name"]),
        category=str(place["category"]),
        duration_minutes=90 if slot == 0 else 120,
        transport="步行 / 公共交通" if slot else None,
        transport_minutes=20 if slot else None,
        description=str(place["description"]),
        cost=int(place["cost"]),
        locked=locked,
        verified_hours=verified,
        notice=None if verified else "需出发前确认",
        coordinate=place["coordinate"],
    )


def _build_budget(request: TripRequest, ticket_total: int) -> BudgetSummary:
    travelers = request.travelers
    nights = max(request.days - 1, 0)
    transport = 450 * travelers
    lodging = 460 * nights * ceil(travelers / 2)
    local_transport = 40 * request.days * travelers
    food = 150 * request.days * travelers
    tickets = ticket_total * travelers
    estimated = transport + lodging + local_transport + food + tickets
    available = request.budget_per_person * travelers
    allocations = {
        "transport": round(available * 0.20),
        "lodging": round(available * 0.30),
        "food": round(available * 0.20),
        "tickets": round(available * 0.15),
        "local_transport": round(available * 0.05),
    }
    allocations["other"] = available - sum(allocations.values())
    return BudgetSummary(
        total_available=available,
        estimated_total=estimated,
        remaining=available - estimated,
        transport=transport,
        lodging=lodging,
        tickets=tickets,
        local_transport=local_transport,
        food=food,
        other=0,
        allocations=allocations,
    )


def build_itinerary(request: TripRequest) -> Itinerary:
    route = [request.origin, *request.destinations]
    if request.return_to_origin:
        route.append(request.origin)

    days: list[ItineraryDay] = []
    required_remaining = list(request.required_places)
    ticket_total = 0
    for day_index in range(request.days):
        city_index = min(day_index * len(request.destinations) // request.days, len(request.destinations) - 1)
        city = request.destinations[city_index]
        selected_places = _places_for_day(city, day_index)
        items: list[ItineraryItem] = []

        if required_remaining and day_index == 0:
            required_name = required_remaining.pop(0)
            matched = next((place for place in DEMO_PLACES.get(city, []) if place["name"] == required_name), None)
            items.append(_catalog_item(matched, 0, True) if matched else _required_item(required_name, city))

        for place in selected_places:
            if any(existing.name == place["name"] for existing in items):
                continue
            items.append(_catalog_item(place, len(items), False))
        ticket_total += sum(item.cost for item in items)

        days.append(
            ItineraryDay(
                day=day_index + 1,
                date=_date_for_day(request, day_index),
                city=city,
                title=f"{city} · {'初见古城' if day_index == 0 else '从容漫游'}",
                intensity={"compact": "紧凑", "balanced": "适中", "relaxed": "轻松"}[request.pace],
                items=items,
            )
        )

    city_title = "".join(request.destinations)
    return Itinerary(
        id=f"trip_{uuid4().hex[:10]}",
        title=f"{city_title}{request.days}日游",
        travelers=request.travelers,
        route=route,
        days=days,
        budget=_build_budget(request, ticket_total),
        generated_at=datetime.now(timezone(timedelta(hours=8))).isoformat(),
        data_notice="当前为演示规划，营业时间与票价需在出发前确认。",
    )
