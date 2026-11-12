import type { ReferralStatus } from "@/db/schema";
import type { AuthContext } from "@/lib/auth/context";
import { can } from "@/lib/auth/context";
import type { Permission } from "@/lib/auth/permissions";
import { ConflictError } from "@/lib/errors";

/**
 * Referral state machine.
 *
 * This module is pure: it knows nothing about the database or the request. Every
 * status change in the product goes through `assertTransition`, so the set of
 * legal referral histories is defined in exactly one place and can be tested
 * exhaustively.
 *
 * Which facility a user must belong to is part of the transition definition.
 * A clinician at the referring clinic cannot acknowledge on behalf of the
 * receiving hospital even if their role carries the permission elsewhere.
 */

export type ActorSide = "referring" | "receiving" | "either";

export type TransitionDefinition = {
  from: ReferralStatus;
  to: ReferralStatus;
  permission: Permission;
  actorSide: ActorSide;
  /** Short imperative label for the action button. */
  label: string;
  description: string;
  /** When true the caller must supply a note explaining the change. */
  requiresNote: boolean;
};

export const TRANSITIONS: readonly TransitionDefinition[] = [
  {
    from: "draft",
    to: "submitted",
    permission: "referral:submit",
    actorSide: "referring",
    label: "Submit referral",
    description: "Send the referral to the receiving facility queue.",
    requiresNote: false,
  },
  {
    from: "draft",
    to: "cancelled",
    permission: "referral:cancel",
    actorSide: "referring",
    label: "Discard draft",
    description: "Cancel a referral that was never sent.",
    requiresNote: true,
  },
  {
    from: "submitted",
    to: "received",
    permission: "referral:read",
    actorSide: "receiving",
    label: "Mark as received",
    description: "Confirm the referral has reached the receiving facility queue.",
    requiresNote: false,
  },
  {
    from: "submitted",
    to: "acknowledged",
    permission: "referral:acknowledge",
    actorSide: "receiving",
    label: "Acknowledge referral",
    description: "Accept clinical responsibility for arranging the visit.",
    requiresNote: false,
  },
  {
    from: "submitted",
    to: "rejected",
    permission: "referral:reject",
    actorSide: "receiving",
    label: "Reject referral",
    description: "Decline the referral and return it with a reason.",
    requiresNote: true,
  },
  {
    from: "submitted",
    to: "cancelled",
    permission: "referral:cancel",
    actorSide: "referring",
    label: "Cancel referral",
    description: "Withdraw the referral before it is acted on.",
    requiresNote: true,
  },
  {
    from: "received",
    to: "acknowledged",
    permission: "referral:acknowledge",
    actorSide: "receiving",
    label: "Acknowledge referral",
    description: "Accept clinical responsibility for arranging the visit.",
    requiresNote: false,
  },
  {
    from: "received",
    to: "rejected",
    permission: "referral:reject",
    actorSide: "receiving",
    label: "Reject referral",
    description: "Decline the referral and return it with a reason.",
    requiresNote: true,
  },
  {
    from: "received",
    to: "cancelled",
    permission: "referral:cancel",
    actorSide: "referring",
    label: "Cancel referral",
    description: "Withdraw the referral before it is acted on.",
    requiresNote: true,
  },
  {
    from: "acknowledged",
    to: "appointment_scheduled",
    permission: "referral:schedule",
    actorSide: "receiving",
    label: "Schedule appointment",
    description: "Book the date and time of the visit.",
    requiresNote: false,
  },
  {
    from: "acknowledged",
    to: "escalated",
    permission: "referral:escalate",
    actorSide: "either",
    label: "Escalate",
    description: "Raise the referral for coordinator attention.",
    requiresNote: true,
  },
  {
    from: "acknowledged",
    to: "cancelled",
    permission: "referral:cancel",
    actorSide: "referring",
    label: "Cancel referral",
    description: "Withdraw the referral and inform the receiving facility.",
    requiresNote: true,
  },
  {
    from: "appointment_scheduled",
    to: "appointment_scheduled",
    permission: "referral:schedule",
    actorSide: "receiving",
    label: "Reschedule appointment",
    description: "Replace the booking with a new date and time.",
    requiresNote: false,
  },
  {
    from: "appointment_scheduled",
    to: "patient_attended",
    permission: "referral:record_attendance",
    actorSide: "receiving",
    label: "Record attendance",
    description: "Confirm the patient arrived for the appointment.",
    requiresNote: false,
  },
  {
    from: "appointment_scheduled",
    to: "missed_appointment",
    permission: "referral:record_attendance",
    actorSide: "receiving",
    label: "Record missed appointment",
    description: "Record that the patient did not attend.",
    requiresNote: false,
  },
  {
    from: "appointment_scheduled",
    to: "escalated",
    permission: "referral:escalate",
    actorSide: "either",
    label: "Escalate",
    description: "Raise the referral for coordinator attention.",
    requiresNote: true,
  },
  {
    from: "appointment_scheduled",
    to: "cancelled",
    permission: "referral:cancel",
    actorSide: "referring",
    label: "Cancel referral",
    description: "Withdraw the referral and release the booking.",
    requiresNote: true,
  },
  {
    from: "patient_attended",
    to: "care_completed",
    permission: "referral:complete_care",
    actorSide: "receiving",
    label: "Record care outcome",
    description: "Document the care provided and close the hospital episode.",
    requiresNote: false,
  },
  {
    from: "patient_attended",
    to: "follow_up_required",
    permission: "referral:complete_care",
    actorSide: "receiving",
    label: "Request follow up",
    description: "Return the patient to the referring facility for follow up.",
    requiresNote: true,
  },
  {
    from: "patient_attended",
    to: "escalated",
    permission: "referral:escalate",
    actorSide: "either",
    label: "Escalate",
    description: "Raise the referral for coordinator attention.",
    requiresNote: true,
  },
  {
    from: "care_completed",
    to: "follow_up_required",
    permission: "referral:complete_care",
    actorSide: "either",
    label: "Request follow up",
    description: "Open a follow up task at the referring facility.",
    requiresNote: true,
  },
  {
    from: "care_completed",
    to: "closed",
    permission: "referral:close",
    actorSide: "either",
    label: "Close referral",
    description: "Complete the pathway with no further action required.",
    requiresNote: false,
  },
  {
    from: "follow_up_required",
    to: "follow_up_completed",
    permission: "referral:close",
    actorSide: "either",
    label: "Record follow up complete",
    description: "Confirm the follow up contact or visit took place.",
    requiresNote: false,
  },
  {
    from: "follow_up_required",
    to: "appointment_scheduled",
    permission: "referral:schedule",
    actorSide: "receiving",
    label: "Schedule follow up visit",
    description: "Book a further appointment at the receiving facility.",
    requiresNote: false,
  },
  {
    from: "follow_up_required",
    to: "unable_to_contact",
    permission: "referral:escalate",
    actorSide: "either",
    label: "Record unable to contact",
    description: "Document that outreach attempts did not reach the patient.",
    requiresNote: true,
  },
  {
    from: "follow_up_required",
    to: "escalated",
    permission: "referral:escalate",
    actorSide: "either",
    label: "Escalate",
    description: "Raise the referral for coordinator attention.",
    requiresNote: true,
  },
  {
    from: "follow_up_completed",
    to: "closed",
    permission: "referral:close",
    actorSide: "either",
    label: "Close referral",
    description: "Complete the pathway.",
    requiresNote: false,
  },
  {
    from: "missed_appointment",
    to: "appointment_scheduled",
    permission: "referral:schedule",
    actorSide: "receiving",
    label: "Rebook appointment",
    description: "Offer the patient a new date after a missed visit.",
    requiresNote: false,
  },
  {
    from: "missed_appointment",
    to: "unable_to_contact",
    permission: "referral:escalate",
    actorSide: "either",
    label: "Record unable to contact",
    description: "Document that outreach attempts did not reach the patient.",
    requiresNote: true,
  },
  {
    from: "missed_appointment",
    to: "escalated",
    permission: "referral:escalate",
    actorSide: "either",
    label: "Escalate",
    description: "Raise the referral for coordinator attention.",
    requiresNote: true,
  },
  {
    from: "missed_appointment",
    to: "patient_attended",
    permission: "referral:record_attendance",
    actorSide: "receiving",
    label: "Correct to attended",
    description: "Record that the patient did arrive after all.",
    requiresNote: true,
  },
  {
    from: "missed_appointment",
    to: "cancelled",
    permission: "referral:cancel",
    actorSide: "referring",
    label: "Cancel referral",
    description: "Withdraw the referral after a missed visit.",
    requiresNote: true,
  },
  {
    from: "unable_to_contact",
    to: "appointment_scheduled",
    permission: "referral:schedule",
    actorSide: "receiving",
    label: "Rebook appointment",
    description: "Book a visit once contact is re-established.",
    requiresNote: false,
  },
  {
    from: "unable_to_contact",
    to: "escalated",
    permission: "referral:escalate",
    actorSide: "either",
    label: "Escalate",
    description: "Raise the referral for coordinator attention.",
    requiresNote: true,
  },
  {
    from: "unable_to_contact",
    to: "closed",
    permission: "referral:close",
    actorSide: "either",
    label: "Close referral",
    description: "Close the pathway and record the outcome.",
    requiresNote: true,
  },
  {
    from: "escalated",
    to: "appointment_scheduled",
    permission: "referral:schedule",
    actorSide: "receiving",
    label: "Schedule appointment",
    description: "Book a visit as the escalation outcome.",
    requiresNote: false,
  },
  {
    from: "escalated",
    to: "acknowledged",
    permission: "referral:acknowledge",
    actorSide: "receiving",
    label: "Acknowledge referral",
    description: "Accept the referral after escalation.",
    requiresNote: false,
  },
  {
    from: "escalated",
    to: "follow_up_required",
    permission: "referral:escalate",
    actorSide: "either",
    label: "Return to follow up",
    description: "Hand the referral back to the follow up queue.",
    requiresNote: true,
  },
  {
    from: "escalated",
    to: "unable_to_contact",
    permission: "referral:escalate",
    actorSide: "either",
    label: "Record unable to contact",
    description: "Document that outreach attempts did not reach the patient.",
    requiresNote: true,
  },
  {
    from: "escalated",
    to: "closed",
    permission: "referral:close",
    actorSide: "either",
    label: "Close referral",
    description: "Close the pathway and record the escalation outcome.",
    requiresNote: true,
  },
  {
    from: "escalated",
    to: "cancelled",
    permission: "referral:cancel",
    actorSide: "referring",
    label: "Cancel referral",
    description: "Withdraw the referral after escalation.",
    requiresNote: true,
  },
  {
    from: "rejected",
    to: "closed",
    permission: "referral:close",
    actorSide: "referring",
    label: "Close referral",
    description: "Acknowledge the rejection and close the pathway.",
    requiresNote: false,
  },
] as const;

/** Statuses from which no further transition is possible. */
export const TERMINAL_STATUSES: readonly ReferralStatus[] = ["closed", "cancelled"];

/** Statuses that represent an open pathway needing attention. */
export const ACTIVE_STATUSES: readonly ReferralStatus[] = [
  "submitted",
  "received",
  "acknowledged",
  "appointment_scheduled",
  "patient_attended",
  "care_completed",
  "follow_up_required",
  "missed_appointment",
  "unable_to_contact",
  "escalated",
];

/** Statuses that indicate the pathway did not complete as planned. */
export const EXCEPTION_STATUSES: readonly ReferralStatus[] = [
  "rejected",
  "cancelled",
  "missed_appointment",
  "unable_to_contact",
  "escalated",
];

export const STATUS_LABELS: Record<ReferralStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  received: "Received",
  acknowledged: "Acknowledged",
  appointment_scheduled: "Appointment scheduled",
  patient_attended: "Patient attended",
  care_completed: "Care completed",
  follow_up_required: "Follow up required",
  follow_up_completed: "Follow up completed",
  closed: "Closed",
  rejected: "Rejected",
  cancelled: "Cancelled",
  missed_appointment: "Missed appointment",
  unable_to_contact: "Unable to contact",
  escalated: "Escalated",
};

export type StatusTone = "neutral" | "progress" | "positive" | "warning" | "critical";

export const STATUS_TONES: Record<ReferralStatus, StatusTone> = {
  draft: "neutral",
  submitted: "progress",
  received: "progress",
  acknowledged: "progress",
  appointment_scheduled: "progress",
  patient_attended: "positive",
  care_completed: "positive",
  follow_up_required: "warning",
  follow_up_completed: "positive",
  closed: "neutral",
  rejected: "critical",
  cancelled: "neutral",
  missed_appointment: "warning",
  unable_to_contact: "warning",
  escalated: "critical",
};

/** The expected happy path, used for the pathway progress indicator. */
export const PATHWAY_STEPS: readonly ReferralStatus[] = [
  "submitted",
  "acknowledged",
  "appointment_scheduled",
  "patient_attended",
  "care_completed",
  "closed",
];

export function findTransition(
  from: ReferralStatus,
  to: ReferralStatus,
): TransitionDefinition | null {
  return TRANSITIONS.find((t) => t.from === from && t.to === to) ?? null;
}

export function isValidTransition(from: ReferralStatus, to: ReferralStatus): boolean {
  return findTransition(from, to) !== null;
}

export function nextStatuses(from: ReferralStatus): ReferralStatus[] {
  return TRANSITIONS.filter((t) => t.from === from).map((t) => t.to);
}

export type ReferralSides = {
  referringFacilityId: string;
  receivingFacilityId: string;
};

/** True when the actor belongs to the facility side the transition requires. */
export function actorSatisfiesSide(
  ctx: AuthContext,
  sides: ReferralSides,
  definition: TransitionDefinition,
): boolean {
  const facilityIds = new Set(ctx.facilities.map((f) => f.id));
  if (ctx.isPlatformAdmin) return true;
  switch (definition.actorSide) {
    case "referring":
      return facilityIds.has(sides.referringFacilityId);
    case "receiving":
      return facilityIds.has(sides.receivingFacilityId);
    case "either":
      return (
        facilityIds.has(sides.referringFacilityId) || facilityIds.has(sides.receivingFacilityId)
      );
  }
}

function scopeFacilityFor(sides: ReferralSides, definition: TransitionDefinition): string {
  return definition.actorSide === "referring" ? sides.referringFacilityId : sides.receivingFacilityId;
}

export type TransitionCheck =
  | { allowed: true; definition: TransitionDefinition }
  | { allowed: false; reason: string };

export function checkTransition(
  ctx: AuthContext,
  sides: ReferralSides,
  from: ReferralStatus,
  to: ReferralStatus,
  note?: string | null,
): TransitionCheck {
  const definition = findTransition(from, to);
  if (!definition) {
    return {
      allowed: false,
      reason: `A referral cannot move from ${STATUS_LABELS[from]} to ${STATUS_LABELS[to]}.`,
    };
  }
  if (!actorSatisfiesSide(ctx, sides, definition)) {
    const side = definition.actorSide === "referring" ? "referring" : "receiving";
    return {
      allowed: false,
      reason: `Only staff at the ${side} facility can take this action.`,
    };
  }

  // Check the permission at every facility the actor could be acting through.
  const candidates =
    definition.actorSide === "either"
      ? [sides.referringFacilityId, sides.receivingFacilityId]
      : [scopeFacilityFor(sides, definition)];

  const permitted = candidates.some(
    (facilityId) =>
      ctx.facilities.some((f) => f.id === facilityId) &&
      can(ctx, definition.permission, { facilityId }),
  );
  if (!permitted && !ctx.isPlatformAdmin) {
    return { allowed: false, reason: "Your role does not allow this action." };
  }
  if (definition.requiresNote && !note?.trim()) {
    return { allowed: false, reason: "A reason is required for this action." };
  }
  return { allowed: true, definition };
}

export function assertTransition(
  ctx: AuthContext,
  sides: ReferralSides,
  from: ReferralStatus,
  to: ReferralStatus,
  note?: string | null,
): TransitionDefinition {
  const result = checkTransition(ctx, sides, from, to, note);
  if (!result.allowed) {
    throw new ConflictError(result.reason);
  }
  return result.definition;
}

/** Transitions the current user may perform on a referral in its current state. */
export function availableTransitions(
  ctx: AuthContext,
  sides: ReferralSides,
  from: ReferralStatus,
): TransitionDefinition[] {
  return TRANSITIONS.filter((definition) => {
    if (definition.from !== from) return false;
    const result = checkTransition(
      ctx,
      sides,
      from,
      definition.to,
      definition.requiresNote ? "placeholder" : null,
    );
    return result.allowed;
  });
}

/** Index of the pathway step reached, used to render progress. */
export function pathwayProgress(status: ReferralStatus): number {
  const reachedByStatus: Partial<Record<ReferralStatus, number>> = {
    draft: 0,
    submitted: 1,
    received: 1,
    acknowledged: 2,
    appointment_scheduled: 3,
    missed_appointment: 3,
    unable_to_contact: 3,
    escalated: 3,
    patient_attended: 4,
    care_completed: 5,
    follow_up_required: 5,
    follow_up_completed: 5,
    closed: 6,
    rejected: 1,
    cancelled: 0,
  };
  return reachedByStatus[status] ?? 0;
}
