"use client";

import * as React from "react";
import { useActionState } from "react";
import { CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/misc";
import { submitPilotEnquiry } from "@/server/actions/pilot";
import { idleState, type ActionState } from "@/server/action-result";

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.length) return null;
  return (
    <p className="mt-1.5 text-xs text-destructive" role="alert">
      {errors[0]}
    </p>
  );
}

export function PilotForm() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    submitPilotEnquiry,
    idleState,
  );
  const [consent, setConsent] = React.useState(false);

  if (state.status === "success") {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-8 text-center">
        <CheckCircle2 className="mx-auto mb-3 size-8 text-emerald-700" />
        <h2 className="font-display text-lg font-semibold text-emerald-900">Enquiry received</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-emerald-900/90">
          {state.message}
        </p>
      </div>
    );
  }

  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;

  return (
    <form action={formAction} className="space-y-6" noValidate>
      {state.status === "error" && !fieldErrors ? (
        <Alert variant="destructive" title="Your enquiry was not sent">
          <p>{state.message}</p>
        </Alert>
      ) : null}

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label htmlFor="organisationName" required>
            Organisation or health service
          </Label>
          <Input
            id="organisationName"
            name="organisationName"
            required
            autoComplete="organization"
            aria-invalid={Boolean(fieldErrors?.organisationName)}
            className="mt-1.5"
          />
          <FieldError errors={fieldErrors?.organisationName} />
        </div>

        <div>
          <Label htmlFor="contactName" required>
            Your name
          </Label>
          <Input
            id="contactName"
            name="contactName"
            required
            autoComplete="name"
            aria-invalid={Boolean(fieldErrors?.contactName)}
            className="mt-1.5"
          />
          <FieldError errors={fieldErrors?.contactName} />
        </div>

        <div>
          <Label htmlFor="role">Your role</Label>
          <Input
            id="role"
            name="role"
            autoComplete="organization-title"
            placeholder="For example, maternal health programme manager"
            className="mt-1.5"
          />
          <FieldError errors={fieldErrors?.role} />
        </div>

        <div>
          <Label htmlFor="contactEmail" required>
            Work email address
          </Label>
          <Input
            id="contactEmail"
            name="contactEmail"
            type="email"
            required
            autoComplete="email"
            aria-invalid={Boolean(fieldErrors?.contactEmail)}
            className="mt-1.5"
          />
          <FieldError errors={fieldErrors?.contactEmail} />
        </div>

        <div>
          <Label htmlFor="contactPhone">Phone number</Label>
          <Input
            id="contactPhone"
            name="contactPhone"
            type="tel"
            autoComplete="tel"
            className="mt-1.5"
          />
          <FieldError errors={fieldErrors?.contactPhone} />
        </div>

        <div>
          <Label htmlFor="country" required>
            Country
          </Label>
          <Input
            id="country"
            name="country"
            required
            defaultValue="South Africa"
            autoComplete="country-name"
            aria-invalid={Boolean(fieldErrors?.country)}
            className="mt-1.5"
          />
          <FieldError errors={fieldErrors?.country} />
        </div>

        <div>
          <Label htmlFor="facilityCount">Number of facilities</Label>
          <Input
            id="facilityCount"
            name="facilityCount"
            placeholder="For example, 6 clinics and 1 district hospital"
            className="mt-1.5"
          />
        </div>

        <div className="sm:col-span-2">
          <Label htmlFor="monthlyReferralVolume">Approximate maternal referrals per month</Label>
          <Input
            id="monthlyReferralVolume"
            name="monthlyReferralVolume"
            placeholder="An estimate is fine"
            className="mt-1.5"
          />
        </div>

        <div className="sm:col-span-2">
          <Label htmlFor="message" required>
            Tell us about your referral pathways
          </Label>
          <Textarea
            id="message"
            name="message"
            required
            rows={6}
            placeholder="Which facilities refer to which, how referrals are tracked today, and what you would want a pilot to answer."
            aria-invalid={Boolean(fieldErrors?.message)}
            className="mt-1.5"
          />
          <FieldError errors={fieldErrors?.message} />
        </div>
      </div>

      {/* Honeypot. Hidden from people, left empty by real submissions. */}
      <div aria-hidden className="hidden">
        <label htmlFor="website">Website</label>
        <input id="website" name="website" tabIndex={-1} autoComplete="off" />
      </div>

      <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/40 p-4">
        <Checkbox
          id="consent"
          name="consent"
          checked={consent}
          onCheckedChange={(value) => setConsent(value === true)}
          className="mt-0.5"
          aria-invalid={Boolean(fieldErrors?.consent)}
        />
        <div>
          <Label htmlFor="consent" className="font-normal leading-relaxed">
            I agree that the Kea team may contact me about a pilot using the details above. These
            details are stored for that purpose only and are not shared with third parties.
          </Label>
          <FieldError errors={fieldErrors?.consent} />
        </div>
      </div>

      <Button type="submit" size="lg" loading={pending} disabled={!consent}>
        Send enquiry
      </Button>
    </form>
  );
}
