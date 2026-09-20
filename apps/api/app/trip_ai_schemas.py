from pydantic import BaseModel, Field, field_validator

from .recommendation_schemas import TIME_PATTERN
from .schemas import Itinerary


class ModelTripItem(BaseModel):
    candidate_id: str = Field(min_length=1, max_length=100)
    time: str
    duration_minutes: int = Field(ge=15, le=360)
    cost: float = Field(ge=0, le=100000, allow_inf_nan=False)
    reason: str = Field(min_length=1, max_length=120)

    @field_validator("time")
    @classmethod
    def valid_time(cls, value: str) -> str:
        if not TIME_PATTERN.fullmatch(value):
            raise ValueError("invalid time")
        return value

    @field_validator("reason")
    @classmethod
    def strip_reason(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("blank reason")
        return value


class ModelTripDay(BaseModel):
    day: int = Field(ge=1, le=30)
    title: str = Field(min_length=1, max_length=80)
    items: list[ModelTripItem] = Field(min_length=1, max_length=5)


class ModelTripEnvelope(BaseModel):
    days: list[ModelTripDay] = Field(min_length=1, max_length=30)
    summary: str = Field(default="", max_length=200)
    warnings: list[str] = Field(default_factory=list, max_length=8)


class AiTripPlanResponse(BaseModel):
    itinerary: Itinerary
    notices: list[str]
