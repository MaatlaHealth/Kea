"""Synthetic data generation.

This exists so the engineering path from referral features to a scored,
versioned, explainable prediction can be built and tested without any real
patient data.

It is a generator, not a dataset. The relationships it encodes are plausible
operational assumptions chosen by the authors, not findings from a study.
A model trained on this data tells you that the pipeline works. It tells you
nothing whatsoever about real patients, and any performance figure produced
from it is a property of the generator, not evidence of clinical usefulness.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from .features import FEATURE_NAMES


def generate(n: int = 6000, seed: int = 20260101) -> pd.DataFrame:
    """Generates a synthetic referral attendance dataset.

    The label is drawn from a logistic function of the features plus noise, so
    the relationships are learnable but not perfectly recoverable.
    """
    rng = np.random.default_rng(seed)

    lead_time_days = np.clip(rng.gamma(shape=2.2, scale=7.0, size=n), 0, 120)
    travel_distance_km = np.clip(rng.gamma(shape=2.0, scale=14.0, size=n), 0.5, 220)
    priority_rank = rng.choice([0, 1, 2], size=n, p=[0.68, 0.27, 0.05])
    prior_missed = rng.poisson(lam=0.35, size=n)
    prior_attended = rng.poisson(lam=1.6, size=n)
    facility_missed_rate = np.clip(rng.normal(loc=0.18, scale=0.07, size=n), 0.02, 0.6)
    acknowledgement_delay_hours = np.clip(rng.gamma(shape=1.6, scale=18.0, size=n), 0.2, 400)
    appointment_weekday = rng.integers(low=0, high=7, size=n)
    reschedule_count = rng.poisson(lam=0.22, size=n)
    has_contact_number = rng.choice([0, 1], size=n, p=[0.07, 0.93])
    # A message can only be delivered when there is a number to send it to.
    message_delivered = np.where(
        has_contact_number == 1,
        rng.choice([0, 1], size=n, p=[0.22, 0.78]),
        0,
    )

    # Operational assumptions encoded in the generator, stated plainly:
    #  - a longer wait between booking and the date makes non attendance more likely
    #  - greater travel distance makes non attendance more likely
    #  - previous missed visits predict further missed visits
    #  - previous attended visits predict attendance
    #  - a delivered appointment message reduces non attendance
    #  - no contact number increases non attendance
    #  - weekend appointments are missed more often
    logit = (
        -1.85
        + 0.022 * lead_time_days
        + 0.0085 * travel_distance_km
        + 0.62 * prior_missed
        - 0.17 * prior_attended
        + 1.9 * facility_missed_rate
        + 0.0016 * acknowledgement_delay_hours
        + 0.34 * reschedule_count
        - 0.55 * message_delivered
        - 0.70 * has_contact_number
        - 0.28 * priority_rank
        + 0.45 * np.isin(appointment_weekday, [5, 6]).astype(float)
        + rng.normal(loc=0.0, scale=0.55, size=n)
    )

    probability = 1.0 / (1.0 + np.exp(-logit))
    did_not_attend = rng.binomial(1, probability)

    frame = pd.DataFrame(
        {
            "lead_time_days": np.round(lead_time_days, 2),
            "travel_distance_km": np.round(travel_distance_km, 2),
            "priority_rank": priority_rank.astype(float),
            "prior_missed_appointments": prior_missed.astype(float),
            "prior_attended_appointments": prior_attended.astype(float),
            "facility_missed_rate": np.round(facility_missed_rate, 4),
            "acknowledgement_delay_hours": np.round(acknowledgement_delay_hours, 2),
            "appointment_weekday": appointment_weekday.astype(float),
            "reschedule_count": reschedule_count.astype(float),
            "has_contact_number": has_contact_number.astype(float),
            "appointment_message_delivered": message_delivered.astype(float),
            "did_not_attend": did_not_attend.astype(int),
        }
    )

    # Keep the column order aligned with FEATURE_NAMES plus the label.
    return frame[[*FEATURE_NAMES, "did_not_attend"]]
