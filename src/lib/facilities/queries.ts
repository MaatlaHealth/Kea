import "server-only";

import { aliasedTable, and, asc, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { departments, facilities, referralPathways } from "@/db/schema";
import { accessibleFacilityIds, type AuthContext } from "@/lib/auth/context";

const target = aliasedTable(facilities, "pathway_target");

/** Facilities the given facility is configured to refer to. */
export async function pathwayTargets(referringFacilityId: string) {
  return db
    .select({
      id: target.id,
      name: target.name,
      type: target.type,
      district: target.district,
      phone: target.phone,
    })
    .from(referralPathways)
    .innerJoin(target, eq(target.id, referralPathways.receivingFacilityId))
    .where(
      and(
        eq(referralPathways.referringFacilityId, referringFacilityId),
        eq(referralPathways.isActive, true),
        eq(target.isActive, true),
      ),
    )
    .orderBy(asc(target.name));
}

export async function departmentsForFacilities(facilityIds: string[]) {
  if (facilityIds.length === 0) return [];
  return db
    .select({
      id: departments.id,
      facilityId: departments.facilityId,
      name: departments.name,
      serviceType: departments.serviceType,
    })
    .from(departments)
    .where(and(inArray(departments.facilityId, facilityIds), eq(departments.acceptsReferrals, true)))
    .orderBy(asc(departments.name));
}

/** Facilities the current user may act in, for pickers. */
export async function facilitiesForUser(ctx: AuthContext, permission?: Parameters<typeof accessibleFacilityIds>[1]) {
  const ids = accessibleFacilityIds(ctx, permission);
  if (ids.length === 0) return [];
  return db
    .select({
      id: facilities.id,
      name: facilities.name,
      type: facilities.type,
      code: facilities.code,
      district: facilities.district,
    })
    .from(facilities)
    .where(inArray(facilities.id, ids))
    .orderBy(asc(facilities.name));
}
