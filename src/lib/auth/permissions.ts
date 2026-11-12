import type { UserRole } from "@/db/schema";

/**
 * Permission model.
 *
 * Permissions are checked on the server for every action. The user interface
 * hides controls a user cannot use, but hiding is never the control itself.
 *
 * A permission check always carries a scope: the organisation and, for clinical
 * work, the facility it applies to. A role granted at one facility never grants
 * anything at another.
 */

export const PERMISSIONS = [
  "patient:read",
  "patient:create",
  "patient:update",
  "patient:merge",
  "referral:read",
  "referral:create",
  "referral:submit",
  "referral:cancel",
  "referral:acknowledge",
  "referral:reject",
  "referral:schedule",
  "referral:record_attendance",
  "referral:complete_care",
  "referral:close",
  "referral:assign_coordinator",
  "referral:escalate",
  "note:create",
  "document:read",
  "document:upload",
  "task:read",
  "task:manage",
  "message:read",
  "message:send",
  "analytics:read",
  "analytics:export",
  "audit:read",
  "facility:manage",
  "user:manage",
  "organisation:manage",
  "settings:manage",
  "ai:use",
  "platform:manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const CLINICAL_READ: Permission[] = [
  "patient:read",
  "referral:read",
  "document:read",
  "message:read",
  "task:read",
];

const ORGANISATION_ADMIN: Permission[] = [
  ...CLINICAL_READ,
  "patient:create",
  "patient:update",
  "patient:merge",
  "referral:create",
  "referral:submit",
  "referral:cancel",
  "referral:acknowledge",
  "referral:reject",
  "referral:schedule",
  "referral:record_attendance",
  "referral:complete_care",
  "referral:close",
  "referral:assign_coordinator",
  "referral:escalate",
  "note:create",
  "document:upload",
  "task:manage",
  "message:send",
  "analytics:read",
  "analytics:export",
  "audit:read",
  "facility:manage",
  "user:manage",
  "organisation:manage",
  "settings:manage",
  "ai:use",
];

export const ROLE_PERMISSIONS: Record<UserRole, readonly Permission[]> = {
  platform_admin: [...PERMISSIONS],
  organisation_admin: ORGANISATION_ADMIN,
  facility_admin: [
    ...CLINICAL_READ,
    "patient:create",
    "patient:update",
    "patient:merge",
    "referral:create",
    "referral:submit",
    "referral:cancel",
    "referral:acknowledge",
    "referral:reject",
    "referral:schedule",
    "referral:record_attendance",
    "referral:complete_care",
    "referral:close",
    "referral:assign_coordinator",
    "referral:escalate",
    "note:create",
    "document:upload",
    "task:manage",
    "message:send",
    "analytics:read",
    "analytics:export",
    "audit:read",
    "facility:manage",
    "user:manage",
    "settings:manage",
    "ai:use",
  ],
  nurse_midwife: [
    ...CLINICAL_READ,
    "patient:create",
    "patient:update",
    "referral:create",
    "referral:submit",
    "referral:cancel",
    "note:create",
    "document:upload",
    "message:send",
    "ai:use",
  ],
  receiving_clinician: [
    ...CLINICAL_READ,
    "referral:acknowledge",
    "referral:reject",
    "referral:schedule",
    "referral:record_attendance",
    "referral:complete_care",
    "referral:close",
    "note:create",
    "document:upload",
    "ai:use",
  ],
  referral_coordinator: [
    ...CLINICAL_READ,
    "patient:update",
    "referral:schedule",
    "referral:record_attendance",
    "referral:assign_coordinator",
    "referral:escalate",
    "referral:close",
    "note:create",
    "task:manage",
    "message:send",
    "analytics:read",
    "ai:use",
  ],
  /**
   * Analysts work with aggregates only. They deliberately have no
   * patient:read permission anywhere in the product.
   */
  programme_analyst: ["analytics:read", "analytics:export"],
};

export function roleGrants(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export const ROLE_LABELS: Record<UserRole, string> = {
  platform_admin: "Platform administrator",
  organisation_admin: "Organisation administrator",
  facility_admin: "Facility administrator",
  nurse_midwife: "Nurse or midwife",
  receiving_clinician: "Receiving clinician",
  referral_coordinator: "Referral coordinator",
  programme_analyst: "Programme analyst",
};

export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  platform_admin: "Manages organisations, platform settings and support access.",
  organisation_admin: "Manages facilities, staff and settings across the whole organisation.",
  facility_admin: "Manages staff, settings and referral activity for one facility.",
  nurse_midwife: "Registers patients and creates outgoing referrals at one facility.",
  receiving_clinician: "Works the incoming referral queue and records care outcomes.",
  referral_coordinator: "Resolves unacknowledged referrals, missed visits and follow up.",
  programme_analyst: "Reads aggregate reporting only. Has no access to patient records.",
};

/** Roles that an organisation administrator is allowed to assign. */
export const ASSIGNABLE_ROLES: UserRole[] = [
  "organisation_admin",
  "facility_admin",
  "nurse_midwife",
  "receiving_clinician",
  "referral_coordinator",
  "programme_analyst",
];

/** Roles that must always be scoped to a single facility. */
export const FACILITY_SCOPED_ROLES: UserRole[] = [
  "facility_admin",
  "nurse_midwife",
  "receiving_clinician",
];
