"""Model loading and scoring.

The served model is the logistic baseline, so a contributing factor can be
explained from the standardised coefficient times the standardised feature
value. That is a faithful account of how this model reached this score, not a
post hoc approximation.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from threading import Lock
from typing import Any

import joblib
import numpy as np

from .features import FEATURE_NAMES, FEATURE_SET_VERSION, band_for, prepare

ARTIFACT_DIR = Path(__file__).resolve().parent.parent / "artifacts"
MODEL_PATH = ARTIFACT_DIR / "model.joblib"
METADATA_PATH = ARTIFACT_DIR / "model-metadata.json"

_lock = Lock()
_loaded: LoadedModel | None = None


class ModelNotTrained(RuntimeError):
    """Raised when no artefact is present. Train the model first."""


@dataclass
class Contribution:
    feature: str
    direction: str
    weight: float


@dataclass
class Prediction:
    score: float
    band: str
    contributions: list[Contribution]
    missing: list[str]


@dataclass
class LoadedModel:
    pipeline: Any
    metadata: dict[str, Any]

    @property
    def version(self) -> str:
        return str(self.metadata.get("model_version", "unknown"))

    @property
    def name(self) -> str:
        return str(self.metadata.get("model_name", "referral-non-attendance"))

    @property
    def algorithm(self) -> str:
        return str(self.metadata.get("algorithm", "logistic_regression"))

    @property
    def feature_set_version(self) -> str:
        return str(self.metadata.get("feature_set_version", FEATURE_SET_VERSION))

    @property
    def trained_on_real_data(self) -> bool:
        return bool(self.metadata.get("trained_on_real_data", False))

    @property
    def clinically_validated(self) -> bool:
        return bool(self.metadata.get("clinically_validated", False))

    def predict(self, raw: dict[str, float | None]) -> Prediction:
        prepared = prepare(raw)
        vector = np.array([prepared.values], dtype=float)
        score = float(self.pipeline.predict_proba(vector)[0, 1])

        contributions = self._contributions(prepared.values)

        return Prediction(
            score=score,
            band=band_for(score),
            contributions=contributions,
            missing=prepared.missing,
        )

    def _contributions(self, values: list[float]) -> list[Contribution]:
        """Per feature contribution for the logistic baseline.

        Returns an empty list for any other algorithm rather than inventing an
        explanation the model cannot support.
        """
        if self.algorithm != "logistic_regression":
            return []

        try:
            scaler = self.pipeline.named_steps["scale"]
            model = self.pipeline.named_steps["model"]
        except (AttributeError, KeyError):
            return []

        standardised = (np.array(values, dtype=float) - scaler.mean_) / scaler.scale_
        effects = standardised * model.coef_[0]

        ranked = sorted(
            zip(FEATURE_NAMES, effects, strict=False),
            key=lambda pair: abs(float(pair[1])),
            reverse=True,
        )

        return [
            Contribution(
                feature=name,
                direction="increases" if float(effect) >= 0 else "decreases",
                weight=round(float(effect), 4),
            )
            for name, effect in ranked[:6]
            if abs(float(effect)) > 1e-6
        ]


def load_model(force: bool = False) -> LoadedModel:
    global _loaded
    with _lock:
        if _loaded is not None and not force:
            return _loaded

        if not MODEL_PATH.exists() or not METADATA_PATH.exists():
            raise ModelNotTrained(
                "No trained model artefact found. Run `python -m kea_prediction.train` first."
            )

        pipeline = joblib.load(MODEL_PATH)
        metadata = json.loads(METADATA_PATH.read_text(encoding="utf-8"))
        _loaded = LoadedModel(pipeline=pipeline, metadata=metadata)
        return _loaded


def model_is_available() -> bool:
    return MODEL_PATH.exists() and METADATA_PATH.exists()
