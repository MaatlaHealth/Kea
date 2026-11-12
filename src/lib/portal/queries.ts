import "server-only";

import { aliasedTable, and, desc, eq, gte, inArray } from "drizzle-orm";

import { db } from "@/db";
import {
  appointments,
  clinicalNotes,
  consentRecords,
  facilities,
  referrals,
  type ConsentType,
  type Patient,
  type ReferralStatus,
} from "@/db/schema";

/**
 * Patient facing views.
 *
 * Everything here is filtered for patient disclosure. A patient sees where
 * their referral has reached in plain language, when and where to attend, and
 * any note a clinician has explicitly chosen to share. They never see internal
 * clinical observations, staff notes, coordinator records or the experimental
 * prediction score.
 */

/** Plain language description of a referral state for a patient. */
export const PATIENT_STATUS_TEXT: Record<ReferralStatus, { label: string; detail: string }> = {
  draft: {
    label: "Being prepared",
    detail: "Your clinic is preparing this referral.",
  },
  submitted: {
    label: "Sent to the hospital",
    detail: "Your clinic has sent the referral. The hospital will confirm it shortly.",
  },
  received: {
    label: "Received by the hospital",
    detail: "The hospital has the referral and is reviewing it.",
  },
  acknowledged: {
    label: "Accepted by the hospital",
    detail: "The hospital has accepted the referral and will arrange a date.",
  },
  appointment_scheduled: {
    label: "Appointment booked",
    detail: "Your visit has been booked. The date and time are shown below.",
  },
  patient_attended: {
    label: "Visit recorded",
    detail: "The hospital has recorded that you attended.",
  },
  care_completed: {
    label: "Care completed",
    detail: "The hospital has finished this episode of care.",
  },
  follow_up_required: {
    label: "Follow-up needed",
    detail: "Please contact your clinic to arrange your follow-up visit.",
  },
  follow_up_completed: {
    label: "Follow-up complete",
    detail: "Your follow-up has been recorded.",
  },
  closed: {
    label: "Complete",
    detail: "This referral is finished. Contact your clinic if anything changes.",
  },
  rejected: {
    label: "Being reviewed by your clinic",
    detail: "Your clinic is arranging the next step. They will contact you.",
  },
  cancelled: {
    label: "Cancelled",
    detail: "This referral was cancelled. Contact your clinic if you have questions.",
  },
  missed_appointment: {
    label: "Appointment missed",
    detail: "You did not attend your booked visit. Please contact your clinic to rebook.",
  },
  unable_to_contact: {
    label: "We could not reach you",
    detail: "Your clinic has been trying to contact you. Please call them.",
  },
  escalated: {
    label: "Being followed up",
    detail: "Someone at your clinic is looking into this referral.",
  },
};

const receivingFacility = aliasedTable(facilities, "portal_receiving_facility");
const referringFacility = aliasedTable(facilities, "portal_referring_facility");

export async function patientOverview(patient: Patient) {
  const now = new Date();

  const [upcoming, referralRows, sharedNotes, consentRows, homeFacility] = await Promise.all([
    db
      .select({
        id: appointments.id,
        scheduledFor: appointments.scheduledFor,
        status: appointments.status,
        locationNote: appointments.locationNote,
        facilityName: receivingFacility.name,
        facilityPhone: receivingFacility.phone,
        facilityAddress: receivingFacility.addressLine,
        confirmedAt: appointments.patientConfirmedAt,
        assistanceRequestedAt: appointments.patientAssistanceRequestedAt,
      })
      .from(appointments)
      .innerJoin(receivingFacility, eq(receivingFacility.id, appointments.facilityId))
      .where(
        and(
          eq(appointments.patientId, patient.id),
          inArray(appointments.status, ["scheduled", "rescheduled"]),
          gte(appointments.scheduledFor, new Date(now.getTime() - 12 * 3_600_000)),
        ),
      )
      .orderBy(appointments.scheduledFor),
    db
      .select({
        id: referrals.id,
        reference: referrals.reference,
        status: referrals.status,
        createdAt: referrals.createdAt,
        receivingFacilityName: receivingFacility.name,
        receivingFacilityPhone: receivingFacility.phone,
        referringFacilityName: referringFacility.name,
        referringFacilityPhone: referringFacility.phone,
      })
      .from(referrals)
      .innerJoin(receivingFacility, eq(receivingFacility.id, referrals.receivingFacilityId))
      .innerJoin(referringFacility, eq(referringFacility.id, referrals.referringFacilityId))
      .where(eq(referrals.patientId, patient.id))
      .orderBy(desc(referrals.createdAt))
      .limit(10),
    db
      .select({
        id: clinicalNotes.id,
        body: clinicalNotes.body,
        createdAt: clinicalNotes.createdAt,
      })
      .from(clinicalNotes)
      .where(
        and(eq(clinicalNotes.patientId, patient.id), eq(clinicalNotes.visibleToPatient, true)),
      )
      .orderBy(desc(clinicalNotes.createdAt))
      .limit(10),
    db
      .select({
        type: consentRecords.type,
        status: consentRecords.status,
        capturedAt: consentRecords.capturedAt,
      })
      .from(consentRecords)
      .where(eq(consentRecords.patientId, patient.id))
      .orderBy(desc(consentRecords.capturedAt)),
    db
      .select({
        name: facilities.name,
        phone: facilities.phone,
        addressLine: facilities.addressLine,
      })
      .from(facilities)
      .where(eq(facilities.id, patient.homeFacilityId))
      .limit(1),
  ]);

  const latestConsents = new Map<ConsentType, (typeof consentRows)[number]>();
  for (const row of consentRows) {
    if (!latestConsents.has(row.type)) latestConsents.set(row.type, row);
  }

  // Facility contact numbers the patient can legitimately call.
  const contacts = new Map<string, string | null>();
  if (homeFacility[0]) contacts.set(homeFacility[0].name, homeFacility[0].phone);
  for (const referral of referralRows) {
    contacts.set(referral.referringFacilityName, referral.referringFacilityPhone);
    contacts.set(referral.receivingFacilityName, referral.receivingFacilityPhone);
  }

  return {
    upcoming,
    referrals: referralRows,
    sharedNotes,
    consents: {
      appointmentMessaging: latestConsents.get("appointment_messaging")?.status === "granted",
      followUpMessaging: latestConsents.get("follow_up_messaging")?.status === "granted",
    },
    homeFacility: homeFacility[0] ?? null,
    contacts: Array.from(contacts.entries()).map(([name, phone]) => ({ name, phone })),
  };
}
