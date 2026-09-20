import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .planner import build_itinerary
from .schemas import Itinerary, TripRequest
from .maps import router as maps_router
from .recommendations import router as recommendations_router
from .trip_ai import router as trip_ai_router

app = FastAPI(title="旅行规划 API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[value.strip() for value in os.getenv("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000,http://localhost:3001,http://127.0.0.1:3001").split(",") if value.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(maps_router)
app.include_router(recommendations_router)
app.include_router(trip_ai_router)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/trips/generate", response_model=Itinerary)
def generate_trip(request: TripRequest) -> Itinerary:
    return build_itinerary(request)
