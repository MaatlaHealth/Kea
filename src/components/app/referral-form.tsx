"use client";

import * as React from "react";
import { useActionState } from "react";

import { AiDraftPanel } from "@/components/app/ai-draft-panel";
import { Button } from "@/components/ui/button";
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
import { REFERRAL_REASON_CATEGORIES } from "@/lib/site";
import { createReferralAction } from "@/server/actions/referrals";
import { idleState, type ActionState } from "@/server/action-result";
import { toISODate } from "@/lib/utils";

export type FacilityOption = {
  id: string;
  name: string;
  type: string;
  district: string | null;
};

export type DepartmentOption = {
  id: string;
  facilityId: string;
  name: string;
};

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.length) return null;
  return (
    <p className="mt-1.5 text-xs text-destructive" role="alert">
      {errors[0]}
    </p>
  );
}

export function ReferralForm({
  patientId,
  pregnancyEpisodeId,
  facilities,
  departments,
  aiEnabled,
}: {
  patientId: string;
  pregnancyEpisodeId: string | null;
  facilities: FacilityOption[];
  departments: DepartmentOption[];
  aiEnabled: boolean;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    createReferralAction,
    idleState,
  );
  const [facilityId, setFacilityId] = React.useState<string>("");
  const [reason, setReason] = React.useState<string>("");
  const [observations, setObservations] = React.useState("");
  const [actions, setActions] = React.useState("");

  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;
  const facilityDepartments = departments.filter(
    (department) => department.facilityId === facilityId,
  );

  const minDate = toISODate(new Date());

  return (
    <form action={formAction} className="space-y-8">
      <input type="hidden" name="patientId" value={patientId} />
      {pregnancyEpisodeId ? (
        <input type="hidden" name="pregnancyEpisodeId" value={pregnancyEpisodeId} />
      ) : null}

      {state.status === "error" && !fieldErrors ? (
        <Alert variant="destructive" title="The referral was not created">
          <p>{state.message}</p>
        </Alert>
      ) : null}

      <section className="space-y-5">
        <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-foreground">
          Where the patient is going
        </h2>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <Label htmlFor="receivingFacilityId" required>
              Receiving facility
            </Label>
            <Select name="receivingFacilityId" value={facilityId} onValueChange={setFacilityId}>
              <SelectTrigger
                id="receivingFacilityId"
                className="mt-1.5"
                aria-invalid={Boolean(fieldErrors?.receivingFacilityId)}
              >
                <SelectValue placeholder="Choose a facility" />
              </SelectTrigger>
              <SelectContent>
                {facilities.map((facility) => (
                  <SelectItem key={facility.id} value={facility.id}>
                    {facility.name}
                    {facility.district ? ` (${facility.district})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldError errors={fieldErrors?.receivingFacilityId} />
            {facilities.length === 0 ? (
              <p className="mt-1.5 text-xs text-amber-700">
                No referral pathways are configured for your facility. Ask an administrator to add
                one.
              </p>
            ) : null}
          </div>

          <div>
            <Label htmlFor="receivingDepartmentId">Department or service</Label>
            <Select name="receivingDepartmentId" disabled={facilityDepartments.length === 0}>
              <SelectTrigger id="receivingDepartmentId" className="mt-1.5">
                <SelectValue
                  placeholder={
                    facilityDepartments.length === 0
                      ? "Choose a facility first"
                      : "Choose a department"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {facilityDepartments.map((department) => (
                  <SelectItem key={department.id} value={department.id}>
                    {department.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="priority" required>
              Priority
            </Label>
            <Select name="priority" defaultValue="routine">
              <SelectTrigger id="priority" className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="routine">Routine</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
                <SelectItem value="emergency">Emergency</SelectItem>
              </SelectContent>
            </Select>
            <p className="mt-1.5 text-xs text-muted-foreground">
              Priority is a clinical judgement. It is never set by the software.
            </p>
          </div>

          <div>
            <Label htmlFor="requestedDate">Requested appointment date</Label>
            <Input
              id="requestedDate"
              name="requestedDate"
              type="date"
              min={minDate}
              className="mt-1.5"
            />
            <p className="mt-1.5 text-xs text-muted-foreground">
              A preference. The receiving facility confirms the actual date.
            </p>
          </div>
        </div>
      </section>

      <section className="space-y-5 border-t border-border pt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-foreground">
            Clinical information
          </h2>
          {aiEnabled ? (
            <AiDraftPanel
              onAccept={(draft) => {
                setObservations((current) => (current ? `${current}\n\n${draft}` : draft));
              }}
            />
          ) : null}
        </div>

        <div>
          <Label htmlFor="reasonCategory" required>
            Reason for referral
          </Label>
          <Select name="reasonCategory" value={reason} onValueChange={setReason}>
            <SelectTrigger
              id="reasonCategory"
              className="mt-1.5"
              aria-invalid={Boolean(fieldErrors?.reasonCategory)}
            >
              <SelectValue placeholder="Choose the main reason" />
            </SelectTrigger>
            <SelectContent>
              {REFERRAL_REASON_CATEGORIES.map((category) => (
                <SelectItem key={category} value={category}>
                  {category}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldError errors={fieldErrors?.reasonCategory} />
        </div>

        <div>
          <Label htmlFor="reasonDetail">Further detail on the reason</Label>
          <Textarea id="reasonDetail" name="reasonDetail" rows={3} className="mt-1.5" />
        </div>

        <div>
          <Label htmlFor="clinicalObservations">Clinical observations</Label>
          <Textarea
            id="clinicalObservations"
            name="clinicalObservations"
            rows={5}
            value={observations}
            onChange={(event) => setObservations(event.target.value)}
            placeholder="Blood pressure, gestation, relevant findings and anything the receiving team needs to prepare."
            className="mt-1.5"
          />
        </div>

        <div>
          <Label htmlFor="requestedActions">What you are asking the receiving team to do</Label>
          <Textarea
            id="requestedActions"
            name="requestedActions"
            rows={3}
            value={actions}
            onChange={(event) => setActions(event.target.value)}
            className="mt-1.5"
          />
        </div>
      </section>

      <div className="flex flex-wrap gap-3 border-t border-border pt-6">
        <Button
          type="submit"
          name="intent"
          value="submit"
          size="lg"
          loading={pending}
          disabled={!facilityId || !reason}
        >
          Submit referral
        </Button>
        <Button
          type="submit"
          name="intent"
          value="draft"
          variant="outline"
          size="lg"
          disabled={pending || !facilityId || !reason}
        >
          Save as draft
        </Button>
      </div>

      <p className="text-xs leading-relaxed text-muted-foreground">
        Submitting places the referral in the receiving facility queue and starts the
        acknowledgement clock. Where the patient has consented and has a contact number, they
        receive a message naming the facility and their reference, with no clinical detail.
      </p>
    </form>
  );
}
