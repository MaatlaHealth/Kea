"use client";

import * as React from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { FlaskConical, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { recalculatePredictionAction } from "@/server/actions/prediction";
import { idleState, type ActionState } from "@/server/action-result";
import { featureLabel } from "@/lib/prediction/labels";
import { formatDateTime } from "@/lib/utils";

export type PredictionView = {
  score: string;
  band: string;
  modelName: string;
  modelVersion: string;
  clinicallyValidated: boolean;
  trainedOnRealData: boolean;
  contributingFactors: { feature: string; direction: "increases" | "decreases"; weight: number }[];
  missingFeatures: string[];
  calculatedAt: string;
};

const BAND_LABEL: Record<string, string> = {
  lower: "Lower estimated likelihood of non-attendance",
  moderate: "Moderate estimated likelihood of non-attendance",
  higher: "Higher estimated likelihood of non-attendance",
};

/**
 * Experimental prediction display.
 *
 * The score is always shown with its model version, its validation state and
 * the time it was calculated. It is never styled as a clinical risk level and
 * never sits next to clinical priority controls.
 */
export function PredictionPanel({
  referralId,
  prediction,
  enabled,
}: {
  referralId: string;
  prediction: PredictionView | null;
  enabled: boolean;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    recalculatePredictionAction,
    idleState,
  );

  React.useEffect(() => {
    if (state.status === "success") {
      toast.success(state.message ?? "Recalculated.");
      router.refresh();
    } else if (state.status === "error") {
      toast.error(state.message);
    }
  }, [state, router]);

  if (!enabled && !prediction) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">Prediction service is off</p>
        <p className="mt-1 leading-relaxed">
          Coordination priority is being set by the operational rules only. The product does not
          depend on the model.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50/70 p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <FlaskConical className="size-4 text-amber-800" />
          <p className="text-sm font-semibold text-amber-900">Experimental, not validated</p>
        </div>
        <form action={formAction}>
          <input type="hidden" name="referralId" value={referralId} />
          <Button type="submit" variant="ghost" size="sm" loading={pending} disabled={!enabled}>
            <RefreshCw />
            Recalculate
          </Button>
        </form>
      </div>

      <p className="mb-4 text-xs leading-relaxed text-amber-900/90">
        This score estimates the likelihood that a booked appointment is not attended, using
        referral workflow features only. It is not a clinical risk assessment, it does not reflect
        the health of the patient, and it must not influence clinical priority. Clinical urgency
        stays with the clinician.
      </p>

      {!prediction ? (
        <p className="text-sm text-amber-900">
          No score has been calculated for this referral yet.
        </p>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-baseline gap-3">
            <span className="font-display text-3xl font-semibold tabular-nums text-amber-900">
              {(Number(prediction.score) * 100).toFixed(0)}%
            </span>
            <Badge variant="warning">{BAND_LABEL[prediction.band] ?? prediction.band}</Badge>
          </div>

          {prediction.contributingFactors.length > 0 ? (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-900/80">
                Main contributing factors
              </p>
              <ul className="space-y-1.5">
                {prediction.contributingFactors.slice(0, 5).map((factor) => (
                  <li
                    key={factor.feature}
                    className="flex items-center justify-between gap-3 text-sm text-amber-900"
                  >
                    <span>{featureLabel(factor.feature)}</span>
                    <span className="shrink-0 text-xs font-medium">
                      {factor.direction === "increases" ? "increases" : "decreases"} the estimate
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {prediction.missingFeatures.length > 0 ? (
            <div className="rounded border border-amber-300 bg-amber-100/60 p-3">
              <p className="text-xs font-semibold text-amber-900">Missing inputs</p>
              <p className="mt-1 text-xs leading-relaxed text-amber-900/90">
                {prediction.missingFeatures.map((name) => featureLabel(name)).join(", ")}. The
                estimate is less reliable when inputs are missing.
              </p>
            </div>
          ) : null}

          <dl className="grid gap-1 border-t border-amber-300 pt-3 text-xs text-amber-900/90">
            <div className="flex justify-between gap-3">
              <dt>Model</dt>
              <dd className="font-mono">
                {prediction.modelName} {prediction.modelVersion}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt>Trained on real data</dt>
              <dd>{prediction.trainedOnRealData ? "Yes" : "No, synthetic data only"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt>Clinically validated</dt>
              <dd>{prediction.clinicallyValidated ? "Yes" : "No"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt>Last calculated</dt>
              <dd>{formatDateTime(prediction.calculatedAt)}</dd>
            </div>
          </dl>
        </div>
      )}
    </div>
  );
}
