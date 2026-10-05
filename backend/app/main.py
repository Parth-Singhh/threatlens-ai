from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import check_database_connection


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="Backend API for the ThreatLens AI cybersecurity incident management platform.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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
