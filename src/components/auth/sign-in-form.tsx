"use client";

import * as React from "react";
import { useActionState } from "react";
import Link from "next/link";
import { KeyRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signInAction } from "@/server/actions/auth";
import { idleState, type ActionState } from "@/server/action-result";

export function SignInForm({ redirectTo }: { redirectTo?: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    signInAction,
    idleState,
  );

  const mfaRequired = state.status === "error" && state.code === "mfa_required";
  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;
  const showFormError = state.status === "error" && !mfaRequired && !fieldErrors;

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <input type="hidden" name="redirectTo" value={redirectTo ?? ""} />

      {showFormError ? (
        <Alert variant="destructive" title="Unable to sign in">
          <p>{state.message}</p>
        </Alert>
      ) : null}

      {mfaRequired ? (
        <Alert variant="info" title="One more step">
          <p>{state.message}</p>
        </Alert>
      ) : null}

      <div>
        <Label htmlFor="email" required>
          Work email address
        </Label>
        <Input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="username"
          autoFocus
          className="mt-1.5"
        />
      </div>

      <div>
        <div className="flex items-center justify-between">
          <Label htmlFor="password" required>
            Password
          </Label>
          <Link
            href="/forgot-password"
            className="text-xs font-medium text-plum-700 hover:text-plum-900"
          >
            Forgot password
          </Link>
        </div>
        <Input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="mt-1.5"
        />
      </div>

      {mfaRequired ? (
        <div>
          <Label htmlFor="totp" required>
            Authentication code
          </Label>
          <Input
            id="totp"
            name="totp"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            autoComplete="one-time-code"
            autoFocus
            placeholder="000000"
            aria-invalid={Boolean(fieldErrors?.totp)}
            className="mt-1.5 font-mono tracking-[0.3em]"
          />
          {fieldErrors?.totp ? (
            <p className="mt-1.5 text-xs text-destructive" role="alert">
              {fieldErrors.totp[0]}
            </p>
          ) : null}
        </div>
      ) : null}

      <Button type="submit" className="w-full" size="lg" loading={pending}>
        <KeyRound />
        Sign in
      </Button>
    </form>
  );
}
