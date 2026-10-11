from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes.auth import router as auth_router
from app.api.routes.incidents import router as incidents_router
from app.config import settings
from app.database import Base, check_database_connection, engine
from app.models import Incident, User  # noqa: F401 - register ORM model metadata


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    # Initial local-MVP schema setup. Add Alembic migrations before production.
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="Backend API for the ThreatLens AI cybersecurity incident management platform.",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(auth_router)
app.include_router(incidents_router)


@app.get("/")
def root() -> dict[str, str]:
    return {
        "name": "ThreatLens AI API",
        "version": settings.app_version,
        "status": "running",
    }


@app.get("/api/health")
def health() -> dict[str, object]:
    database_connected = check_database_connection()
    return {
        "status": "healthy" if database_connected else "degraded",
        "service": "threatlens-api",
        "database": "connected" if database_connected else "unavailable",
    }
