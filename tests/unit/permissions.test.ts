import { describe, expect, it } from "vitest";

import { userRoleEnum } from "@/db/schema";
import {
  accessibleFacilityIds,
  assertCan,
  can,
  canAnywhere,
  highestRole,
  rolesAt,
  type AuthContext,
} from "@/lib/auth/context";
import {
  ASSIGNABLE_ROLES,
  FACILITY_SCOPED_ROLES,
  PERMISSIONS,
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
  ROLE_PERMISSIONS,
  roleGrants,
} from "@/lib/auth/permissions";
import { AuthorisationError } from "@/lib/errors";

const ORG_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORG_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CLINIC_A = "11111111-1111-4111-8111-111111111111";
const HOSPITAL_A = "22222222-2222-4222-8222-222222222222";
const CLINIC_B = "44444444-4444-4444-8444-444444444444";

const FACILITIES = [
  { id: CLINIC_A, organisationId: ORG_A, name: "Clinic A", code: "CA", type: "primary_health_clinic" },
  { id: HOSPITAL_A, organisationId: ORG_A, name: "Hospital A", code: "HA", type: "district_hospital" },
  { id: CLINIC_B, organisationId: ORG_B, name: "Clinic B", code: "CB", type: "primary_health_clinic" },
];

function build(
  memberships: AuthContext["memberships"],
  options: { isPlatformAdmin?: boolean; facilities?: AuthContext["facilities"] } = {},
): AuthContext {
  const organisationIds = Array.from(new Set(memberships.map((m) => m.organisationId)));
  const orgWide = new Set(
    memberships.filter((m) => m.facilityId === null).map((m) => m.organisationId),
  );
  const explicit = new Set(
    memberships.filter((m) => m.facilityId !== null).map((m) => m.facilityId as string),
  );
  const facilities =
    options.facilities ??
    (options.isPlatformAdmin
      ? FACILITIES
      : FACILITIES.filter((f) => orgWide.has(f.organisationId) || explicit.has(f.id)));

  return {
    userId: "user",
    sessionId: "session",
    email: "user@example.invalid",
    fullName: "User",
    isPlatformAdmin: options.isPlatformAdmin ?? false,
    mfaEnabled: false,
    memberships,
    facilities,
    organisationIds,
    activeOrganisationId: organisationIds[0] ?? null,
  };
}

describe("role definitions", () => {
  it("defines permissions and copy for every role in the enum", () => {
    for (const role of userRoleEnum.enumValues) {
      expect(ROLE_PERMISSIONS[role], role).toBeDefined();
      expect(ROLE_LABELS[role], role).toBeTruthy();
      expect(ROLE_DESCRIPTIONS[role], role).toBeTruthy();
    }
  });

  it("grants only permissions that exist", () => {
    for (const role of userRoleEnum.enumValues) {
      for (const permission of ROLE_PERMISSIONS[role]) {
        expect(PERMISSIONS, `${role} grants unknown ${permission}`).toContain(permission);
      }
    }
  });

  it("gives the platform administrator every permission", () => {
    expect(new Set(ROLE_PERMISSIONS.platform_admin)).toEqual(new Set(PERMISSIONS));
  });

  it("never lets the platform role be assigned from the admin screens", () => {
    expect(ASSIGNABLE_ROLES).not.toContain("platform_admin");
  });

  it("keeps the analyst away from patient records", () => {
    expect(roleGrants("programme_analyst", "patient:read")).toBe(false);
    expect(roleGrants("programme_analyst", "referral:read")).toBe(false);
    expect(roleGrants("programme_analyst", "message:read")).toBe(false);
    expect(roleGrants("programme_analyst", "analytics:read")).toBe(true);
  });

  it("keeps clinical roles out of organisation administration", () => {
    for (const role of ["nurse_midwife", "receiving_clinician"] as const) {
      expect(roleGrants(role, "organisation:manage")).toBe(false);
      expect(roleGrants(role, "user:manage")).toBe(false);
      expect(roleGrants(role, "platform:manage")).toBe(false);
    }
  });

  it("marks the roles that must be scoped to one facility", () => {
    for (const role of FACILITY_SCOPED_ROLES) {
      expect(ASSIGNABLE_ROLES).toContain(role);
    }
    expect(FACILITY_SCOPED_ROLES).not.toContain("organisation_admin");
  });
});

describe("scoped permission checks", () => {
  const nurseAtClinicA = build([
    { organisationId: ORG_A, facilityId: CLINIC_A, role: "nurse_midwife" },
  ]);

  it("grants a permission at the facility the role was granted at", () => {
    expect(can(nurseAtClinicA, "patient:create", { facilityId: CLINIC_A })).toBe(true);
  });

  it("refuses the same permission at another facility", () => {
    expect(can(nurseAtClinicA, "patient:create", { facilityId: HOSPITAL_A })).toBe(false);
    expect(can(nurseAtClinicA, "patient:read", { facilityId: CLINIC_B })).toBe(false);
  });

  it("refuses a permission the role never carries", () => {
    expect(can(nurseAtClinicA, "referral:acknowledge", { facilityId: CLINIC_A })).toBe(false);
    expect(can(nurseAtClinicA, "analytics:read", { facilityId: CLINIC_A })).toBe(false);
  });

  it("applies an organisation wide role at every facility in that organisation", () => {
    const orgAdmin = build([
      { organisationId: ORG_A, facilityId: null, role: "organisation_admin" },
    ]);
    expect(can(orgAdmin, "referral:read", { facilityId: CLINIC_A })).toBe(true);
    expect(can(orgAdmin, "referral:read", { facilityId: HOSPITAL_A })).toBe(true);
    expect(can(orgAdmin, "referral:read", { facilityId: CLINIC_B })).toBe(false);
  });

  it("isolates organisations from each other", () => {
    const adminOfB = build([
      { organisationId: ORG_B, facilityId: null, role: "organisation_admin" },
    ]);
    expect(can(adminOfB, "patient:read", { facilityId: CLINIC_A })).toBe(false);
    expect(can(adminOfB, "patient:read", { organisationId: ORG_A })).toBe(false);
  });

  it("gives a platform administrator access everywhere", () => {
    const platform = build([], { isPlatformAdmin: true });
    expect(can(platform, "platform:manage")).toBe(true);
    expect(can(platform, "patient:read", { facilityId: CLINIC_B })).toBe(true);
  });

  it("throws a readable error when a check fails", () => {
    expect(() => assertCan(nurseAtClinicA, "referral:acknowledge", { facilityId: CLINIC_A })).toThrow(
      AuthorisationError,
    );
    expect(() => assertCan(nurseAtClinicA, "patient:create", { facilityId: CLINIC_A })).not.toThrow();
  });
});

describe("resolving roles and facilities", () => {
  const mixed = build([
    { organisationId: ORG_A, facilityId: CLINIC_A, role: "nurse_midwife" },
    { organisationId: ORG_A, facilityId: HOSPITAL_A, role: "receiving_clinician" },
  ]);

  it("resolves only the roles that apply at a facility", () => {
    expect(rolesAt(mixed, { facilityId: CLINIC_A })).toEqual(new Set(["nurse_midwife"]));
    expect(rolesAt(mixed, { facilityId: HOSPITAL_A })).toEqual(new Set(["receiving_clinician"]));
  });

  it("filters accessible facilities by permission", () => {
    expect(accessibleFacilityIds(mixed, "patient:create")).toEqual([CLINIC_A]);
    expect(accessibleFacilityIds(mixed, "referral:acknowledge")).toEqual([HOSPITAL_A]);
    expect(accessibleFacilityIds(mixed, "referral:read").sort()).toEqual(
      [CLINIC_A, HOSPITAL_A].sort(),
    );
  });

  it("reports whether a permission is held anywhere", () => {
    expect(canAnywhere(mixed, "referral:acknowledge")).toBe(true);
    expect(canAnywhere(mixed, "organisation:manage")).toBe(false);
  });

  it("reports the most senior role", () => {
    expect(highestRole(mixed)).toBe("receiving_clinician");
    expect(highestRole(build([], { isPlatformAdmin: true }))).toBe("platform_admin");
    expect(highestRole(build([]))).toBeNull();
  });

  it("gives an analyst no facility access for clinical permissions", () => {
    const analyst = build([
      { organisationId: ORG_A, facilityId: null, role: "programme_analyst" },
    ]);
    expect(accessibleFacilityIds(analyst, "patient:read")).toEqual([]);
    expect(accessibleFacilityIds(analyst, "referral:read")).toEqual([]);
    expect(accessibleFacilityIds(analyst, "analytics:read").sort()).toEqual(
      [CLINIC_A, HOSPITAL_A].sort(),
    );
  });
});
