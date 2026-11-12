"use client";

import * as React from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, ShieldOff } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  changePasswordAction,
  confirmMfaAction,
  disableMfaAction,
  revokeOtherSessionsAction,
  startMfaEnrolmentAction,
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

export function ChangePasswordForm() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    changePasswordAction,
    idleState,
  );
  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;

  React.useEffect(() => {
    if (state.status === "success") toast.success(state.message ?? "Password changed.");
  }, [state]);

  return (
    <form action={formAction} className="space-y-4">
      {state.status === "error" && !fieldErrors ? (
        <Alert variant="destructive" title="Password not changed">
          <p>{state.message}</p>
        </Alert>
      ) : null}
      {state.status === "success" ? (
        <Alert variant="success" title="Password changed">
          <p>{state.message}</p>
        </Alert>
      ) : null}

      <div>
        <Label htmlFor="currentPassword" required>
          Current password
        </Label>
        <Input
          id="currentPassword"
          name="currentPassword"
          type="password"
          required
          autoComplete="current-password"
          className="mt-1.5"
        />
        <FieldError errors={fieldErrors?.currentPassword} />
      </div>
      <div>
        <Label htmlFor="newPassword" required>
          New password
        </Label>
        <Input
          id="newPassword"
          name="password"
          type="password"
          required
          autoComplete="new-password"
          className="mt-1.5"
        />
        <p className="mt-1.5 text-xs text-muted-foreground">At least 12 characters.</p>
        <FieldError errors={fieldErrors?.password} />
      </div>
      <div>
        <Label htmlFor="confirmNewPassword" required>
          Confirm new password
        </Label>
        <Input
          id="confirmNewPassword"
          name="confirmPassword"
          type="password"
          required
          autoComplete="new-password"
          className="mt-1.5"
        />
        <FieldError errors={fieldErrors?.confirmPassword} />
      </div>

      <Button type="submit" loading={pending}>
        Change password
      </Button>
    </form>
  );
}

export function MfaPanel({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [enrolment, setEnrolment] = React.useState<{ secret: string; uri: string } | null>(null);
  const [starting, startTransition] = React.useTransition();

  const [confirmState, confirmAction, confirming] = useActionState<ActionState, FormData>(
    confirmMfaAction,
    idleState,
  );
  const [disableState, disableAction, disabling] = useActionState<ActionState, FormData>(
    disableMfaAction,
    idleState,
  );

  React.useEffect(() => {
    if (confirmState.status === "success") {
      toast.success(confirmState.message ?? "Multifactor authentication enabled.");
      setEnrolment(null);
      router.refresh();
    }
  }, [confirmState, router]);

  React.useEffect(() => {
    if (disableState.status === "success") {
      toast.success(disableState.message ?? "Multifactor authentication disabled.");
      router.refresh();
    }
  }, [disableState, router]);

  if (enabled) {
    return (
      <div className="space-y-4">
        <Alert variant="success" title="Multifactor authentication is on">
          <p>
            You are asked for a six digit code from your authenticator application each time you
            sign in.
          </p>
        </Alert>

        <form action={disableAction} className="space-y-3">
          {disableState.status === "error" ? (
            <Alert variant="destructive" title="Not changed">
              <p>{disableState.message}</p>
            </Alert>
          ) : null}
          <div>
            <Label htmlFor="disableMfaPassword" required>
              Confirm your password to turn it off
            </Label>
            <Input
              id="disableMfaPassword"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="mt-1.5 max-w-sm"
            />
          </div>
          <Button type="submit" variant="outline" loading={disabling}>
            <ShieldOff />
            Turn off multifactor authentication
          </Button>
        </form>
      </div>
    );
  }

  if (!enrolment) {
    return (
      <div className="space-y-4">
        <p className="text-sm leading-relaxed text-muted-foreground">
          Multifactor authentication adds a six digit code from an authenticator application to
          your sign in. It is strongly recommended for anyone who can read patient records.
        </p>
        <Button
          loading={starting}
          onClick={() =>
            startTransition(async () => {
              const result = await startMfaEnrolmentAction();
              if (result.status === "success" && result.data) {
                setEnrolment(result.data);
              } else if (result.status === "error") {
                toast.error(result.message);
              }
            })
          }
        >
          <ShieldCheck />
          Set up multifactor authentication
        </Button>
      </div>
    );
  }

  return (
    <form action={confirmAction} className="space-y-4">
      <input type="hidden" name="secret" value={enrolment.secret} />

      <ol className="space-y-3 text-sm text-muted-foreground">
        <li>
          <span className="font-medium text-foreground">1.</span> Open your authenticator
          application and add a new account.
        </li>
        <li>
          <span className="font-medium text-foreground">2.</span> Enter this setup key, or paste the
          full address below into the application.
        </li>
      </ol>

      <div className="space-y-2">
        <code className="block select-all break-all rounded-md border border-border bg-muted px-3 py-2 font-mono text-sm">
          {enrolment.secret}
        </code>
        <code className="block select-all break-all rounded-md border border-border bg-muted px-3 py-2 font-mono text-[11px] text-muted-foreground">
          {enrolment.uri}
        </code>
      </div>

      {confirmState.status === "error" ? (
        <Alert variant="destructive" title="Code not accepted">
          <p>{confirmState.message}</p>
        </Alert>
      ) : null}

      <div>
        <Label htmlFor="mfaCode" required>
          Enter the current six digit code
        </Label>
        <Input
          id="mfaCode"
          name="code"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={6}
          required
          autoComplete="one-time-code"
          className="mt-1.5 max-w-[10rem] font-mono tracking-[0.3em]"
        />
      </div>

      <div className="flex gap-2">
        <Button type="submit" loading={confirming}>
          Turn on multifactor authentication
        </Button>
        <Button type="button" variant="ghost" onClick={() => setEnrolment(null)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function RevokeSessionsButton() {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    revokeOtherSessionsAction,
    idleState,
  );

  React.useEffect(() => {
    if (state.status === "success") {
      toast.success(state.message ?? "Other sessions signed out.");
      router.refresh();
    }
  }, [state, router]);

  return (
    <form action={formAction}>
      <Button type="submit" variant="outline" loading={pending}>
        Sign out all other sessions
      </Button>
    </form>
  );
}
