import { describe, expect, it } from "vitest";

import type { ReferralStatus } from "@/db/schema";
import type { AuthContext } from "@/lib/auth/context";
import {
  ACTIVE_STATUSES,
  EXCEPTION_STATUSES,
  PATHWAY_STEPS,
  STATUS_LABELS,
  TERMINAL_STATUSES,
  TRANSITIONS,
  availableTransitions,
  checkTransition,
  findTransition,
  isValidTransition,
  nextStatuses,
  pathwayProgress,
} from "@/lib/referrals/state-machine";
import { referralStatusEnum } from "@/db/schema";

const CLINIC = "11111111-1111-4111-8111-111111111111";
const HOSPITAL = "22222222-2222-4222-8222-222222222222";
const OTHER = "33333333-3333-4333-8333-333333333333";
const ORG = "99999999-9999-4999-8999-999999999999";

const SIDES = { referringFacilityId: CLINIC, receivingFacilityId: HOSPITAL };

function context(
  overrides: Partial<AuthContext> & { memberships: AuthContext["memberships"] },
): AuthContext {
  const facilities = overrides.facilities ?? [
    { id: CLINIC, organisationId: ORG, name: "Clinic", code: "C", type: "primary_health_clinic" },
    { id: HOSPITAL, organisationId: ORG, name: "Hospital", code: "H", type: "district_hospital" },
  ];
  return {
    userId: "user-1",
    sessionId: "session-1",
    email: "test@example.invalid",
    fullName: "Test User",
    isPlatformAdmin: false,
    mfaEnabled: false,
    organisationIds: [ORG],
    activeOrganisationId: ORG,
    facilities,
    ...overrides,
  };
}

const nurseAtClinic = context({
  memberships: [{ organisationId: ORG, facilityId: CLINIC, role: "nurse_midwife" }],
  facilities: [
    { id: CLINIC, organisationId: ORG, name: "Clinic", code: "C", type: "primary_health_clinic" },
  ],
});

const clinicianAtHospital = context({
  memberships: [{ organisationId: ORG, facilityId: HOSPITAL, role: "receiving_clinician" }],
  facilities: [
    { id: HOSPITAL, organisationId: ORG, name: "Hospital", code: "H", type: "district_hospital" },
  ],
});

const coordinatorOrgWide = context({
  memberships: [{ organisationId: ORG, facilityId: null, role: "referral_coordinator" }],
});

const clinicianAtOtherHospital = context({
  memberships: [{ organisationId: ORG, facilityId: OTHER, role: "receiving_clinician" }],
  facilities: [
    { id: OTHER, organisationId: ORG, name: "Elsewhere", code: "E", type: "district_hospital" },
  ],
});

describe("transition table", () => {
  it("defines a label and description for every transition", () => {
    for (const transition of TRANSITIONS) {
      expect(transition.label.length).toBeGreaterThan(3);
      expect(transition.description.length).toBeGreaterThan(10);
    }
  });

  it("has a readable label for every status in the enum", () => {
    for (const status of referralStatusEnum.enumValues) {
      expect(STATUS_LABELS[status]).toBeTruthy();
    }
  });

  it("never defines two transitions for the same pair", () => {
    const seen = new Set<string>();
    for (const transition of TRANSITIONS) {
      const key = `${transition.from}->${transition.to}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it("allows no transition out of a terminal status", () => {
    for (const status of TERMINAL_STATUSES) {
      expect(nextStatuses(status)).toEqual([]);
    }
  });

  it("makes every non terminal status reachable from draft", () => {
    const reachable = new Set<ReferralStatus>(["draft"]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const status of Array.from(reachable)) {
        for (const next of nextStatuses(status)) {
          if (!reachable.has(next)) {
            reachable.add(next);
            changed = true;
          }
        }
      }
    }
    for (const status of referralStatusEnum.enumValues) {
      expect(reachable.has(status), `${status} is unreachable from draft`).toBe(true);
    }
  });

  it("classifies every status as active, exception or terminal where expected", () => {
    for (const status of ACTIVE_STATUSES) {
      expect(TERMINAL_STATUSES).not.toContain(status);
    }
    for (const status of EXCEPTION_STATUSES) {
      expect(STATUS_LABELS[status]).toBeTruthy();
    }
  });
});

describe("valid and invalid transitions", () => {
  it("accepts the happy path", () => {
    const path: [ReferralStatus, ReferralStatus][] = [
      ["draft", "submitted"],
      ["submitted", "acknowledged"],
      ["acknowledged", "appointment_scheduled"],
      ["appointment_scheduled", "patient_attended"],
      ["patient_attended", "care_completed"],
      ["care_completed", "closed"],
    ];
    for (const [from, to] of path) {
      expect(isValidTransition(from, to), `${from} to ${to}`).toBe(true);
    }
  });

  it("rejects impossible jumps", () => {
    const impossible: [ReferralStatus, ReferralStatus][] = [
      ["draft", "closed"],
      ["draft", "acknowledged"],
      ["submitted", "patient_attended"],
      ["submitted", "care_completed"],
      ["acknowledged", "closed"],
      ["closed", "submitted"],
      ["cancelled", "submitted"],
      ["care_completed", "submitted"],
      ["appointment_scheduled", "acknowledged"],
    ];
    for (const [from, to] of impossible) {
      expect(isValidTransition(from, to), `${from} to ${to} should be rejected`).toBe(false);
      expect(findTransition(from, to)).toBeNull();
    }
  });

  it("explains why an impossible transition was refused", () => {
    const result = checkTransition(clinicianAtHospital, SIDES, "submitted", "closed");
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toContain("cannot move from");
    }
  });
});

describe("who may perform a transition", () => {
  it("lets the receiving facility acknowledge", () => {
    expect(checkTransition(clinicianAtHospital, SIDES, "submitted", "acknowledged").allowed).toBe(
      true,
    );
  });

  it("stops the referring clinic acknowledging on the hospital's behalf", () => {
    const result = checkTransition(nurseAtClinic, SIDES, "submitted", "acknowledged");
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toContain("receiving facility");
    }
  });

  it("stops a clinician at an unrelated facility acting at all", () => {
    const result = checkTransition(clinicianAtOtherHospital, SIDES, "submitted", "acknowledged");
    expect(result.allowed).toBe(false);
  });

  it("stops the hospital cancelling a referral the clinic owns", () => {
    const result = checkTransition(
      clinicianAtHospital,
      SIDES,
      "submitted",
      "cancelled",
      "no longer needed",
    );
    expect(result.allowed).toBe(false);
  });

  it("lets the referring clinic cancel", () => {
    expect(
      checkTransition(nurseAtClinic, SIDES, "submitted", "cancelled", "patient moved away").allowed,
    ).toBe(true);
  });

  it("lets an organisation wide coordinator act on either side", () => {
    expect(
      checkTransition(coordinatorOrgWide, SIDES, "missed_appointment", "escalated", "no contact")
        .allowed,
    ).toBe(true);
    expect(
      checkTransition(coordinatorOrgWide, SIDES, "acknowledged", "appointment_scheduled").allowed,
    ).toBe(true);
  });

  it("refuses a nurse the permissions their role does not carry", () => {
    const nurseAtHospital = context({
      memberships: [{ organisationId: ORG, facilityId: HOSPITAL, role: "nurse_midwife" }],
      facilities: [
        {
          id: HOSPITAL,
          organisationId: ORG,
          name: "Hospital",
          code: "H",
          type: "district_hospital",
        },
      ],
    });
    const result = checkTransition(nurseAtHospital, SIDES, "submitted", "acknowledged");
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toContain("role");
    }
  });
});

describe("notes required on a transition", () => {
  it("refuses a rejection with no reason", () => {
    const result = checkTransition(clinicianAtHospital, SIDES, "submitted", "rejected");
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.reason).toContain("reason is required");
  });

  it("accepts a rejection with a reason", () => {
    const result = checkTransition(
      clinicianAtHospital,
      SIDES,
      "submitted",
      "rejected",
      "Managed at district level.",
    );
    expect(result.allowed).toBe(true);
  });

  it("treats whitespace as no reason", () => {
    const result = checkTransition(clinicianAtHospital, SIDES, "submitted", "rejected", "   ");
    expect(result.allowed).toBe(false);
  });
});

describe("available transitions", () => {
  it("offers the hospital acknowledge and reject on a submitted referral", () => {
    const options = availableTransitions(clinicianAtHospital, SIDES, "submitted").map((t) => t.to);
    expect(options).toContain("acknowledged");
    expect(options).toContain("rejected");
    expect(options).not.toContain("cancelled");
  });

  it("offers the clinic only cancellation on a submitted referral", () => {
    const options = availableTransitions(nurseAtClinic, SIDES, "submitted").map((t) => t.to);
    expect(options).toEqual(["cancelled"]);
  });

  it("offers nothing on a closed referral", () => {
    expect(availableTransitions(clinicianAtHospital, SIDES, "closed")).toEqual([]);
    expect(availableTransitions(coordinatorOrgWide, SIDES, "cancelled")).toEqual([]);
  });

  it("offers nothing to someone with no role at either facility", () => {
    expect(availableTransitions(clinicianAtOtherHospital, SIDES, "submitted")).toEqual([]);
  });
});

describe("pathway progress", () => {
  it("increases along the happy path", () => {
    const values = PATHWAY_STEPS.map((status) => pathwayProgress(status));
    for (let index = 1; index < values.length; index += 1) {
      expect(values[index]).toBeGreaterThan(values[index - 1]);
    }
  });

  it("returns a position for every status", () => {
    for (const status of referralStatusEnum.enumValues) {
      expect(pathwayProgress(status)).toBeGreaterThanOrEqual(0);
    }
  });
});
