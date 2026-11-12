"use server";

import { and, eq, inArray } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { appointments, communicationChannelEnum, consentRecords, patients } from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import {
  createPatientSession,
  destroyPatientSession,
  issuePatientCode,
  requirePatientSession,
  verifyPatientCode,
} from "@/lib/auth/patient-session";
import { queueMessage, deliverMessage } from "@/lib/messaging/dispatch";
import { normalisePhone } from "@/lib/messaging/provider";
import { enforceRateLimit } from "@/lib/rate-limit";
import { errorState, parseForm, successState, toActionError, type ActionState } from "../action-result";

/**
 * Patient portal actions.
 *
 * Sign in reports the same outcome whether or not a record matches the phone
 * number, so the form cannot be used to discover who is registered.
 */

const requestCodeSchema = z.object({
  phone: z.string().trim().min(6, "Enter the mobile number your clinic has for you.").max(32),
});

export async function requestPortalCodeAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const input = parseForm(requestCodeSchema, formData);
    const phone = normalisePhone(input.phone);
    if (!phone) {
      return errorState("That does not look like a mobile number.", {
        phone: ["Enter a number such as 072 123 4567."],
      });
    }

    await enforceRateLimit("patientCodeRequest", phone);

    const issued = await issuePatientCode(phone);

    if (issued) {
      const [patient] = await db
        .select({ organisationId: patients.organisationId })
        .from(patients)
        .where(eq(patients.id, issued.patientId))
        .limit(1);

      if (patient) {
        const outcome = await queueMessage({
          organisationId: patient.organisationId,
          patientId: issued.patientId,
          templateKey: "portal_access_code",
          variables: {
            code: issued.code,
            minutes: String(issued.expiresInMinutes),
          },
          channel: "sms",
          idempotencyKey: `portal_code:${issued.patientId}:${Date.now()}`,
        });
        if (outcome.status === "queued") {
          await deliverMessage(outcome.messageId).catch(() => {});
        }
      }

      await recordAudit({
        actorPatientId: issued.patientId,
        action: "portal.code_request",
        resourceType: "patient",
        resourceId: issued.patientId,
      });
    }

    return successState(
      "If that number is on a patient record, a code has been sent to it. The code expires in ten minutes.",
    );
  } catch (error) {
    return toActionError(error);
  }
}

const verifySchema = z.object({
  phone: z.string().trim().min(6).max(32),
  code: z.string().trim().regex(/^\d{6}$/, "Enter the six digit code."),
});

export async function verifyPortalCodeAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  let signedIn = false;
  try {
    const input = parseForm(verifySchema, formData);
    const phone = normalisePhone(input.phone);
    if (!phone) return errorState("That does not look like a mobile number.");

    await enforceRateLimit("patientCodeVerify", phone);

    const result = await verifyPatientCode(phone, input.code);
    if (!result.ok) {
      const messages: Record<typeof result.reason, string> = {
        no_code: "Request a new code.",
        expired: "That code has expired. Request a new one.",
        incorrect: "That code was not correct.",
        too_many_attempts: "Too many attempts. Request a new code.",
      };
      await recordAudit({
        action: "portal.sign_in",
        resourceType: "patient",
        outcome: "failure",
        metadata: { result: result.reason },
      });
      return errorState(messages[result.reason], { code: [messages[result.reason]] });
    }

    await createPatientSession(result.patientId);
    await recordAudit({
      actorPatientId: result.patientId,
      action: "portal.sign_in",
      resourceType: "patient",
      resourceId: result.patientId,
    });
    signedIn = true;
  } catch (error) {
    return toActionError(error);
  }

  if (signedIn) redirect("/portal");
  return successState();
}

export async function portalSignOutAction() {
  await destroyPatientSession();
  redirect("/portal/sign-in");
}

const appointmentResponseSchema = z.object({
  appointmentId: z.string().uuid(),
  response: z.enum(["confirm", "need_help"]),
});

export async function respondToAppointmentAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const patient = await requirePatientSession();
    const input = parseForm(appointmentResponseSchema, formData);

    const [appointment] = await db
      .select({ id: appointments.id, organisationId: appointments.organisationId })
      .from(appointments)
      .where(
        and(
          eq(appointments.id, input.appointmentId),
          eq(appointments.patientId, patient.id),
          inArray(appointments.status, ["scheduled", "rescheduled"]),
        ),
      )
      .limit(1);

    if (!appointment) {
      return errorState("That appointment is no longer open for a response.");
    }

    const now = new Date();
    await db
      .update(appointments)
      .set(
        input.response === "confirm"
          ? { patientConfirmedAt: now, patientAssistanceRequestedAt: null, updatedAt: now }
          : { patientAssistanceRequestedAt: now, updatedAt: now },
      )
      .where(eq(appointments.id, appointment.id));

    await recordAudit({
      organisationId: appointment.organisationId,
      actorPatientId: patient.id,
      action: "portal.appointment_response",
      resourceType: "appointment",
      resourceId: appointment.id,
      metadata: { result: input.response },
    });

    revalidatePath("/portal");

    return successState(
      input.response === "confirm"
        ? "Thank you. Your facility can see that you plan to attend."
        : "Thank you. Someone from your clinic will try to contact you.",
    );
  } catch (error) {
    return toActionError(error);
  }
}

const preferencesSchema = z.object({
  preferredChannel: z.enum(communicationChannelEnum.enumValues),
  appointmentMessaging: z.enum(["true", "false"]),
  followUpMessaging: z.enum(["true", "false"]),
});

export async function updatePortalPreferencesAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const patient = await requirePatientSession();
    const input = parseForm(preferencesSchema, formData);

    await db.transaction(async (tx) => {
      await tx
        .update(patients)
        .set({ preferredChannel: input.preferredChannel, updatedAt: new Date() })
        .where(eq(patients.id, patient.id));

      await tx.insert(consentRecords).values([
        {
          patientId: patient.id,
          organisationId: patient.organisationId,
          type: "appointment_messaging" as const,
          status: input.appointmentMessaging === "true" ? ("granted" as const) : ("withdrawn" as const),
          method: "Set by the patient in the portal",
        },
        {
          patientId: patient.id,
          organisationId: patient.organisationId,
          type: "follow_up_messaging" as const,
          status: input.followUpMessaging === "true" ? ("granted" as const) : ("withdrawn" as const),
          method: "Set by the patient in the portal",
        },
      ]);
    });

    await recordAudit({
      organisationId: patient.organisationId,
      actorPatientId: patient.id,
      action: "portal.preferences_update",
      resourceType: "patient",
      resourceId: patient.id,
      metadata: { channel: input.preferredChannel },
    });

    revalidatePath("/portal/preferences");
    return successState("Your preferences have been saved.");
  } catch (error) {
    return toActionError(error);
  }
}
