"""Feature definitions.

These names, their order and their meaning must match
`src/lib/prediction/features.ts` in the application. The feature set version is
sent with every request and rejected by the application if it does not match,
so the two cannot silently drift apart.

Excluded by design: age, race, income, marital status, HIV status, diagnosis,
reason for referral and every other clinical or protected characteristic. This
model exists to help prioritise coordination effort, not to profile patients.
"""

from __future__ import annotations

from dataclasses import dataclass

FEATURE_SET_VERSION = "referral-attendance-v1"

FEATURE_NAMES: tuple[str, ...] = (
    "lead_time_days",
    "travel_distance_km",
    "priority_rank",
    "prior_missed_appointments",
    "prior_attended_appointments",
    "facility_missed_rate",
    "acknowledgement_delay_hours",
    "appointment_weekday",
    "reschedule_count",
    "has_contact_number",
    "appointment_message_delivered",
)

FEATURE_DESCRIPTIONS: dict[str, str] = {
    "lead_time_days": "Days between the appointment being booked and the appointment date.",
    "travel_distance_km": (
        "Straight line distance between the referring and receiving facilities, "
        "used as a proxy for travel burden."
    ),
    "priority_rank": "Referral priority, where routine is 0, urgent is 1 and emergency is 2.",
    "prior_missed_appointments": "Appointments this patient did not attend in the past.",
    "prior_attended_appointments": "Appointments this patient did attend in the past.",
    "facility_missed_rate": (
        "Share of past appointments at the receiving facility that were not attended."
    ),
    "acknowledgement_delay_hours": "Hours between referral submission and acknowledgement.",
    "appointment_weekday": "Day of week of the appointment, where Monday is 0.",
    "reschedule_count": "Number of times this referral has been rebooked.",
    "has_contact_number": "Whether a usable phone number is on record, as 1 or 0.",
    "appointment_message_delivered": "Whether the appointment message reached the patient, as 1 or 0.",
}

# Values used when a feature is missing. The application reports which features
# were missing alongside the score, so that a user can see the estimate rested
# on an imputed value rather than a measurement.
FEATURE_DEFAULTS: dict[str, float] = {
    "lead_time_days": 14.0,
    "travel_distance_km": 25.0,
    "priority_rank": 0.0,
    "prior_missed_appointments": 0.0,
    "prior_attended_appointments": 0.0,
    "facility_missed_rate": 0.18,
    "acknowledgement_delay_hours": 24.0,
    "appointment_weekday": 2.0,
    "reschedule_count": 0.0,
    "has_contact_number": 1.0,
    "appointment_message_delivered": 0.0,
}

# Bands used to describe a score in words. These are presentation thresholds,
# not clinical thresholds, and they carry no clinical meaning.
BAND_LOWER_MAX = 0.25
BAND_MODERATE_MAX = 0.50


@dataclass(frozen=True)
class PreparedFeatures:
    """A complete feature vector plus the names that had to be imputed."""

    values: list[float]
    missing: list[str]


def prepare(raw: dict[str, float | None]) -> PreparedFeatures:
    """Orders, validates and imputes a feature mapping.

    Unknown keys are ignored rather than rejected, so that adding a feature to
    the application does not break a service that has not been redeployed yet.
    A missing or null value is imputed and reported.
    """
    values: list[float] = []
    missing: list[str] = []

    for name in FEATURE_NAMES:
        value = raw.get(name)
        if value is None:
            missing.append(name)
            values.append(FEATURE_DEFAULTS[name])
            continue
        try:
            values.append(float(value))
        except (TypeError, ValueError):
            missing.append(name)
            values.append(FEATURE_DEFAULTS[name])

    return PreparedFeatures(values=values, missing=missing)


def band_for(score: float) -> str:
    if score < BAND_LOWER_MAX:
        return "lower"
    if score < BAND_MODERATE_MAX:
        return "moderate"
    return "higher"
