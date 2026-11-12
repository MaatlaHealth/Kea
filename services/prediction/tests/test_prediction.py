"""Tests for the prediction service.

These cover the feature contract, imputation, the API surface and the
behaviour the application depends on. They do not assert a performance
threshold, because a performance figure from synthetic data would be a
property of the generator and asserting it would give false assurance.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from kea_prediction.app import app
from kea_prediction.features import (
    FEATURE_DEFAULTS,
    FEATURE_NAMES,
    FEATURE_SET_VERSION,
    band_for,
    prepare,
)
from kea_prediction.model import model_is_available
from kea_prediction.synthetic import generate

client = TestClient(app)

COMPLETE_FEATURES = {
    "lead_time_days": 21.0,
    "travel_distance_km": 48.0,
    "priority_rank": 0,
    "prior_missed_appointments": 2,
    "prior_attended_appointments": 1,
    "facility_missed_rate": 0.24,
    "acknowledgement_delay_hours": 40.0,
    "appointment_weekday": 5,
    "reschedule_count": 1,
    "has_contact_number": 1,
    "appointment_message_delivered": 0,
}


def test_feature_defaults_cover_every_feature():
    assert set(FEATURE_DEFAULTS) == set(FEATURE_NAMES)


def test_prepare_orders_features_and_reports_nothing_missing():
    prepared = prepare(COMPLETE_FEATURES)
    assert prepared.missing == []
    assert len(prepared.values) == len(FEATURE_NAMES)
    assert prepared.values[0] == 21.0


def test_prepare_imputes_and_reports_missing_values():
    incomplete = dict(COMPLETE_FEATURES)
    incomplete["travel_distance_km"] = None
    del incomplete["facility_missed_rate"]

    prepared = prepare(incomplete)

    assert set(prepared.missing) == {"travel_distance_km", "facility_missed_rate"}
    index = FEATURE_NAMES.index("travel_distance_km")
    assert prepared.values[index] == FEATURE_DEFAULTS["travel_distance_km"]


def test_prepare_ignores_unknown_keys():
    prepared = prepare({**COMPLETE_FEATURES, "patient_age": 24, "race": "withheld"})
    assert prepared.missing == []
    assert len(prepared.values) == len(FEATURE_NAMES)


def test_prepare_treats_unparsable_values_as_missing():
    prepared = prepare({**COMPLETE_FEATURES, "lead_time_days": "not a number"})  # type: ignore[dict-item]
    assert "lead_time_days" in prepared.missing


def test_bands_are_ordered():
    assert band_for(0.05) == "lower"
    assert band_for(0.35) == "moderate"
    assert band_for(0.80) == "higher"


def test_synthetic_generator_is_deterministic():
    first = generate(n=200, seed=42)
    second = generate(n=200, seed=42)
    assert first.equals(second)
    assert list(first.columns)[:-1] == list(FEATURE_NAMES)
    assert set(first["did_not_attend"].unique()).issubset({0, 1})


def test_features_endpoint_publishes_the_contract():
    response = client.get("/features")
    assert response.status_code == 200
    body = response.json()
    assert body["feature_set_version"] == FEATURE_SET_VERSION
    assert [item["name"] for item in body["features"]] == list(FEATURE_NAMES)
    assert "race" in body["excluded"]


def test_health_reports_status():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] in {"ok", "no_model"}


def test_predict_rejects_a_feature_set_mismatch():
    response = client.post(
        "/predict",
        json={"feature_set_version": "referral-attendance-v0", "features": COMPLETE_FEATURES},
    )
    assert response.status_code == 409


@pytest.mark.skipif(not model_is_available(), reason="model artefact not built")
def test_predict_returns_a_scored_response():
    response = client.post(
        "/predict",
        json={"feature_set_version": FEATURE_SET_VERSION, "features": COMPLETE_FEATURES},
    )
    assert response.status_code == 200
    body = response.json()

    assert 0.0 <= body["score"] <= 1.0
    assert body["band"] in {"lower", "moderate", "higher"}
    assert body["feature_set_version"] == FEATURE_SET_VERSION
    assert body["clinically_validated"] is False
    assert body["trained_on_real_data"] is False
    assert body["missing_features"] == []
    assert len(body["contributing_factors"]) > 0
    for factor in body["contributing_factors"]:
        assert factor["feature"] in FEATURE_NAMES
        assert factor["direction"] in {"increases", "decreases"}


@pytest.mark.skipif(not model_is_available(), reason="model artefact not built")
def test_predict_reports_missing_features():
    incomplete = dict(COMPLETE_FEATURES)
    incomplete["travel_distance_km"] = None

    response = client.post(
        "/predict",
        json={"feature_set_version": FEATURE_SET_VERSION, "features": incomplete},
    )
    assert response.status_code == 200
    assert response.json()["missing_features"] == ["travel_distance_km"]


@pytest.mark.skipif(not model_is_available(), reason="model artefact not built")
def test_more_prior_missed_appointments_does_not_lower_the_score():
    def score_with(prior_missed: int) -> float:
        response = client.post(
            "/predict",
            json={
                "feature_set_version": FEATURE_SET_VERSION,
                "features": {**COMPLETE_FEATURES, "prior_missed_appointments": prior_missed},
            },
        )
        return response.json()["score"]

    assert score_with(4) >= score_with(0)
