"""Model evaluation.

Run with: python -m kea_prediction.evaluate

Reports discrimination, calibration and subgroup behaviour on a held out split
of freshly generated synthetic data, using a different seed from training so
the evaluation is not scored on rows the model has seen.

Read the output as a check that the pipeline behaves sensibly. It is not
evidence about real patients.
"""

from __future__ import annotations

import argparse
import json

import numpy as np
from sklearn.metrics import (
    average_precision_score,
    brier_score_loss,
    confusion_matrix,
    roc_auc_score,
)

from .features import FEATURE_NAMES
from .model import ModelNotTrained, load_model
from .synthetic import generate


def calibration_table(y_true: np.ndarray, probabilities: np.ndarray, bins: int = 5):
    edges = np.linspace(0, 1, bins + 1)
    rows = []
    for index in range(bins):
        low, high = edges[index], edges[index + 1]
        mask = (probabilities >= low) & (probabilities < high if index < bins - 1 else probabilities <= high)
        count = int(mask.sum())
        if count == 0:
            rows.append({"range": f"{low:.2f}-{high:.2f}", "n": 0, "predicted": None, "observed": None})
            continue
        rows.append(
            {
                "range": f"{low:.2f}-{high:.2f}",
                "n": count,
                "predicted": round(float(probabilities[mask].mean()), 4),
                "observed": round(float(y_true[mask].mean()), 4),
            }
        )
    return rows


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate the trained model.")
    parser.add_argument("--rows", type=int, default=4000)
    parser.add_argument("--seed", type=int, default=20260615)
    parser.add_argument("--threshold", type=float, default=0.5)
    args = parser.parse_args()

    try:
        model = load_model(force=True)
    except ModelNotTrained as error:
        print(str(error))
        raise SystemExit(1) from error

    frame = generate(n=args.rows, seed=args.seed)
    x = frame[list(FEATURE_NAMES)].to_numpy(dtype=float)
    y = frame["did_not_attend"].to_numpy(dtype=int)

    probabilities = model.pipeline.predict_proba(x)[:, 1]
    predicted = (probabilities >= args.threshold).astype(int)

    tn, fp, fn, tp = confusion_matrix(y, predicted).ravel()

    report = {
        "model_name": model.name,
        "model_version": model.version,
        "algorithm": model.algorithm,
        "evaluation_data": "synthetic, generated with a different seed from training",
        "rows": int(args.rows),
        "threshold": args.threshold,
        "roc_auc": round(float(roc_auc_score(y, probabilities)), 4),
        "average_precision": round(float(average_precision_score(y, probabilities)), 4),
        "brier_score": round(float(brier_score_loss(y, probabilities)), 4),
        "positive_rate": round(float(y.mean()), 4),
        "confusion_matrix": {
            "true_negative": int(tn),
            "false_positive": int(fp),
            "false_negative": int(fn),
            "true_positive": int(tp),
        },
        "sensitivity": round(float(tp / (tp + fn)) if (tp + fn) else 0.0, 4),
        "specificity": round(float(tn / (tn + fp)) if (tn + fp) else 0.0, 4),
        "precision": round(float(tp / (tp + fp)) if (tp + fp) else 0.0, 4),
        "calibration": calibration_table(y, probabilities),
        "caveat": (
            "Synthetic evaluation. These numbers describe the data generator, not "
            "real patients, and are not evidence of clinical effectiveness."
        ),
    }

    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
