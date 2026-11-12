"use client";

import { useActionState } from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  acceptInvitationAction,
  requestPasswordResetAction,
  resetPasswordAction,
} from "@/server/actions/auth";
import { idleState, type ActionState } from "@/server/action-result";

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.length) return null;
  return (
    <p className="mt-1.5 text-xs text-destructive" role="alert">
      {errors[0]}
    </p>
  );
}

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    requestPasswordResetAction,
    idleState,
  );

  if (state.status === "success") {
    return (
      <Alert variant="success" title="Check your inbox">
        <p>{state.message}</p>
        <p className="mt-3">
          <Link href="/sign-in" className="font-medium underline underline-offset-4">
            Back to sign in
          </Link>
        </p>
      </Alert>
    );
  }

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {state.status === "error" ? (
        <Alert variant="destructive" title="Unable to continue">
          <p>{state.message}</p>
        </Alert>
      ) : null}
      <div>
        <Label htmlFor="email" required>
          Work email address
        </Label>
        <Input id="email" name="email" type="email" required autoComplete="username" className="mt-1.5" />
      </div>
      <Button type="submit" className="w-full" loading={pending}>
        Send reset link
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        <Link href="/sign-in" className="font-medium text-plum-700 hover:text-plum-900">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}

function PasswordFields({ fieldErrors }: { fieldErrors?: Record<string, string[]> }) {
  return (
    <>
      <div>
        <Label htmlFor="password" required>
          New password
        </Label>
        <Input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="new-password"
          aria-invalid={Boolean(fieldErrors?.password)}
          className="mt-1.5"
        />
        <p className="mt-1.5 text-xs text-muted-foreground">
          At least 12 characters. A memorable phrase works well.
        </p>
        <FieldError errors={fieldErrors?.password} />
      </div>
      <div>
        <Label htmlFor="confirmPassword" required>
          Confirm new password
        </Label>
        <Input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          required
          autoComplete="new-password"
          aria-invalid={Boolean(fieldErrors?.confirmPassword)}
          className="mt-1.5"
        />
        <FieldError errors={fieldErrors?.confirmPassword} />
      </div>
    </>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    resetPasswordAction,
    idleState,
  );
  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;

  if (state.status === "success") {
    return (
      <Alert variant="success" title="Password changed">
        <p>{state.message}</p>
        <p className="mt-3">
          <Link href="/sign-in" className="font-medium underline underline-offset-4">
            Go to sign in
          </Link>
        </p>
      </Alert>
    );
  }

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <input type="hidden" name="token" value={token} />
      {state.status === "error" && !fieldErrors ? (
        <Alert variant="destructive" title="Unable to reset your password">
          <p>{state.message}</p>
        </Alert>
      ) : null}
      <PasswordFields fieldErrors={fieldErrors} />
      <Button type="submit" className="w-full" loading={pending}>
        Set new password
      </Button>
    </form>
  );
}

export function AcceptInvitationForm({
  token,
  email,
  fullName,
  organisationName,
  roleLabel,
  facilityName,
}: {
  token: string;
  email: string;
  fullName: string;
  organisationName: string;
  roleLabel: string;
  facilityName: string | null;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    acceptInvitationAction,
    idleState,
  );
  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;

  if (state.status === "success") {
    return (
      <Alert variant="success" title="Account ready">
        <div className="flex items-start gap-2">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
          <div>
            <p>{state.message}</p>
            <p className="mt-3">
              <Link href="/sign-in" className="font-medium underline underline-offset-4">
                Go to sign in
              </Link>
            </p>
          </div>
        </div>
      </Alert>
    );
  }

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <input type="hidden" name="token" value={token} />

      <dl className="grid gap-2 rounded-lg border border-border bg-muted/40 p-4 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Name</dt>
          <dd className="font-medium text-foreground">{fullName}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Email</dt>
          <dd className="font-medium text-foreground">{email}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Organisation</dt>
          <dd className="font-medium text-foreground">{organisationName}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Role</dt>
          <dd className="font-medium text-foreground">{roleLabel}</dd>
        </div>
        {facilityName ? (
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Facility</dt>
            <dd className="font-medium text-foreground">{facilityName}</dd>
          </div>
        ) : null}
      </dl>

      {state.status === "error" && !fieldErrors ? (
        <Alert variant="destructive" title="Unable to set up your account">
          <p>{state.message}</p>
        </Alert>
      ) : null}

      <PasswordFields fieldErrors={fieldErrors} />

      <Button type="submit" className="w-full" loading={pending}>
        Create my account
      </Button>
    </form>
  );
}
