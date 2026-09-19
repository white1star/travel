from typing import Literal

from pydantic import BaseModel, Field


class TripRequest(BaseModel):
    origin: str = Field(min_length=1)
    destinations: list[str] = Field(min_length=1)
    date_mode: Literal["fixed", "flexible"]
    start_date: str | None = None
    days: int = Field(ge=1, le=30)
    travelers: int = Field(ge=1, le=20)
    budget_per_person: int = Field(ge=0)
    pace: Literal["compact", "balanced", "relaxed"]
    interests: list[str] = Field(default_factory=list)
    required_places: list[str] = Field(default_factory=list)
    return_to_origin: bool = True


class ItineraryItem(BaseModel):
    time: str
    end_time: str
    name: str
    category: str
    duration_minutes: int
    transport: str | None = None
    transport_minutes: int | None = None
    description: str
    cost: int = 0
    locked: bool = False
    verified_hours: bool = True
    notice: str | None = None
    coordinate: tuple[float, float]


class ItineraryDay(BaseModel):
    day: int
    date: str | None
    city: str
    title: str
    intensity: Literal["轻松", "适中", "紧凑"]
    items: list[ItineraryItem]


class BudgetSummary(BaseModel):
    total_available: int
    estimated_total: int
    remaining: int
    transport: int
    lodging: int
    tickets: int
    local_transport: int
    food: int


class Itinerary(BaseModel):
    id: str
    title: str
    travelers: int
    route: list[str]
    days: list[ItineraryDay]
    budget: BudgetSummary
    generated_at: str
    data_notice: str
