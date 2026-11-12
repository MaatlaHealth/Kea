"use client";

import * as React from "react";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  requestPortalCodeAction,
  verifyPortalCodeAction,
} from "@/server/actions/portal";
import { idleState, type ActionState } from "@/server/action-result";

/**
 * Patient sign in.
 *
 * Two short steps, large targets and no password. The wording never confirms
 * whether a number is registered.
 */
export function PortalSignIn() {
  const [phone, setPhone] = React.useState("");
  const [sent, setSent] = React.useState(false);

  const [requestState, requestAction, requesting] = useActionState<ActionState, FormData>(
    requestPortalCodeAction,
    idleState,
  );
  const [verifyState, verifyAction, verifying] = useActionState<ActionState, FormData>(
    verifyPortalCodeAction,
    idleState,
  );

  React.useEffect(() => {
    if (requestState.status === "success") setSent(true);
  }, [requestState]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-xl font-semibold text-foreground">
          See your appointments
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Enter the mobile number your clinic has for you. We will send a six digit code by SMS.
        </p>
      </div>

      <form action={requestAction} className="space-y-4">
        <div>
          <Label htmlFor="phone" required>
            Mobile number
          </Label>
          <Input
            id="phone"
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            required
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="072 123 4567"
            className="mt-1.5 h-12 text-base"
          />
          {requestState.status === "error" && requestState.fieldErrors?.phone ? (
            <p className="mt-1.5 text-xs text-destructive">{requestState.fieldErrors.phone[0]}</p>
          ) : null}
        </div>

        {requestState.status === "error" && !requestState.fieldErrors ? (
          <Alert variant="destructive">
            <p>{requestState.message}</p>
          </Alert>
        ) : null}

        <Button type="submit" size="lg" className="h-12 w-full" loading={requesting}>
          {sent ? "Send a new code" : "Send me a code"}
        </Button>
      </form>

      {sent ? (
        <>
          <Alert variant="info">
            <p>{requestState.status === "success" ? requestState.message : null}</p>
          </Alert>

          <form action={verifyAction} className="space-y-4">
            <input type="hidden" name="phone" value={phone} />
            <div>
              <Label htmlFor="code" required>
                Six digit code
              </Label>
              <Input
                id="code"
                name="code"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                autoComplete="one-time-code"
                required
                placeholder="000000"
                className="mt-1.5 h-12 text-center font-mono text-lg tracking-[0.4em]"
              />
              {verifyState.status === "error" ? (
                <p className="mt-1.5 text-xs text-destructive">{verifyState.message}</p>
              ) : null}
            </div>
            <Button type="submit" size="lg" className="h-12 w-full" loading={verifying}>
              Sign in
            </Button>
          </form>
        </>
      ) : null}

      <p className="text-xs leading-relaxed text-muted-foreground">
        If you do not receive a code, your clinic may have a different number on your record. Call
        your clinic and ask them to check it.
      </p>
    </div>
  );
}
