"use server";

import { and, eq, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import {
  departments,
  escalationPolicies,
  facilities,
  facilityTypeEnum,
  invitations,
  memberships,
  referralPathways,
  userRoleEnum,
  users,
} from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import { assertCan, assertFacilityAccess, type AuthContext } from "@/lib/auth/context";
import { ASSIGNABLE_ROLES, FACILITY_SCOPED_ROLES } from "@/lib/auth/permissions";
import { generateToken, hashToken } from "@/lib/auth/tokens";
import { requireAuth } from "@/lib/auth/session";
import { absoluteUrl, sendOperationalEmail } from "@/lib/email";
import { AuthorisationError, ValidationError } from "@/lib/errors";
import { errorState, parseForm, successState, toActionError, type ActionState } from "../action-result";

/**
 * Organisation administration.
 *
 * Every action resolves the organisation from the record being changed and
 * checks the caller's permission in that scope. A facility administrator can
 * only act inside their own facility.
 */

function assertOrganisationScope(ctx: AuthContext, organisationId: string) {
  if (!ctx.isPlatformAdmin && !ctx.organisationIds.includes(organisationId)) {
    throw new AuthorisationError("That organisation is not available to you.");
  }
}

const inviteSchema = z.object({
  organisationId: z.string().uuid(),
  email: z.string().trim().toLowerCase().email("Enter a valid work email address."),
  fullName: z.string().trim().min(2, "Enter the person's name.").max(160),
  role: z.enum(userRoleEnum.enumValues),
  facilityId: z.string().uuid().optional().or(z.literal("")),
});

export async function inviteStaffAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const ctx = await requireAuth();
    const input = parseForm(inviteSchema, formData);
    assertOrganisationScope(ctx, input.organisationId);

    if (!ASSIGNABLE_ROLES.includes(input.role)) {
      return errorState("That role cannot be assigned from here.");
    }
    if (FACILITY_SCOPED_ROLES.includes(input.role) && !input.facilityId) {
      return errorState("Choose the facility this person works at.", {
        facilityId: ["This role must be scoped to one facility."],
      });
    }

    if (input.facilityId) {
      assertFacilityAccess(ctx, input.facilityId);
      assertCan(ctx, "user:manage", { facilityId: input.facilityId });
    } else {
      assertCan(ctx, "user:manage", { organisationId: input.organisationId });
      if (!ctx.isPlatformAdmin) {
        // Only an organisation administrator may create organisation wide roles.
        const isOrgAdmin = ctx.memberships.some(
          (membership) =>
            membership.organisationId === input.organisationId &&
            membership.facilityId === null &&
            membership.role === "organisation_admin",
        );
        if (!isOrgAdmin) {
          return errorState(
            "Only an organisation administrator can create organisation wide roles.",
          );
        }
      }
    }

    const [existingMembership] = await db
      .select({ id: memberships.id })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(
        and(
          eq(users.email, input.email),
          eq(memberships.organisationId, input.organisationId),
          eq(memberships.role, input.role),
        ),
      )
      .limit(1);

    if (existingMembership) {
      return errorState("That person already holds this role in this organisation.");
    }

    const token = generateToken();
    const [invitation] = await db
      .insert(invitations)
      .values({
        email: input.email,
        organisationId: input.organisationId,
        facilityId: input.facilityId || null,
        role: input.role,
        fullName: input.fullName,
        tokenHash: hashToken(token),
        invitedByUserId: ctx.userId,
        expiresAt: new Date(Date.now() + 7 * 86_400_000),
      })
      .returning({ id: invitations.id });

    const link = absoluteUrl(`/accept-invitation?token=${token}`);
    const delivery = await sendOperationalEmail({
      to: input.email,
      subject: "You have been invited to Kea",
      body: [
        `Hello ${input.fullName},`,
        "",
        `${ctx.fullName} has invited you to Kea, the maternal referral coordination system used by your service.`,
        "",
        "Open this link within seven days to set your password:",
        link,
        "",
        "If you were not expecting this invitation, you can ignore this message.",
      ].join("\n"),
    });

    await recordAudit({
      organisationId: input.organisationId,
      actorUserId: ctx.userId,
      action: "user.invite",
      resourceType: "invitation",
      resourceId: invitation.id,
      metadata: { role: input.role, facilityId: input.facilityId || undefined },
    });

    revalidatePath("/app/admin/staff");

    if (!delivery.delivered) {
      return successState(
        `The invitation was created, but email is not configured so it was not sent. Share this link with them directly: ${link}`,
      );
    }
    return successState(`An invitation has been emailed to ${input.email}.`);
  } catch (error) {
    return toActionError(error);
  }
}

const revokeInviteSchema = z.object({ invitationId: z.string().uuid() });

export async function revokeInvitationAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const ctx = await requireAuth();
    const input = parseForm(revokeInviteSchema, formData);

    const [invitation] = await db
      .select()
      .from(invitations)
      .where(eq(invitations.id, input.invitationId))
      .limit(1);
    if (!invitation) return errorState("That invitation could not be found.");

    assertOrganisationScope(ctx, invitation.organisationId);
    assertCan(ctx, "user:manage", {
      organisationId: invitation.organisationId,
      facilityId: invitation.facilityId,
    });

    await db
      .update(invitations)
      .set({ revokedAt: new Date() })
      .where(eq(invitations.id, invitation.id));

    await recordAudit({
      organisationId: invitation.organisationId,
      actorUserId: ctx.userId,
      action: "user.invitation_revoke",
      resourceType: "invitation",
      resourceId: invitation.id,
    });

    revalidatePath("/app/admin/staff");
    return successState("Invitation revoked.");
  } catch (error) {
    return toActionError(error);
  }
}

const statusSchema = z.object({
  userId: z.string().uuid(),
  organisationId: z.string().uuid(),
  status: z.enum(["active", "suspended"]),
});

export async function setUserStatusAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const ctx = await requireAuth();
    const input = parseForm(statusSchema, formData);
    assertOrganisationScope(ctx, input.organisationId);
    assertCan(ctx, "user:manage", { organisationId: input.organisationId });

    if (input.userId === ctx.userId) {
      return errorState("You cannot change the status of your own account.");
    }

    const [membership] = await db
      .select({ id: memberships.id })
      .from(memberships)
      .where(
        and(
          eq(memberships.userId, input.userId),
          eq(memberships.organisationId, input.organisationId),
        ),
      )
      .limit(1);
    if (!membership) return errorState("That person is not in your organisation.");

    await db.update(users).set({ status: input.status }).where(eq(users.id, input.userId));

    if (input.status === "suspended") {
      const { revokeAllSessionsForUser } = await import("@/lib/auth/session");
      await revokeAllSessionsForUser(input.userId);
    }

    await recordAudit({
      organisationId: input.organisationId,
      actorUserId: ctx.userId,
      action: input.status === "suspended" ? "user.suspend" : "user.reactivate",
      resourceType: "user",
      resourceId: input.userId,
      metadata: { targetUserId: input.userId },
    });

    revalidatePath("/app/admin/staff");
    return successState(
      input.status === "suspended"
        ? "The account has been suspended and its sessions ended."
        : "The account has been reactivated.",
    );
  } catch (error) {
    return toActionError(error);
  }
}

const membershipSchema = z.object({
  userId: z.string().uuid(),
  organisationId: z.string().uuid(),
  role: z.enum(userRoleEnum.enumValues),
  facilityId: z.string().uuid().optional().or(z.literal("")),
  operation: z.enum(["add", "remove"]),
});

export async function changeMembershipAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const ctx = await requireAuth();
    const input = parseForm(membershipSchema, formData);
    assertOrganisationScope(ctx, input.organisationId);
    assertCan(ctx, "user:manage", {
      organisationId: input.organisationId,
      facilityId: input.facilityId || undefined,
    });

    if (!ASSIGNABLE_ROLES.includes(input.role)) {
      return errorState("That role cannot be assigned from here.");
    }
    if (FACILITY_SCOPED_ROLES.includes(input.role) && !input.facilityId) {
      return errorState("This role must be scoped to one facility.");
    }
    if (input.userId === ctx.userId && input.operation === "remove") {
      return errorState("You cannot remove your own role.");
    }

    if (input.operation === "add") {
      await db
        .insert(memberships)
        .values({
          userId: input.userId,
          organisationId: input.organisationId,
          facilityId: input.facilityId || null,
          role: input.role,
        })
        .onConflictDoNothing();
    } else {
      await db
        .delete(memberships)
        .where(
          and(
            eq(memberships.userId, input.userId),
            eq(memberships.organisationId, input.organisationId),
            eq(memberships.role, input.role),
            input.facilityId
              ? eq(memberships.facilityId, input.facilityId)
              : isNull(memberships.facilityId),
          ),
        );
    }

    await recordAudit({
      organisationId: input.organisationId,
      actorUserId: ctx.userId,
      action: input.operation === "add" ? "user.role_add" : "user.role_remove",
      resourceType: "membership",
      resourceId: input.userId,
      metadata: { role: input.role, facilityId: input.facilityId || undefined },
    });

    revalidatePath("/app/admin/staff");
    return successState(input.operation === "add" ? "Role added." : "Role removed.");
  } catch (error) {
    return toActionError(error);
  }
}

const facilitySchema = z.object({
  organisationId: z.string().uuid(),
  name: z.string().trim().min(2, "Enter the facility name.").max(180),
  code: z
    .string()
    .trim()
    .min(2, "Enter a short code.")
    .max(40)
    .regex(/^[A-Za-z0-9-]+$/, "Use letters, numbers and hyphens only."),
  type: z.enum(facilityTypeEnum.enumValues),
  district: z.string().trim().max(120).optional().or(z.literal("")),
  province: z.string().trim().max(120).optional().or(z.literal("")),
  addressLine: z.string().trim().max(240).optional().or(z.literal("")),
  phone: z.string().trim().max(32).optional().or(z.literal("")),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
});

export async function createFacilityAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const ctx = await requireAuth();
    const input = parseForm(facilitySchema, formData);
    assertOrganisationScope(ctx, input.organisationId);
    assertCan(ctx, "organisation:manage", { organisationId: input.organisationId });

    const [existing] = await db
      .select({ id: facilities.id })
      .from(facilities)
      .where(
        and(
          eq(facilities.organisationId, input.organisationId),
          eq(facilities.code, input.code.toUpperCase()),
        ),
      )
      .limit(1);
    if (existing) {
      return errorState("That facility code is already used.", {
        code: ["Choose a different code."],
      });
    }

    const [facility] = await db
      .insert(facilities)
      .values({
        organisationId: input.organisationId,
        name: input.name,
        code: input.code.toUpperCase(),
        type: input.type,
        district: input.district || null,
        province: input.province || null,
        addressLine: input.addressLine || null,
        phone: input.phone || null,
        latitude: input.latitude !== undefined ? String(input.latitude) : null,
        longitude: input.longitude !== undefined ? String(input.longitude) : null,
      })
      .returning({ id: facilities.id });

    await recordAudit({
      organisationId: input.organisationId,
      actorUserId: ctx.userId,
      action: "facility.create",
      resourceType: "facility",
      resourceId: facility.id,
    });

    revalidatePath("/app/admin/facilities");
    return successState(`${input.name} has been added.`);
  } catch (error) {
    return toActionError(error);
  }
}

const departmentSchema = z.object({
  facilityId: z.string().uuid(),
  name: z.string().trim().min(2, "Enter the department name.").max(140),
  serviceType: z.string().trim().min(2, "Enter the service type.").max(80),
});

export async function createDepartmentAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const ctx = await requireAuth();
    const input = parseForm(departmentSchema, formData);
    const facility = assertFacilityAccess(ctx, input.facilityId);
    assertCan(ctx, "facility:manage", { facilityId: facility.id });

    await db
      .insert(departments)
      .values({
        facilityId: input.facilityId,
        name: input.name,
        serviceType: input.serviceType,
      })
      .onConflictDoNothing();

    await recordAudit({
      organisationId: facility.organisationId,
      actorUserId: ctx.userId,
      action: "department.create",
      resourceType: "department",
      metadata: { facilityId: facility.id },
    });

    revalidatePath("/app/admin/facilities");
    return successState(`${input.name} has been added to ${facility.name}.`);
  } catch (error) {
    return toActionError(error);
  }
}

const pathwaySchema = z.object({
  referringFacilityId: z.string().uuid(),
  receivingFacilityId: z.string().uuid(),
  operation: z.enum(["add", "remove"]),
});

export async function changePathwayAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const ctx = await requireAuth();
    const input = parseForm(pathwaySchema, formData);

    if (input.referringFacilityId === input.receivingFacilityId) {
      return errorState("A facility cannot refer to itself.");
    }

    const referring = assertFacilityAccess(ctx, input.referringFacilityId);
    const receiving = assertFacilityAccess(ctx, input.receivingFacilityId);
    assertCan(ctx, "organisation:manage", { organisationId: referring.organisationId });

    if (referring.organisationId !== receiving.organisationId) {
      return errorState("Both facilities must be in the same organisation.");
    }

    if (input.operation === "add") {
      await db
        .insert(referralPathways)
        .values({
          organisationId: referring.organisationId,
          referringFacilityId: input.referringFacilityId,
          receivingFacilityId: input.receivingFacilityId,
        })
        .onConflictDoNothing();
    } else {
      await db
        .delete(referralPathways)
        .where(
          and(
            eq(referralPathways.referringFacilityId, input.referringFacilityId),
            eq(referralPathways.receivingFacilityId, input.receivingFacilityId),
          ),
        );
    }

    await recordAudit({
      organisationId: referring.organisationId,
      actorUserId: ctx.userId,
      action: input.operation === "add" ? "pathway.create" : "pathway.remove",
      resourceType: "referral_pathway",
      metadata: {
        referringFacilityId: input.referringFacilityId,
        receivingFacilityId: input.receivingFacilityId,
      },
    });

    revalidatePath("/app/admin/pathways");
    return successState(input.operation === "add" ? "Pathway added." : "Pathway removed.");
  } catch (error) {
    return toActionError(error);
  }
}

const policySchema = z.object({
  organisationId: z.string().uuid(),
  facilityId: z.string().uuid().optional().or(z.literal("")),
  acknowledgementDueHours: z.coerce.number().int().min(1).max(720),
  urgentAcknowledgementDueHours: z.coerce.number().int().min(1).max(720),
  missedAppointmentGraceHours: z.coerce.number().int().min(1).max(336),
  followUpDueDays: z.coerce.number().int().min(1).max(180),
  contactAttemptsBeforeEscalation: z.coerce.number().int().min(1).max(20),
  appointmentReminderLeadHours: z.coerce.number().int().min(1).max(336),
});

export async function saveEscalationPolicyAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const ctx = await requireAuth();
    const input = parseForm(policySchema, formData);
    assertOrganisationScope(ctx, input.organisationId);

    if (input.facilityId) {
      assertFacilityAccess(ctx, input.facilityId);
      assertCan(ctx, "settings:manage", { facilityId: input.facilityId });
    } else {
      assertCan(ctx, "settings:manage", { organisationId: input.organisationId });
    }

    if (input.urgentAcknowledgementDueHours > input.acknowledgementDueHours) {
      throw new ValidationError("Urgent referrals cannot have a longer deadline than routine.", {
        urgentAcknowledgementDueHours: ["Use a value at or below the routine deadline."],
      });
    }

    const values = {
      organisationId: input.organisationId,
      facilityId: input.facilityId || null,
      acknowledgementDueHours: input.acknowledgementDueHours,
      urgentAcknowledgementDueHours: input.urgentAcknowledgementDueHours,
      missedAppointmentGraceHours: input.missedAppointmentGraceHours,
      followUpDueDays: input.followUpDueDays,
      contactAttemptsBeforeEscalation: input.contactAttemptsBeforeEscalation,
      appointmentReminderLeadHours: input.appointmentReminderLeadHours,
      updatedByUserId: ctx.userId,
      updatedAt: new Date(),
    };

    // The organisation default is kept unique by a partial index, because a
    // NULL facility does not conflict under a plain composite unique index.
    if (input.facilityId) {
      await db
        .insert(escalationPolicies)
        .values(values)
        .onConflictDoUpdate({
          target: [escalationPolicies.organisationId, escalationPolicies.facilityId],
          set: values,
        });
    } else {
      await db
        .insert(escalationPolicies)
        .values(values)
        .onConflictDoUpdate({
          target: escalationPolicies.organisationId,
          targetWhere: sql`facility_id is null`,
          set: values,
        });
    }

    await recordAudit({
      organisationId: input.organisationId,
      actorUserId: ctx.userId,
      action: "policy.update",
      resourceType: "escalation_policy",
      metadata: { facilityId: input.facilityId || undefined, scope: input.facilityId ? "facility" : "organisation" },
    });

    revalidatePath("/app/admin/policies");
    return successState("Escalation policy saved.");
  } catch (error) {
    return toActionError(error);
  }
}
