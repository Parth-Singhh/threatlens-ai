from fastapi import APIRouter, HTTPException, status

from app.api.deps import CurrentUser
from app.schemas.analysis import URLAnalysisRequest, URLAnalysisResponse
from app.services.url_model import ModelNotReadyError, analyze_url

router = APIRouter(prefix="/api/analysis", tags=["AI Analysis"])


@router.post("/url", response_model=URLAnalysisResponse)
def analyze_url_endpoint(
    payload: URLAnalysisRequest,
    current_user: CurrentUser,
) -> URLAnalysisResponse:
    """Analyze a submitted URL with the trained MLP model. Requires login."""
    del current_user  # Authentication is required; role-specific UI is handled separately.
    try:
        result = analyze_url(payload.url)
    except ModelNotReadyError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
    return URLAnalysisResponse.model_validate(result)
