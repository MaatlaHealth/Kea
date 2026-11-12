import "server-only";

import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { modelVersions, predictions, referrals } from "@/db/schema";
import { env, integrations } from "@/lib/env";
import { IntegrationError } from "@/lib/errors";
import { buildFeatureVector, FEATURE_SET_VERSION, type FeatureName } from "./features";

/**
 * Prediction service client.
 *
 * The prediction service is optional. When it is not configured or not
 * reachable, the product carries on: coordinators prioritise using the
 * operational rules, which do not depend on any model.
 *
 * Scores are never presented as a clinical risk classification. The model
 * version, its validation state and the time of calculation are stored with
 * every prediction so that a displayed score can always be traced.
 */

const responseSchema = z.object({
  model_name: z.string().min(1).max(80),
  model_version: z.string().min(1).max(40),
  feature_set_version: z.string().min(1).max(40),
  algorithm: z.string().min(1).max(80),
  clinically_validated: z.boolean(),
  trained_on_real_data: z.boolean(),
  score: z.number().min(0).max(1),
  band: z.enum(["lower", "moderate", "higher"]),
  contributing_factors: z
    .array(
      z.object({
        feature: z.string().max(80),
        direction: z.enum(["increases", "decreases"]),
        weight: z.number(),
      }),
    )
    .max(12)
    .default([]),
  missing_features: z.array(z.string().max(80)).max(30).default([]),
});

export type PredictionResponse = z.infer<typeof responseSchema>;

export function isPredictionEnabled(): boolean {
  return integrations().prediction.enabled;
}

async function callPredictionService(features: Record<string, number | null>) {
  const config = env();
  const base = config.PREDICTION_SERVICE_URL;
  if (!base) {
    throw new IntegrationError(
      "The prediction service is not configured.",
      "prediction_not_configured",
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(`${base.replace(/\/$/, "")}/predict`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        ...(config.PREDICTION_SERVICE_TOKEN
          ? { authorization: `Bearer ${config.PREDICTION_SERVICE_TOKEN}` }
          : {}),
      },
      body: JSON.stringify({ feature_set_version: FEATURE_SET_VERSION, features }),
    });

    if (!response.ok) {
      throw new IntegrationError(
        `The prediction service returned status ${response.status}.`,
        "prediction_failed",
      );
    }

    const parsed = responseSchema.safeParse(await response.json());
    if (!parsed.success) {
      throw new IntegrationError(
        "The prediction service returned an unexpected response.",
        "prediction_schema_mismatch",
      );
    }
    if (parsed.data.feature_set_version !== FEATURE_SET_VERSION) {
      throw new IntegrationError(
        "The prediction service is running a different feature set version.",
        "prediction_version_mismatch",
      );
    }
    return parsed.data;
  } catch (error) {
    if (error instanceof IntegrationError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new IntegrationError("The prediction service timed out.", "prediction_timeout");
    }
    throw new IntegrationError("The prediction service is unavailable.", "prediction_unavailable");
  } finally {
    clearTimeout(timeout);
  }
}

async function upsertModelVersion(response: PredictionResponse): Promise<string> {
  const [existing] = await db
    .select({ id: modelVersions.id })
    .from(modelVersions)
    .where(eq(modelVersions.version, response.model_version))
    .limit(1);
  if (existing) return existing.id;

  const [created] = await db
    .insert(modelVersions)
    .values({
      name: response.model_name,
      version: response.model_version,
      algorithm: response.algorithm,
      featureSetVersion: response.feature_set_version,
      status: response.clinically_validated ? "active" : "experimental",
      trainedOnRealData: response.trained_on_real_data,
      clinicallyValidated: response.clinically_validated,
      trainedAt: new Date(),
    })
    .onConflictDoNothing()
    .returning({ id: modelVersions.id });

  if (created) return created.id;

  const [row] = await db
    .select({ id: modelVersions.id })
    .from(modelVersions)
    .where(eq(modelVersions.version, response.model_version))
    .limit(1);
  if (!row) throw new IntegrationError("Could not record the model version.", "prediction_failed");
  return row.id;
}

export type StoredPrediction = {
  score: number;
  band: string;
  modelName: string;
  modelVersion: string;
  clinicallyValidated: boolean;
  trainedOnRealData: boolean;
  contributingFactors: { feature: string; direction: "increases" | "decreases"; weight: number }[];
  missingFeatures: string[];
  calculatedAt: Date;
};

/**
 * Calculates and stores a prediction for one referral.
 * Returns null when the service is disabled rather than throwing.
 */
export async function predictForReferral(referralId: string): Promise<StoredPrediction | null> {
  if (!isPredictionEnabled()) return null;

  const [referral] = await db
    .select({ id: referrals.id, organisationId: referrals.organisationId })
    .from(referrals)
    .where(eq(referrals.id, referralId))
    .limit(1);
  if (!referral) return null;

  const { features, missing } = await buildFeatureVector(referralId);
  const response = await callPredictionService(features);
  const modelVersionId = await upsertModelVersion(response);
  const calculatedAt = new Date();

  const contributingFactors = response.contributing_factors;
  const missingFeatures = Array.from(
    new Set<string>([...missing, ...response.missing_features]),
  ) as FeatureName[];

  await db
    .insert(predictions)
    .values({
      organisationId: referral.organisationId,
      referralId,
      modelVersionId,
      score: response.score.toFixed(4),
      band: response.band,
      contributingFactors,
      missingFeatures,
      calculatedAt,
    })
    .onConflictDoUpdate({
      target: [predictions.referralId, predictions.modelVersionId],
      set: {
        score: response.score.toFixed(4),
        band: response.band,
        contributingFactors,
        missingFeatures,
        calculatedAt,
      },
    });

  return {
    score: response.score,
    band: response.band,
    modelName: response.model_name,
    modelVersion: response.model_version,
    clinicallyValidated: response.clinically_validated,
    trainedOnRealData: response.trained_on_real_data,
    contributingFactors,
    missingFeatures,
    calculatedAt,
  };
}

/** Health probe used by the settings screen and the job runner. */
export async function predictionServiceHealth(): Promise<{
  configured: boolean;
  reachable: boolean;
  detail: string;
}> {
  const status = integrations().prediction;
  if (!status.configured) {
    return {
      configured: false,
      reachable: false,
      detail: `Not configured. Missing: ${status.missing.join(", ")}`,
    };
  }
  if (!status.enabled) {
    return { configured: true, reachable: false, detail: "Configured but switched off." };
  }
  try {
    const base = env().PREDICTION_SERVICE_URL as string;
    const response = await fetch(`${base.replace(/\/$/, "")}/health`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      return { configured: true, reachable: false, detail: `Status ${response.status}` };
    }
    const body = (await response.json()) as { status?: string; model_version?: string };
    return {
      configured: true,
      reachable: true,
      detail: `Healthy, model ${body.model_version ?? "unknown"}`,
    };
  } catch {
    return { configured: true, reachable: false, detail: "Could not be reached." };
  }
}
