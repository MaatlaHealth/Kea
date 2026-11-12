"use client";

import * as React from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, HelpCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { respondToAppointmentAction } from "@/server/actions/portal";
import { idleState, type ActionState } from "@/server/action-result";

export function AppointmentResponse({
  appointmentId,
  confirmed,
  assistanceRequested,
}: {
  appointmentId: string;
  confirmed: boolean;
  assistanceRequested: boolean;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    respondToAppointmentAction,
    idleState,
  );

  React.useEffect(() => {
    if (state.status === "success") router.refresh();
  }, [state, router]);

  if (confirmed) {
    return (
      <Alert variant="success" icon={false} className="mt-3">
        <p className="flex items-center gap-2">
          <CheckCircle2 className="size-4 shrink-0" />
          You told us you plan to attend. Thank you.
        </p>
      </Alert>
    );
  }

  if (assistanceRequested) {
    return (
      <Alert variant="warning" icon={false} className="mt-3">
        <p className="flex items-center gap-2">
          <HelpCircle className="size-4 shrink-0" />
          You asked for help. Someone from your clinic will try to contact you.
        </p>
      </Alert>
    );
  }

  return (
    <div className="mt-3 space-y-2">
      {state.status === "error" ? (
        <Alert variant="destructive">
          <p>{state.message}</p>
        </Alert>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-2">
        <form action={formAction}>
          <input type="hidden" name="appointmentId" value={appointmentId} />
          <input type="hidden" name="response" value="confirm" />
          <Button type="submit" size="lg" className="h-12 w-full" loading={pending}>
            I will be there
          </Button>
        </form>
        <form action={formAction}>
          <input type="hidden" name="appointmentId" value={appointmentId} />
          <input type="hidden" name="response" value="need_help" />
          <Button
            type="submit"
            size="lg"
            variant="outline"
            className="h-12 w-full"
            disabled={pending}
          >
            I need help
          </Button>
        </form>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Telling us helps your clinic plan. If you cannot attend, choose &ldquo;I need help&rdquo;
        and someone will contact you about a new date.
      </p>
    </div>
  );
}
