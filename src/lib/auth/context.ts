import type { UserRole } from "@/db/schema";
import { AuthorisationError } from "@/lib/errors";
import { roleGrants, type Permission } from "./permissions";

export type MembershipScope = {
  organisationId: string;
  /** Null means the role applies to every facility in the organisation. */
  facilityId: string | null;
  role: UserRole;
};

export type FacilitySummary = {
  id: string;
  organisationId: string;
  name: string;
  code: string;
  type: string;
};

export type AuthContext = {
  userId: string;
  sessionId: string;
  email: string;
  fullName: string;
  isPlatformAdmin: boolean;
  mfaEnabled: boolean;
  memberships: MembershipScope[];
  /** Facilities the user can act in, resolved from organisation and facility roles. */
  facilities: FacilitySummary[];
  organisationIds: string[];
  /** The organisation the current interface is scoped to. */
  activeOrganisationId: string | null;
};

export type Scope = {
  organisationId?: string | null;
  facilityId?: string | null;
};

/**
 * Resolves the roles that apply to a given scope.
 *
 * An organisation level membership applies everywhere inside that
 * organisation. A facility level membership applies only at that facility.
 */
export function rolesAt(ctx: AuthContext, scope: Scope): Set<UserRole> {
  const result = new Set<UserRole>();
  if (ctx.isPlatformAdmin) result.add("platform_admin");

  if (scope.facilityId) {
    // A facility the user cannot see yields no roles at all. Resolving the
    // organisation from the facility is what keeps one organisation's roles
    // from applying at another organisation's facility.
    const facility = ctx.facilities.find((f) => f.id === scope.facilityId);
    if (!facility) return result;
    if (scope.organisationId && scope.organisationId !== facility.organisationId) return result;

    for (const membership of ctx.memberships) {
      if (membership.organisationId !== facility.organisationId) continue;
      if (membership.facilityId !== null && membership.facilityId !== scope.facilityId) continue;
      result.add(membership.role);
    }
    return result;
  }

  for (const membership of ctx.memberships) {
    if (scope.organisationId && membership.organisationId !== scope.organisationId) continue;
    result.add(membership.role);
  }
  return result;
}

/**
 * True when the user holds the permission within the given scope.
 *
 * Calling without a scope asks whether the user holds the permission anywhere,
 * which is only appropriate for deciding whether to show navigation.
 */
export function can(ctx: AuthContext, permission: Permission, scope: Scope = {}): boolean {
  if (ctx.isPlatformAdmin) return true;
  const roles = rolesAt(ctx, scope);
  for (const role of roles) {
    if (roleGrants(role, permission)) return true;
  }
  return false;
}

/** True when the user holds the permission at any facility or organisation. */
export function canAnywhere(ctx: AuthContext, permission: Permission): boolean {
  if (ctx.isPlatformAdmin) return true;
  return ctx.memberships.some((m) => roleGrants(m.role, permission));
}

export function assertCan(ctx: AuthContext, permission: Permission, scope: Scope = {}): void {
  if (!can(ctx, permission, scope)) {
    throw new AuthorisationError(
      `Your role does not allow this action${scope.facilityId ? " at this facility" : ""}.`,
    );
  }
}

/** Facility identifiers the user may act in, optionally filtered by permission. */
export function accessibleFacilityIds(ctx: AuthContext, permission?: Permission): string[] {
  if (!permission) return ctx.facilities.map((f) => f.id);
  return ctx.facilities
    .filter((facility) => can(ctx, permission, { facilityId: facility.id }))
    .map((facility) => facility.id);
}

export function facilityById(ctx: AuthContext, facilityId: string): FacilitySummary | null {
  return ctx.facilities.find((f) => f.id === facilityId) ?? null;
}

export function assertFacilityAccess(ctx: AuthContext, facilityId: string): FacilitySummary {
  const facility = facilityById(ctx, facilityId);
  if (!facility) {
    throw new AuthorisationError("You do not have access to that facility.");
  }
  return facility;
}

/** The single organisation in scope, when the user belongs to exactly one. */
export function primaryOrganisationId(ctx: AuthContext): string | null {
  if (ctx.activeOrganisationId) return ctx.activeOrganisationId;
  return ctx.organisationIds.length === 1 ? ctx.organisationIds[0] : null;
}

export function highestRole(ctx: AuthContext): UserRole | null {
  const order: UserRole[] = [
    "platform_admin",
    "organisation_admin",
    "facility_admin",
    "referral_coordinator",
    "receiving_clinician",
    "nurse_midwife",
    "programme_analyst",
  ];
  if (ctx.isPlatformAdmin) return "platform_admin";
  for (const role of order) {
    if (ctx.memberships.some((m) => m.role === role)) return role;
  }
  return null;
}
