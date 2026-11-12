"""HTTP interface for the prediction service.

Run with: uvicorn kea_prediction.app:app --port 8000

The service holds no patient data. It receives a feature vector, returns a
score, and stores nothing. The application decides whether to persist the
result and whether to show it at all.
"""

from __future__ import annotations

import logging
import os
import secrets
import time
from typing import Annotated

from fastapi import Depends, FastAPI, Header, HTTPException, status
from pydantic import BaseModel, Field

from . import __version__
from .features import FEATURE_DESCRIPTIONS, FEATURE_NAMES, FEATURE_SET_VERSION
from .model import ModelNotTrained, load_model, model_is_available

logger = logging.getLogger("kea.prediction")
logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO"))

app = FastAPI(
    title="Kea referral non-attendance service",
    version=__version__,
    description=(
        "Experimental. Estimates the likelihood that a booked referral appointment "
        "is not attended, from referral workflow features only. Not validated for "
        "patient care. Does not diagnose and does not assign clinical urgency."
    ),
)

SERVICE_TOKEN = os.environ.get("PREDICTION_SERVICE_TOKEN")


def require_token(authorization: Annotated[str | None, Header()] = None) -> None:
    """Shared secret check.

    When no token is configured the service is open, which is only appropriate
    on a private network or a local machine. The deployment guide says so.
    """
    if not SERVICE_TOKEN:
        return
    expected = f"Bearer {SERVICE_TOKEN}"
    if authorization is None or not secrets.compare_digest(authorization, expected):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authorised.")


class PredictRequest(BaseModel):
    feature_set_version: str = Field(..., max_length=40)
    features: dict[str, float | None]


class ContributionOut(BaseModel):
    feature: str
    direction: str
    weight: float


class PredictResponse(BaseModel):
    model_name: str
    model_version: str
    feature_set_version: str
    algorithm: str
    clinically_validated: bool
    trained_on_real_data: bool
    score: float
    band: str
    contributing_factors: list[ContributionOut]
    missing_features: list[str]


@app.get("/health")
def health() -> dict[str, object]:
    if not model_is_available():
        return {
            "status": "no_model",
            "feature_set_version": FEATURE_SET_VERSION,
            "detail": "No trained artefact. Run python -m kea_prediction.train.",
        }
    model = load_model()
    return {
        "status": "ok",
        "model_name": model.name,
        "model_version": model.version,
        "feature_set_version": model.feature_set_version,
        "algorithm": model.algorithm,
        "clinically_validated": model.clinically_validated,
        "trained_on_real_data": model.trained_on_real_data,
    }


@app.get("/features")
def features() -> dict[str, object]:
    """Publishes the feature contract so the application can be checked against it."""
    return {
        "feature_set_version": FEATURE_SET_VERSION,
        "features": [
            {"name": name, "description": FEATURE_DESCRIPTIONS[name]} for name in FEATURE_NAMES
        ],
        "excluded": [
            "age",
            "race",
            "income",
            "marital_status",
            "hiv_status",
            "diagnosis",
            "reason_for_referral",
        ],
        "notice": (
            "Protected and clinical characteristics are excluded by design, "
            "including where they might be predictive."
        ),
    }


@app.post("/predict", response_model=PredictResponse, dependencies=[Depends(require_token)])
def predict(request: PredictRequest) -> PredictResponse:
    if request.feature_set_version != FEATURE_SET_VERSION:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Feature set version mismatch. This service serves "
                f"{FEATURE_SET_VERSION}, the caller sent {request.feature_set_version}."
            ),
        )

    try:
        model = load_model()
    except ModelNotTrained as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(error)
        ) from error

    started = time.perf_counter()
    prediction = model.predict(request.features)
    duration_ms = (time.perf_counter() - started) * 1000

    # Performance monitoring: the log records timing, the model version and how
    # many inputs were missing. It never records a feature value, because a
    # feature vector plus a timestamp can identify a referral.
    logger.info(
        "prediction served model=%s version=%s missing=%d duration_ms=%.2f",
        model.name,
        model.version,
        len(prediction.missing),
        duration_ms,
    )

    return PredictResponse(
        model_name=model.name,
        model_version=model.version,
        feature_set_version=model.feature_set_version,
        algorithm=model.algorithm,
        clinically_validated=model.clinically_validated,
        trained_on_real_data=model.trained_on_real_data,
        score=round(prediction.score, 4),
        band=prediction.band,
        contributing_factors=[
            ContributionOut(feature=c.feature, direction=c.direction, weight=c.weight)
            for c in prediction.contributions
        ],
        missing_features=prediction.missing,
    )
