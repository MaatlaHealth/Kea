"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { communicationChannelEnum, consentTypeEnum } from "@/db/schema";
import { requireAuth } from "@/lib/auth/session";
import {
  mergePatientRecords,
  recordConsent,
  registerPatient,
  updatePatient,
  type DuplicateCandidate,
} from "@/lib/patients/service";
import { successState, parseForm, toActionError, type ActionState } from "../action-result";

const optionalDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional()
  .or(z.literal(""));

const registerSchema = z.object({
  homeFacilityId: z.string().uuid("Choose the facility this patient is registered at."),
  recordNumber: z.string().trim().max(40).optional().or(z.literal("")),
  firstName: z.string().trim().min(1, "Enter the first name.").max(100),
  lastName: z.string().trim().min(1, "Enter the surname.").max(100),
  dateOfBirth: optionalDate,
  phone: z.string().trim().max(32).optional().or(z.literal("")),
  alternatePhone: z.string().trim().max(32).optional().or(z.literal("")),
  preferredLanguage: z.string().trim().min(2).max(12),
  preferredChannel: z.enum(communicationChannelEnum.enumValues),
  residentialArea: z.string().trim().max(160).optional().or(z.literal("")),
  emergencyContactName: z.string().trim().max(160).optional().or(z.literal("")),
  emergencyContactPhone: z.string().trim().max(32).optional().or(z.literal("")),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
  estimatedDueDate: optionalDate,
  lastMenstrualPeriod: optionalDate,
  bookingDate: optionalDate,
  gravidity: z.coerce.number().int().min(0).max(30).optional(),
  parity: z.coerce.number().int().min(0).max(30).optional(),
  hasPregnancyEpisode: z.literal("on").optional(),
  consentDataProcessing: z.literal("on").optional(),
  consentAppointmentMessaging: z.literal("on").optional(),
  consentFollowUpMessaging: z.literal("on").optional(),
  consentMethod: z.string().trim().max(120).optional().or(z.literal("")),
  acknowledgedDuplicates: z.literal("true").optional(),
});

export type RegisterPatientState = ActionState<{ duplicates: DuplicateCandidate[] }>;

export async function registerPatientAction(
  _previous: RegisterPatientState,
  formData: FormData,
): Promise<RegisterPatientState> {
  let destination: string | null = null;
  try {
    const ctx = await requireAuth();
    const input = parseForm(registerSchema, formData);

    const result = await registerPatient(ctx, {
      homeFacilityId: input.homeFacilityId,
      recordNumber: input.recordNumber || null,
      firstName: input.firstName,
      lastName: input.lastName,
      dateOfBirth: input.dateOfBirth || null,
      phone: input.phone || null,
      alternatePhone: input.alternatePhone || null,
      preferredLanguage: input.preferredLanguage,
      preferredChannel: input.preferredChannel,
      residentialArea: input.residentialArea || null,
      emergencyContactName: input.emergencyContactName || null,
      emergencyContactPhone: input.emergencyContactPhone || null,
      notes: input.notes || null,
      pregnancy:
        input.hasPregnancyEpisode === "on"
          ? {
              estimatedDueDate: input.estimatedDueDate || null,
              lastMenstrualPeriod: input.lastMenstrualPeriod || null,
              bookingDate: input.bookingDate || null,
              gravidity: input.gravidity ?? null,
              parity: input.parity ?? null,
            }
          : null,
      consents: [
        {
          type: "data_processing" as const,
          granted: input.consentDataProcessing === "on",
          method: input.consentMethod || null,
        },
        {
          type: "appointment_messaging" as const,
          granted: input.consentAppointmentMessaging === "on",
          method: input.consentMethod || null,
        },
        {
          type: "follow_up_messaging" as const,
          granted: input.consentFollowUpMessaging === "on",
          method: input.consentMethod || null,
        },
      ],
      acknowledgedDuplicates: input.acknowledgedDuplicates === "true",
    });

    if (result.duplicates.length > 0) {
      // Nothing was created. The form shows the candidates and asks the
      // clinician to confirm this really is a different person.
      return {
        status: "error",
        message:
          "There are existing records that may be the same person. Review them before continuing.",
        code: "duplicates_found",
        data: { duplicates: result.duplicates },
      };
    }

    destination = `/app/patients/${result.id}`;
  } catch (error) {
    return toActionError(error) as RegisterPatientState;
  }

  revalidatePath("/app/patients");
  redirect(destination);
}

/**
 * Looks for likely duplicates without creating anything, so the form can warn
 * before the clinician commits.
 */
export async function checkDuplicatesAction(
  _previous: ActionState<{ duplicates: DuplicateCandidate[] }>,
  formData: FormData,
): Promise<ActionState<{ duplicates: DuplicateCandidate[] }>> {
  try {
    const ctx = await requireAuth();
    const { findDuplicateCandidates } = await import("@/lib/patients/service");
    const { assertFacilityAccess } = await import("@/lib/auth/context");

    const homeFacilityId = String(formData.get("homeFacilityId") ?? "");
    const facility = assertFacilityAccess(ctx, homeFacilityId);

    const duplicates = await findDuplicateCandidates(facility.organisationId, {
      firstName: String(formData.get("firstName") ?? ""),
      lastName: String(formData.get("lastName") ?? ""),
      dateOfBirth: String(formData.get("dateOfBirth") ?? "") || null,
      phone: String(formData.get("phone") ?? "") || null,
    });

    return successState(undefined, { duplicates });
  } catch (error) {
    return toActionError(error) as ActionState<{ duplicates: DuplicateCandidate[] }>;
  }
}

const updateSchema = z.object({
  patientId: z.string().uuid(),
  firstName: z.string().trim().min(1).max(100).optional(),
  lastName: z.string().trim().min(1).max(100).optional(),
  dateOfBirth: optionalDate,
  phone: z.string().trim().max(32).optional().or(z.literal("")),
  alternatePhone: z.string().trim().max(32).optional().or(z.literal("")),
  preferredLanguage: z.string().trim().min(2).max(12).optional(),
  preferredChannel: z.enum(communicationChannelEnum.enumValues).optional(),
  residentialArea: z.string().trim().max(160).optional().or(z.literal("")),
  emergencyContactName: z.string().trim().max(160).optional().or(z.literal("")),
  emergencyContactPhone: z.string().trim().max(32).optional().or(z.literal("")),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
  reason: z.string().trim().max(240).optional().or(z.literal("")),
});

export async function updatePatientAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const ctx = await requireAuth();
    const input = parseForm(updateSchema, formData);
    const { patientId, reason, ...rest } = input;

    await updatePatient(ctx, patientId, { ...rest, reason: reason || null });
    revalidatePath(`/app/patients/${patientId}`);
    return successState("Patient record updated.");
  } catch (error) {
    return toActionError(error);
  }
}

const consentSchema = z.object({
  patientId: z.string().uuid(),
  type: z.enum(consentTypeEnum.enumValues),
  granted: z.enum(["true", "false"]),
  method: z.string().trim().max(120).optional().or(z.literal("")),
});

export async function recordConsentAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const ctx = await requireAuth();
    const input = parseForm(consentSchema, formData);
    await recordConsent(
      ctx,
      input.patientId,
      input.type,
      input.granted === "true",
      input.method || null,
    );
    revalidatePath(`/app/patients/${input.patientId}`);
    return successState("Consent updated.");
  } catch (error) {
    return toActionError(error);
  }
}

const mergeSchema = z.object({
  sourcePatientId: z.string().uuid(),
  targetPatientId: z.string().uuid(),
  reason: z.string().trim().min(5, "Record why these records are being merged.").max(240),
});

export async function mergePatientsAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const ctx = await requireAuth();
    const input = parseForm(mergeSchema, formData);
    await mergePatientRecords(ctx, input.sourcePatientId, input.targetPatientId, input.reason);
    revalidatePath("/app/patients");
    return successState("The duplicate record has been linked to the primary record.");
  } catch (error) {
    return toActionError(error);
  }
}
