import re
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator


TIME_PATTERN = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")


def clock_minutes(value: str) -> int:
    hours, minutes = map(int, value.split(":"))
    return hours * 60 + minutes


class ExistingItemSummary(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    time: str
    end_time: str
    poi_id: str | None = Field(default=None, max_length=100)

    @field_validator("name")
    @classmethod
    def strip_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("blank name")
        return value

    @field_validator("time", "end_time")
    @classmethod
    def valid_time(cls, value: str) -> str:
        if not TIME_PATTERN.fullmatch(value):
            raise ValueError("invalid time")
        return value

    @model_validator(mode="after")
    def chronological(self):
        if clock_minutes(self.end_time) <= clock_minutes(self.time):
            raise ValueError("end time must follow start time")
        return self


class DayRecommendationRequest(BaseModel):
    city: str = Field(min_length=1, max_length=50)
    date: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    intensity: Literal["轻松", "适中", "紧凑"]
    travelers: int = Field(ge=1, le=20)
    remaining_budget_total: float = Field(ge=0, allow_inf_nan=False)
    existing_items: list[ExistingItemSummary] = Field(default_factory=list, max_length=20)
    request: str = Field(default="", max_length=300)

    @field_validator("city")
    @classmethod
    def strip_city(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("blank city")
        return value

    @field_validator("request")
    @classmethod
    def strip_request(cls, value: str) -> str:
        return value.strip()


class PlaceCandidate(BaseModel):
    id: str = Field(min_length=1, max_length=100)
    name: str = Field(min_length=1, max_length=120)
    address: str = Field(default="", max_length=300)
    citycode: str = Field(default="", max_length=10)
    coordinate: tuple[float, float]
    category: str = Field(default="地点", max_length=200)


class ModelRecommendation(BaseModel):
    candidate_id: str = Field(min_length=1, max_length=100)
    time: str
    duration_minutes: int = Field(ge=15, le=360)
    cost: float = Field(ge=0, le=100000, allow_inf_nan=False)
    reason: str = Field(min_length=1, max_length=120)

    @field_validator("time")
    @classmethod
    def valid_start_time(cls, value: str) -> str:
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


class ModelRecommendationEnvelope(BaseModel):
    recommendations: list[ModelRecommendation] = Field(min_length=1, max_length=5)
    summary: str = Field(default="", max_length=160)
    warnings: list[str] = Field(default_factory=list, max_length=5)


class DayRecommendation(BaseModel):
    poi_id: str
    name: str
    address: str
    citycode: str
    coordinate: tuple[float, float]
    category: str
    time: str
    end_time: str
    duration_minutes: int
    cost: float
    reason: str
    notice: str


class DayRecommendationResponse(BaseModel):
    recommendations: list[DayRecommendation]
    summary: str
    warnings: list[str]
