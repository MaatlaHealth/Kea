import "server-only";

import { aliasedTable, and, count, eq, inArray, ne, sql } from "drizzle-orm";

import { db } from "@/db";
import { appointments, facilities, messages, patients, referrals } from "@/db/schema";

const referringFacility = aliasedTable(facilities, "pred_referring_facility");
const receivingFacility = aliasedTable(facilities, "pred_receiving_facility");

/**
 * Feature definitions for the referral non-attendance model.
 *
 * Versioning: the feature set version is sent with every prediction request and
 * stored on the model version row. A change to the list below, to the order, or
 * to how any value is derived requires a new version string.
 *
 * Excluded by design: age, race, income, marital status, HIV status, diagnosis,
 * reason for referral and any other clinical or protected characteristic. The
 * model exists to prioritise coordination effort, not to profile patients.
 */

export const FEATURE_SET_VERSION = "referral-attendance-v1";

export const FEATURE_NAMES = [
  "lead_time_days",
  "travel_distance_km",
  "priority_rank",
  "prior_missed_appointments",
  "prior_attended_appointments",
  "facility_missed_rate",
  "acknowledgement_delay_hours",
  "appointment_weekday",
  "reschedule_count",
  "has_contact_number",
  "appointment_message_delivered",
] as const;

export type FeatureName = (typeof FEATURE_NAMES)[number];

export const FEATURE_DESCRIPTIONS: Record<FeatureName, string> = {
  lead_time_days: "Days between the appointment being booked and the appointment date.",
  travel_distance_km:
    "Straight line distance between the referring and receiving facilities, used as a proxy for travel burden.",
  priority_rank: "Referral priority, where routine is 0, urgent is 1 and emergency is 2.",
  prior_missed_appointments: "Appointments this patient did not attend in the past.",
  prior_attended_appointments: "Appointments this patient did attend in the past.",
  facility_missed_rate:
    "Share of past appointments at the receiving facility that were not attended.",
  acknowledgement_delay_hours: "Hours between referral submission and acknowledgement.",
  appointment_weekday: "Day of week of the appointment, where Monday is 0.",
  reschedule_count: "Number of times this referral has been rebooked.",
  has_contact_number: "Whether a usable phone number is on record, as 1 or 0.",
  appointment_message_delivered:
    "Whether the appointment message reached the patient, as 1 or 0.",
};

export type FeatureVector = Record<FeatureName, number | null>;

/** Great circle distance in kilometres. */
export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371;
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

const PRIORITY_RANK = { routine: 0, urgent: 1, emergency: 2 } as const;

/**
 * Builds the feature vector for one referral. Any feature that cannot be
 * derived is returned as null and reported to the caller as missing, rather
 * than silently replaced with a zero.
 */
export async function buildFeatureVector(referralId: string): Promise<{
  features: FeatureVector;
  missing: FeatureName[];
}> {
  const [row] = await db
    .select({
      referral: referrals,
      referringLat: referringFacility.latitude,
      referringLng: referringFacility.longitude,
      receivingLat: receivingFacility.latitude,
      receivingLng: receivingFacility.longitude,
    })
    .from(referrals)
    .leftJoin(referringFacility, eq(referringFacility.id, referrals.referringFacilityId))
    .leftJoin(receivingFacility, eq(receivingFacility.id, referrals.receivingFacilityId))
    .where(eq(referrals.id, referralId))
    .limit(1);

  if (!row) {
    return {
      features: Object.fromEntries(FEATURE_NAMES.map((name) => [name, null])) as FeatureVector,
      missing: [...FEATURE_NAMES],
    };
  }

  const referral = row.referral;

  const [nextAppointment] = await db
    .select()
    .from(appointments)
    .where(
      and(
        eq(appointments.referralId, referralId),
        inArray(appointments.status, ["scheduled", "rescheduled"]),
      ),
    )
    .orderBy(appointments.scheduledFor)
    .limit(1);

  const [priorMissed] = await db
    .select({ value: count() })
    .from(appointments)
    .where(
      and(
        eq(appointments.patientId, referral.patientId),
        eq(appointments.status, "missed"),
        ne(appointments.referralId, referralId),
      ),
    );

  const [priorAttended] = await db
    .select({ value: count() })
    .from(appointments)
    .where(
      and(
        eq(appointments.patientId, referral.patientId),
        eq(appointments.status, "attended"),
        ne(appointments.referralId, referralId),
      ),
    );

  const [facilityStats] = await db
    .select({
      missed: sql<number>`count(*) filter (where ${appointments.status} = 'missed')::int`,
      resolved: sql<number>`count(*) filter (where ${appointments.status} in ('missed','attended'))::int`,
    })
    .from(appointments)
    .where(eq(appointments.facilityId, referral.receivingFacilityId));

  const [rescheduleCount] = await db
    .select({ value: count() })
    .from(appointments)
    .where(
      and(eq(appointments.referralId, referralId), eq(appointments.status, "rescheduled")),
    );

  const [patientPhone] = await db
    .select({ hasPhone: sql<boolean>`${patients.phone} is not null` })
    .from(patients)
    .where(eq(patients.id, referral.patientId))
    .limit(1);

  const [deliveredMessage] = await db
    .select({ value: count() })
    .from(messages)
    .where(
      and(
        eq(messages.referralId, referralId),
        eq(messages.templateKey, "appointment_scheduled"),
        inArray(messages.status, ["delivered", "read"]),
      ),
    );

  const [anyAppointmentMessage] = await db
    .select({ value: count() })
    .from(messages)
    .where(
      and(eq(messages.referralId, referralId), eq(messages.templateKey, "appointment_scheduled")),
    );

  const features: FeatureVector = {
    lead_time_days:
      nextAppointment && nextAppointment.createdAt
        ? Number(
            (
              (nextAppointment.scheduledFor.getTime() - nextAppointment.createdAt.getTime()) /
              86_400_000
            ).toFixed(2),
          )
        : null,
    travel_distance_km:
      row.referringLat && row.referringLng && row.receivingLat && row.receivingLng
        ? Number(
            haversineKm(
              { lat: Number(row.referringLat), lng: Number(row.referringLng) },
              { lat: Number(row.receivingLat), lng: Number(row.receivingLng) },
            ).toFixed(2),
          )
        : null,
    priority_rank: PRIORITY_RANK[referral.priority],
    prior_missed_appointments: priorMissed?.value ?? 0,
    prior_attended_appointments: priorAttended?.value ?? 0,
    facility_missed_rate:
      facilityStats && facilityStats.resolved > 0
        ? Number((facilityStats.missed / facilityStats.resolved).toFixed(4))
        : null,
    acknowledgement_delay_hours:
      referral.submittedAt && referral.acknowledgedAt
        ? Number(
            (
              (referral.acknowledgedAt.getTime() - referral.submittedAt.getTime()) /
              3_600_000
            ).toFixed(2),
          )
        : null,
    appointment_weekday: nextAppointment
      ? (nextAppointment.scheduledFor.getUTCDay() + 6) % 7
      : null,
    reschedule_count: rescheduleCount?.value ?? 0,
    has_contact_number: patientPhone?.hasPhone ? 1 : 0,
    appointment_message_delivered:
      (anyAppointmentMessage?.value ?? 0) === 0 ? null : (deliveredMessage?.value ?? 0) > 0 ? 1 : 0,
  };

  const missing = FEATURE_NAMES.filter((name) => features[name] === null);
  return { features, missing };
}
