"use server";

import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { canAnywhere } from "@/lib/auth/context";
import { requireAuth } from "@/lib/auth/session";
import { draftReferralStructure, isAiEnabled, type ReferralDraft } from "@/lib/ai/gemini";
import { AuthorisationError } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { REFERRAL_REASON_CATEGORIES } from "@/lib/site";
import { parseForm, successState, toActionError, type ActionState } from "../action-result";

const draftSchema = z.object({
  text: z.string().trim().min(20, "Write a little more before asking for a draft.").max(6000),
});

/**
 * Produces a structured draft from a clinician's free text.
 *
 * The audit entry records that assistance was used and by whom. It does not
 * record the text that was sent or the draft that came back.
 */
export async function draftFromNotesAction(
  _previous: ActionState<ReferralDraft>,
  formData: FormData,
): Promise<ActionState<ReferralDraft>> {
  try {
    const ctx = await requireAuth();
    if (!canAnywhere(ctx, "ai:use")) {
      throw new AuthorisationError("Your role does not allow assisted drafting.");
    }
    if (!isAiEnabled()) {
      return {
        status: "error",
        message:
          "Assisted drafting is turned off in this deployment. Complete the referral manually.",
        code: "ai_not_enabled",
      };
    }

    await enforceRateLimit("aiAssist", ctx.userId);
    const input = parseForm(draftSchema, formData);

    const started = Date.now();
    const draft = await draftReferralStructure(input.text, REFERRAL_REASON_CATEGORIES);

    await recordAudit({
      actorUserId: ctx.userId,
      action: "ai.draft_referral",
      resourceType: "ai_assist",
      metadata: { durationMs: Date.now() - started, result: "success" },
    });

    return successState("Draft ready for your review.", draft);
  } catch (error) {
    return toActionError(error) as ActionState<ReferralDraft>;
  }
}
