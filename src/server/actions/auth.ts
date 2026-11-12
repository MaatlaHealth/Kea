"use server";

import { and, eq, gt, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";

import { db } from "@/db";
import { invitations, memberships, passwordResetTokens, sessions, users } from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import { checkPasswordPolicy, hashPassword, verifyPassword } from "@/lib/auth/password";
import {
  createSession,
  destroyCurrentSession,
  requestMeta,
  requireAuth,
  revokeAllSessionsForUser,
} from "@/lib/auth/session";
import { generateToken, hashToken } from "@/lib/auth/tokens";
import { generateTotpSecret, totpUri, verifyTotp } from "@/lib/auth/totp";
import { absoluteUrl, sendOperationalEmail } from "@/lib/email";
import { clearRateLimit, enforceRateLimit } from "@/lib/rate-limit";
import { errorState, parseForm, successState, toActionError, type ActionState } from "../action-result";

/**
 * Authentication actions.
 *
 * Sign in reports the same message whether the email is unknown, the password
 * is wrong or the account is suspended, so the form cannot be used to discover
 * which staff accounts exist.
 */

const GENERIC_SIGN_IN_ERROR = "Those sign in details were not recognised.";
const MAX_FAILED_ATTEMPTS = 8;
const LOCKOUT_MINUTES = 15;

const signInSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter your work email address."),
  password: z.string().min(1, "Enter your password."),
  totp: z.string().trim().optional().or(z.literal("")),
  redirectTo: z.string().optional(),
});

export async function signInAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  let destination: string | null = null;

  try {
    const input = parseForm(signInSchema, formData);
    const meta = await requestMeta();

    await enforceRateLimit("signIn", `${input.email}`);
    await enforceRateLimit("signIn", `ip:${meta.ipAddress ?? "unknown"}`);

    const [user] = await db.select().from(users).where(eq(users.email, input.email)).limit(1);

    if (!user) {
      // Spend comparable time so a missing account is not detectable by timing.
      await verifyPassword(input.password, null);
      return errorState(GENERIC_SIGN_IN_ERROR);
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      return errorState(
        "This account is temporarily locked after repeated failed attempts. Try again shortly.",
      );
    }

    const passwordOk = await verifyPassword(input.password, user.passwordHash);
    if (!passwordOk) {
      const failures = user.failedLoginCount + 1;
      await db
        .update(users)
        .set({
          failedLoginCount: failures,
          lockedUntil:
            failures >= MAX_FAILED_ATTEMPTS
              ? new Date(Date.now() + LOCKOUT_MINUTES * 60_000)
              : null,
        })
        .where(eq(users.id, user.id));
      await recordAudit({
        actorUserId: user.id,
        action: "auth.sign_in",
        resourceType: "user",
        resourceId: user.id,
        outcome: "failure",
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });
      return errorState(GENERIC_SIGN_IN_ERROR);
    }

    if (user.status !== "active") {
      await recordAudit({
        actorUserId: user.id,
        action: "auth.sign_in",
        resourceType: "user",
        resourceId: user.id,
        outcome: "denied",
        metadata: { result: user.status },
        ipAddress: meta.ipAddress,
      });
      return errorState(GENERIC_SIGN_IN_ERROR);
    }

    if (user.mfaEnabledAt && user.mfaSecret) {
      if (!input.totp) {
        return {
          status: "error",
          message: "Enter the six digit code from your authenticator application.",
          code: "mfa_required",
        };
      }
      if (!verifyTotp(user.mfaSecret, input.totp)) {
        await recordAudit({
          actorUserId: user.id,
          action: "auth.mfa_verify",
          resourceType: "user",
          resourceId: user.id,
          outcome: "failure",
          ipAddress: meta.ipAddress,
        });
        return errorState("That code was not accepted. Check your authenticator and try again.", {
          totp: ["Incorrect or expired code."],
        });
      }
    }

    await db
      .update(users)
      .set({ failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() })
      .where(eq(users.id, user.id));

    await createSession(user.id, meta, Boolean(user.mfaEnabledAt));
    await clearRateLimit("signIn", input.email);

    await recordAudit({
      actorUserId: user.id,
      action: "auth.sign_in",
      resourceType: "user",
      resourceId: user.id,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    const target = input.redirectTo;
    destination = target && target.startsWith("/") && !target.startsWith("//") ? target : "/app";
  } catch (error) {
    return toActionError(error);
  }

  redirect(destination);
}

export async function signOutAction() {
  const userId = await destroyCurrentSession();
  if (userId) {
    await recordAudit({
      actorUserId: userId,
      action: "auth.sign_out",
      resourceType: "user",
      resourceId: userId,
    });
  }
  redirect("/sign-in");
}

const requestResetSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter your work email address."),
});

/**
 * Always reports success so the form cannot confirm whether an account exists.
 */
export async function requestPasswordResetAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const input = parseForm(requestResetSchema, formData);
    const meta = await requestMeta();
    await enforceRateLimit("passwordReset", input.email);

    const [user] = await db.select().from(users).where(eq(users.email, input.email)).limit(1);

    if (user && user.status === "active") {
      const token = generateToken();
      await db.insert(passwordResetTokens).values({
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + 60 * 60_000),
      });
      await sendOperationalEmail({
        to: user.email,
        subject: "Reset your Kea password",
        body: [
          `Hello ${user.fullName},`,
          "",
          "A password reset was requested for your Kea account.",
          "Open the link below within one hour to set a new password:",
          "",
          absoluteUrl(`/reset-password?token=${token}`),
          "",
          "If you did not request this, you can ignore this message. Your password has not changed.",
        ].join("\n"),
      });
      await recordAudit({
        actorUserId: user.id,
        action: "auth.password_reset_request",
        resourceType: "user",
        resourceId: user.id,
        ipAddress: meta.ipAddress,
      });
    }

    return successState(
      "If that address belongs to an active account, a reset link is on its way. Check your inbox.",
    );
  } catch (error) {
    return toActionError(error);
  }
}

const resetSchema = z
  .object({
    token: z.string().min(10, "This reset link is not valid."),
    password: z.string().min(1, "Choose a password."),
    confirmPassword: z.string().min(1, "Confirm your password."),
  })
  .refine((value) => value.password === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "The two passwords do not match.",
  });

export async function resetPasswordAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const input = parseForm(resetSchema, formData);

    const [row] = await db
      .select({
        id: passwordResetTokens.id,
        userId: passwordResetTokens.userId,
        email: users.email,
      })
      .from(passwordResetTokens)
      .innerJoin(users, eq(users.id, passwordResetTokens.userId))
      .where(
        and(
          eq(passwordResetTokens.tokenHash, hashToken(input.token)),
          isNull(passwordResetTokens.usedAt),
          gt(passwordResetTokens.expiresAt, new Date()),
        ),
      )
      .limit(1);

    if (!row) {
      return errorState("This reset link has expired or has already been used. Request a new one.");
    }

    const policy = checkPasswordPolicy(input.password, row.email);
    if (!policy.ok) {
      return errorState("Choose a stronger password.", { password: [policy.reason] });
    }

    const passwordHash = await hashPassword(input.password);
    await db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({
          passwordHash,
          passwordChangedAt: new Date(),
          failedLoginCount: 0,
          lockedUntil: null,
        })
        .where(eq(users.id, row.userId));
      await tx
        .update(passwordResetTokens)
        .set({ usedAt: new Date() })
        .where(eq(passwordResetTokens.id, row.id));
      await tx
        .update(sessions)
        .set({ revokedAt: new Date() })
        .where(and(eq(sessions.userId, row.userId), isNull(sessions.revokedAt)));
    });

    await recordAudit({
      actorUserId: row.userId,
      action: "auth.password_reset",
      resourceType: "user",
      resourceId: row.userId,
    });

    return successState("Your password has been changed. You can now sign in.");
  } catch (error) {
    return toActionError(error);
  }
}

const acceptSchema = z
  .object({
    token: z.string().min(10, "This invitation link is not valid."),
    password: z.string().min(1, "Choose a password."),
    confirmPassword: z.string().min(1, "Confirm your password."),
  })
  .refine((value) => value.password === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "The two passwords do not match.",
  });

export async function acceptInvitationAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const input = parseForm(acceptSchema, formData);

    const [invitation] = await db
      .select()
      .from(invitations)
      .where(
        and(
          eq(invitations.tokenHash, hashToken(input.token)),
          isNull(invitations.acceptedAt),
          isNull(invitations.revokedAt),
          gt(invitations.expiresAt, new Date()),
        ),
      )
      .limit(1);

    if (!invitation) {
      return errorState(
        "This invitation has expired or has already been used. Ask your administrator to send a new one.",
      );
    }

    const policy = checkPasswordPolicy(input.password, invitation.email);
    if (!policy.ok) {
      return errorState("Choose a stronger password.", { password: [policy.reason] });
    }

    const passwordHash = await hashPassword(input.password);

    await db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, invitation.email))
        .limit(1);

      let userId: string;
      if (existing) {
        userId = existing.id;
        await tx
          .update(users)
          .set({
            passwordHash,
            status: "active",
            emailVerifiedAt: new Date(),
            passwordChangedAt: new Date(),
          })
          .where(eq(users.id, userId));
      } else {
        const [created] = await tx
          .insert(users)
          .values({
            email: invitation.email,
            fullName: invitation.fullName,
            passwordHash,
            status: "active",
            emailVerifiedAt: new Date(),
            passwordChangedAt: new Date(),
          })
          .returning({ id: users.id });
        userId = created.id;
      }

      await tx
        .insert(memberships)
        .values({
          userId,
          organisationId: invitation.organisationId,
          facilityId: invitation.facilityId,
          role: invitation.role,
        })
        .onConflictDoNothing();

      await tx
        .update(invitations)
        .set({ acceptedAt: new Date() })
        .where(eq(invitations.id, invitation.id));

      await recordAudit(
        {
          organisationId: invitation.organisationId,
          actorUserId: userId,
          action: "auth.invitation_accept",
          resourceType: "user",
          resourceId: userId,
          metadata: { role: invitation.role, invitationId: invitation.id },
        },
        tx,
      );
    });

    return successState("Your account is ready. You can now sign in.");
  } catch (error) {
    return toActionError(error);
  }
}

/* ------------------------------ Account self service ----------------------------- */

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password."),
    password: z.string().min(1, "Choose a new password."),
    confirmPassword: z.string().min(1, "Confirm your new password."),
  })
  .refine((value) => value.password === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "The two passwords do not match.",
  });

export async function changePasswordAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const ctx = await requireAuth();
    const input = parseForm(changePasswordSchema, formData);

    const [user] = await db.select().from(users).where(eq(users.id, ctx.userId)).limit(1);
    if (!user || !(await verifyPassword(input.currentPassword, user.passwordHash))) {
      return errorState("Your current password was not correct.", {
        currentPassword: ["Incorrect password."],
      });
    }

    const policy = checkPasswordPolicy(input.password, user.email);
    if (!policy.ok) {
      return errorState("Choose a stronger password.", { password: [policy.reason] });
    }

    await db
      .update(users)
      .set({ passwordHash: await hashPassword(input.password), passwordChangedAt: new Date() })
      .where(eq(users.id, ctx.userId));

    await revokeAllSessionsForUser(ctx.userId, ctx.sessionId);

    await recordAudit({
      actorUserId: ctx.userId,
      action: "auth.password_change",
      resourceType: "user",
      resourceId: ctx.userId,
    });

    return successState("Your password has been changed. Other sessions have been signed out.");
  } catch (error) {
    return toActionError(error);
  }
}

/** Issues a new secret for enrolment. The secret is stored only once confirmed. */
export async function startMfaEnrolmentAction(): Promise<
  ActionState<{ secret: string; uri: string }>
> {
  try {
    const ctx = await requireAuth();
    const secret = generateTotpSecret();
    return successState("Scan this in your authenticator application.", {
      secret,
      uri: totpUri(secret, ctx.email),
    });
  } catch (error) {
    return toActionError(error);
  }
}

const confirmMfaSchema = z.object({
  secret: z.string().min(16),
  code: z.string().trim().min(6).max(8),
});

export async function confirmMfaAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const ctx = await requireAuth();
    const input = parseForm(confirmMfaSchema, formData);

    if (!verifyTotp(input.secret, input.code)) {
      return errorState("That code was not accepted.", { code: ["Incorrect or expired code."] });
    }

    await db
      .update(users)
      .set({ mfaSecret: input.secret, mfaEnabledAt: new Date() })
      .where(eq(users.id, ctx.userId));

    await recordAudit({
      actorUserId: ctx.userId,
      action: "auth.mfa_enable",
      resourceType: "user",
      resourceId: ctx.userId,
    });

    return successState("Multifactor authentication is now required for your account.");
  } catch (error) {
    return toActionError(error);
  }
}

const disableMfaSchema = z.object({
  password: z.string().min(1, "Enter your password to confirm."),
});

export async function disableMfaAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const ctx = await requireAuth();
    const input = parseForm(disableMfaSchema, formData);
    const [user] = await db.select().from(users).where(eq(users.id, ctx.userId)).limit(1);

    if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
      return errorState("That password was not correct.", { password: ["Incorrect password."] });
    }

    await db
      .update(users)
      .set({ mfaSecret: null, mfaEnabledAt: null })
      .where(eq(users.id, ctx.userId));

    await recordAudit({
      actorUserId: ctx.userId,
      action: "auth.mfa_disable",
      resourceType: "user",
      resourceId: ctx.userId,
    });

    return successState("Multifactor authentication has been turned off for your account.");
  } catch (error) {
    return toActionError(error);
  }
}

/** Signs out every other session for the current user. */
export async function revokeOtherSessionsAction(): Promise<ActionState> {
  try {
    const ctx = await requireAuth();
    await revokeAllSessionsForUser(ctx.userId, ctx.sessionId);
    await recordAudit({
      actorUserId: ctx.userId,
      action: "auth.revoke_sessions",
      resourceType: "user",
      resourceId: ctx.userId,
    });
    return successState("All other sessions have been signed out.");
  } catch (error) {
    return toActionError(error);
  }
}
