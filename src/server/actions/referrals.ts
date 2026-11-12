"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { referralPriorityEnum, referralStatusEnum } from "@/db/schema";
import { requireAuth } from "@/lib/auth/session";
import {
  addClinicalNote,
  assignCoordinator,
  createReferral,
  transitionReferral,
} from "@/lib/referrals/service";
import { errorState, parseForm, successState, toActionError, type ActionState } from "../action-result";

const createSchema = z.object({
  patientId: z.string().uuid("Choose a patient."),
  receivingFacilityId: z.string().uuid("Choose a receiving facility."),
  receivingDepartmentId: z.string().uuid().optional().or(z.literal("")),
  priority: z.enum(referralPriorityEnum.enumValues),
  reasonCategory: z.string().trim().min(2, "Choose a reason for the referral.").max(80),
  reasonDetail: z.string().trim().max(4000).optional().or(z.literal("")),
  clinicalObservations: z.string().trim().max(8000).optional().or(z.literal("")),
  requestedActions: z.string().trim().max(4000).optional().or(z.literal("")),
  requestedDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use the date picker.")
    .optional()
    .or(z.literal("")),
  pregnancyEpisodeId: z.string().uuid().optional().or(z.literal("")),
  intent: z.enum(["draft", "submit"]),
});

export async function createReferralAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  let destination: string | null = null;
  try {
    const ctx = await requireAuth();
    const input = parseForm(createSchema, formData);

    const result = await createReferral(ctx, {
      patientId: input.patientId,
      receivingFacilityId: input.receivingFacilityId,
      receivingDepartmentId: input.receivingDepartmentId || null,
      priority: input.priority,
      reasonCategory: input.reasonCategory,
      reasonDetail: input.reasonDetail || null,
      clinicalObservations: input.clinicalObservations || null,
      requestedActions: input.requestedActions || null,
      requestedDate: input.requestedDate || null,
      pregnancyEpisodeId: input.pregnancyEpisodeId || null,
      submit: input.intent === "submit",
    });

    destination = `/app/referrals/${result.id}`;
  } catch (error) {
    return toActionError(error);
  }

  revalidatePath("/app/referrals");
  redirect(destination);
}

const transitionSchema = z.object({
  referralId: z.string().uuid(),
  to: z.enum(referralStatusEnum.enumValues),
  note: z.string().trim().max(4000).optional().or(z.literal("")),
  reason: z.string().trim().max(300).optional().or(z.literal("")),
  outcomeSummary: z.string().trim().max(4000).optional().or(z.literal("")),
  scheduledFor: z.string().optional().or(z.literal("")),
  durationMinutes: z.coerce.number().int().min(5).max(480).optional(),
  departmentId: z.string().uuid().optional().or(z.literal("")),
  locationNote: z.string().trim().max(200).optional().or(z.literal("")),
});

export async function transitionReferralAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const ctx = await requireAuth();
    const input = parseForm(transitionSchema, formData);

    let appointment;
    if (input.to === "appointment_scheduled") {
      if (!input.scheduledFor) {
        return errorState("Choose when the patient should attend.", {
          scheduledFor: ["An appointment date and time is required."],
        });
      }
      const scheduledFor = new Date(input.scheduledFor);
      if (Number.isNaN(scheduledFor.getTime())) {
        return errorState("That appointment date and time could not be read.", {
          scheduledFor: ["Use the date and time picker."],
        });
      }
      appointment = {
        scheduledFor,
        durationMinutes: input.durationMinutes ?? 30,
        departmentId: input.departmentId || null,
        locationNote: input.locationNote || null,
      };
    }

    const result = await transitionReferral(ctx, {
      referralId: input.referralId,
      to: input.to,
      note: input.note || null,
      reason: input.reason || null,
      outcomeSummary: input.outcomeSummary || null,
      appointment,
    });

    revalidatePath(`/app/referrals/${input.referralId}`);
    revalidatePath("/app/referrals");
    revalidatePath("/app/inbox");
    revalidatePath("/app/coordination");
    revalidatePath("/app");

    return successState(`Referral ${result.referral.reference} updated.`);
  } catch (error) {
    return toActionError(error);
  }
}

const noteSchema = z.object({
  patientId: z.string().uuid(),
  referralId: z.string().uuid().optional().or(z.literal("")),
  body: z.string().trim().min(3, "Write a note before saving.").max(8000),
  visibleToPatient: z.literal("on").optional(),
  aiAssisted: z.literal("true").optional(),
});

export async function addNoteAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const ctx = await requireAuth();
    const input = parseForm(noteSchema, formData);

    await addClinicalNote(ctx, {
      patientId: input.patientId,
      referralId: input.referralId || null,
      body: input.body,
      visibleToPatient: input.visibleToPatient === "on",
      aiAssisted: input.aiAssisted === "true",
    });

    if (input.referralId) revalidatePath(`/app/referrals/${input.referralId}`);
    revalidatePath(`/app/patients/${input.patientId}`);

    return successState("Note saved.");
  } catch (error) {
    return toActionError(error);
  }
}

const assignSchema = z.object({
  referralId: z.string().uuid(),
  coordinatorUserId: z.string().uuid().optional().or(z.literal("")),
});

export async function assignCoordinatorAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const ctx = await requireAuth();
    const input = parseForm(assignSchema, formData);
    await assignCoordinator(ctx, input.referralId, input.coordinatorUserId || null);
    revalidatePath(`/app/referrals/${input.referralId}`);
    return successState(
      input.coordinatorUserId ? "Coordinator assigned." : "Coordinator assignment cleared.",
    );
  } catch (error) {
    return toActionError(error);
  }
}
