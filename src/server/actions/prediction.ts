"use server";

import { revalidatePath } from "next/cache";

import { recordAudit } from "@/lib/audit";
import { requireAuth } from "@/lib/auth/session";
import { canSeeReferral } from "@/lib/access";
import { db } from "@/db";
import { referrals } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NotFoundError } from "@/lib/errors";
import { isPredictionEnabled, predictForReferral } from "@/lib/prediction/client";
import { successState, toActionError, type ActionState } from "../action-result";

export async function recalculatePredictionAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const ctx = await requireAuth();
    const referralId = String(formData.get("referralId") ?? "");

    const [referral] = await db
      .select({
        id: referrals.id,
        organisationId: referrals.organisationId,
        referringFacilityId: referrals.referringFacilityId,
        receivingFacilityId: referrals.receivingFacilityId,
      })
      .from(referrals)
      .where(eq(referrals.id, referralId))
      .limit(1);

    if (!referral || !canSeeReferral(ctx, referral)) {
      throw new NotFoundError("That referral could not be found.");
    }

    if (!isPredictionEnabled()) {
      return {
        status: "error",
        message: "The prediction service is switched off in this deployment.",
        code: "prediction_not_enabled",
      };
    }

    const result = await predictForReferral(referralId);

    await recordAudit({
      organisationId: referral.organisationId,
      actorUserId: ctx.userId,
      action: "prediction.recalculate",
      resourceType: "referral",
      resourceId: referralId,
      metadata: { modelVersion: result?.modelVersion, band: result?.band },
    });

    revalidatePath(`/app/referrals/${referralId}`);
    return successState("The experimental score has been recalculated.");
  } catch (error) {
    return toActionError(error);
  }
}
