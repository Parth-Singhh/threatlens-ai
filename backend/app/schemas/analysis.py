from typing import Literal
from pydantic import BaseModel, Field, field_validator

from app.services.url_features import normalize_url


class URLAnalysisRequest(BaseModel):
    url: str = Field(min_length=5, max_length=2048)

    @field_validator("url")
    @classmethod
    def validate_url(cls, value: str) -> str:
        return normalize_url(value)


class URLAnalysisResponse(BaseModel):
    url: str
    prediction: Literal["phishing", "legitimate"]
    phishing_probability: float = Field(ge=0.0, le=1.0)
    confidence: float = Field(ge=0.0, le=1.0)
    risk_level: Literal["high", "medium", "low", "uncertain"]
    model_name: str
    signals: list[str]
    explanation_note: str
