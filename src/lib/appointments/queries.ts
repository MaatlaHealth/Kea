import "server-only";

import { and, asc, count, desc, eq, gte, inArray, lte, or, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  appointments,
  facilities,
  patients,
  referrals,
  type AppointmentStatus,
} from "@/db/schema";
import { accessibleFacilityIds, type AuthContext } from "@/lib/auth/context";

export type AppointmentRange = "today" | "week" | "month" | "past";

export type AppointmentFilters = {
  range?: AppointmentRange;
  statuses?: AppointmentStatus[];
  facilityId?: string | null;
  page?: number;
  pageSize?: number;
};

function rangeBounds(range: AppointmentRange, now: Date) {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  switch (range) {
    case "today": {
      const end = new Date(startOfToday);
      end.setDate(end.getDate() + 1);
      return { from: startOfToday, to: end };
    }
    case "month": {
      const end = new Date(startOfToday);
      end.setDate(end.getDate() + 30);
      return { from: startOfToday, to: end };
    }
    case "past": {
      const from = new Date(startOfToday);
      from.setDate(from.getDate() - 60);
      return { from, to: startOfToday };
    }
    case "week":
    default: {
      const end = new Date(startOfToday);
      end.setDate(end.getDate() + 7);
      return { from: startOfToday, to: end };
    }
  }
}

export async function listAppointments(
  ctx: AuthContext,
  filters: AppointmentFilters = {},
  now = new Date(),
) {
  const scopeIds = accessibleFacilityIds(ctx, "referral:read");
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(5, filters.pageSize ?? 25));

  if (scopeIds.length === 0) return { rows: [], total: 0, page, pageSize };

  const { from, to } = rangeBounds(filters.range ?? "week", now);

  // Scope follows the referral, not the appointment's own facility. The clinic
  // that sent a patient to hospital needs to see when she is expected there,
  // and it can already see that appointment on the referral itself.
  const where = and(
    or(
      inArray(referrals.referringFacilityId, scopeIds),
      inArray(referrals.receivingFacilityId, scopeIds),
    ),
    filters.facilityId ? eq(appointments.facilityId, filters.facilityId) : undefined,
    gte(appointments.scheduledFor, from),
    lte(appointments.scheduledFor, to),
    filters.statuses?.length ? inArray(appointments.status, filters.statuses) : undefined,
  );

  const [rows, totalRow] = await Promise.all([
    db
      .select({
        id: appointments.id,
        scheduledFor: appointments.scheduledFor,
        durationMinutes: appointments.durationMinutes,
        status: appointments.status,
        locationNote: appointments.locationNote,
        patientConfirmedAt: appointments.patientConfirmedAt,
        patientAssistanceRequestedAt: appointments.patientAssistanceRequestedAt,
        referralId: appointments.referralId,
        reference: referrals.reference,
        referralStatus: referrals.status,
        patientId: appointments.patientId,
        patientName: sql<string>`${patients.firstName} || ' ' || ${patients.lastName}`,
        patientRecordNumber: patients.recordNumber,
        facilityName: facilities.name,
      })
      .from(appointments)
      .innerJoin(referrals, eq(referrals.id, appointments.referralId))
      .innerJoin(patients, eq(patients.id, appointments.patientId))
      .innerJoin(facilities, eq(facilities.id, appointments.facilityId))
      .where(where)
      .orderBy(
        filters.range === "past"
          ? desc(appointments.scheduledFor)
          : asc(appointments.scheduledFor),
      )
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db
      .select({ value: count() })
      .from(appointments)
      .innerJoin(referrals, eq(referrals.id, appointments.referralId))
      .where(where),
  ]);

  return { rows, total: totalRow[0]?.value ?? 0, page, pageSize };
}
