"use client";

import * as React from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert } from "@/components/ui/feedback";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ReferralStatus } from "@/db/schema";
import { transitionReferralAction } from "@/server/actions/referrals";
import { idleState, type ActionState } from "@/server/action-result";

export type TransitionOption = {
  to: ReferralStatus;
  label: string;
  description: string;
  requiresNote: boolean;
};

export type DepartmentOption = { id: string; name: string };

/**
 * Renders the transitions the current user may perform.
 *
 * The list is computed on the server from the state machine, so this component
 * never decides what is allowed; it only collects the extra input a transition
 * needs before posting it back.
 */
export function ReferralActions({
  referralId,
  transitions,
  departments,
  defaultDepartmentId,
}: {
  referralId: string;
  transitions: TransitionOption[];
  departments: DepartmentOption[];
  defaultDepartmentId: string | null;
}) {
  const router = useRouter();
  const [active, setActive] = React.useState<TransitionOption | null>(null);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    transitionReferralAction,
    idleState,
  );

  React.useEffect(() => {
    if (state.status === "success") {
      toast.success(state.message ?? "Referral updated.");
      setActive(null);
      router.refresh();
    }
  }, [state, router]);

  if (transitions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        There are no actions available to you on this referral in its current state.
      </p>
    );
  }

  const needsAppointment = active?.to === "appointment_scheduled";
  const needsOutcome = active?.to === "care_completed";
  const isReject = active?.to === "rejected";
  const isCancel = active?.to === "cancelled";
  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {transitions.map((transition, index) => (
          <Button
            key={transition.to + index}
            variant={index === 0 ? "default" : "outline"}
            size="sm"
            onClick={() => setActive(transition)}
          >
            {transition.label}
          </Button>
        ))}
      </div>

      <Dialog open={active !== null} onOpenChange={(open) => (open ? null : setActive(null))}>
        <DialogContent size="md">
          {active ? (
            <form action={formAction} className="space-y-5">
              <input type="hidden" name="referralId" value={referralId} />
              <input type="hidden" name="to" value={active.to} />

              <DialogHeader>
                <DialogTitle>{active.label}</DialogTitle>
                <DialogDescription>{active.description}</DialogDescription>
              </DialogHeader>

              {state.status === "error" && !fieldErrors ? (
                <Alert variant="destructive" title="Unable to apply this change">
                  <p>{state.message}</p>
                </Alert>
              ) : null}

              {needsAppointment ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <Label htmlFor="scheduledFor" required>
                      Date and time
                    </Label>
                    <Input
                      id="scheduledFor"
                      name="scheduledFor"
                      type="datetime-local"
                      required
                      aria-invalid={Boolean(fieldErrors?.scheduledFor)}
                      className="mt-1.5"
                    />
                    {fieldErrors?.scheduledFor ? (
                      <p className="mt-1.5 text-xs text-destructive">
                        {fieldErrors.scheduledFor[0]}
                      </p>
                    ) : null}
                  </div>
                  <div>
                    <Label htmlFor="durationMinutes">Duration in minutes</Label>
                    <Input
                      id="durationMinutes"
                      name="durationMinutes"
                      type="number"
                      min={5}
                      max={480}
                      step={5}
                      defaultValue={30}
                      className="mt-1.5"
                    />
                  </div>
                  {departments.length > 0 ? (
                    <div>
                      <Label htmlFor="departmentId">Department</Label>
                      <Select name="departmentId" defaultValue={defaultDepartmentId ?? undefined}>
                        <SelectTrigger id="departmentId" className="mt-1.5">
                          <SelectValue placeholder="Choose a department" />
                        </SelectTrigger>
                        <SelectContent>
                          {departments.map((department) => (
                            <SelectItem key={department.id} value={department.id}>
                              {department.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : null}
                  <div className="sm:col-span-2">
                    <Label htmlFor="locationNote">Where to report</Label>
                    <Input
                      id="locationNote"
                      name="locationNote"
                      placeholder="For example, antenatal clinic reception, block B"
                      maxLength={200}
                      className="mt-1.5"
                    />
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      This is for staff. The patient message carries only the facility, date and
                      time.
                    </p>
                  </div>
                </div>
              ) : null}

              {needsOutcome ? (
                <div>
                  <Label htmlFor="outcomeSummary" required>
                    What care was provided
                  </Label>
                  <Textarea
                    id="outcomeSummary"
                    name="outcomeSummary"
                    required
                    rows={4}
                    placeholder="A short summary that the referring facility needs in order to continue care."
                    aria-invalid={Boolean(fieldErrors?.outcomeSummary)}
                    className="mt-1.5"
                  />
                  {fieldErrors?.outcomeSummary ? (
                    <p className="mt-1.5 text-xs text-destructive">
                      {fieldErrors.outcomeSummary[0]}
                    </p>
                  ) : null}
                </div>
              ) : null}

              {isReject || isCancel ? (
                <div>
                  <Label htmlFor="reason" required>
                    Reason
                  </Label>
                  <Textarea
                    id="reason"
                    name="reason"
                    required
                    rows={3}
                    maxLength={300}
                    placeholder={
                      isReject
                        ? "Explain why the referral cannot be accepted so the clinic can act on it."
                        : "Explain why the referral is being withdrawn."
                    }
                    className="mt-1.5"
                  />
                </div>
              ) : (
                <div>
                  <Label htmlFor="note" required={active.requiresNote}>
                    Note
                  </Label>
                  <Textarea
                    id="note"
                    name="note"
                    required={active.requiresNote}
                    rows={3}
                    placeholder={
                      active.requiresNote
                        ? "A reason is required for this action."
                        : "Optional. Added to the referral history."
                    }
                    className="mt-1.5"
                  />
                </div>
              )}

              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setActive(null)}>
                  Cancel
                </Button>
                <Button type="submit" loading={pending}>
                  {active.label}
                </Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
