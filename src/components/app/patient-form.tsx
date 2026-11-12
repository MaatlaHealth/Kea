"use client";

import * as React from "react";
import { useActionState } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/misc";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SUPPORTED_LANGUAGES } from "@/lib/site";
import { registerPatientAction, type RegisterPatientState } from "@/server/actions/patients";
import { idleState } from "@/server/action-result";

export type FacilityChoice = { id: string; name: string; district: string | null };

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.length) return null;
  return (
    <p className="mt-1.5 text-xs text-destructive" role="alert">
      {errors[0]}
    </p>
  );
}

export function PatientForm({ facilities }: { facilities: FacilityChoice[] }) {
  const [state, formAction, pending] = useActionState<RegisterPatientState, FormData>(
    registerPatientAction,
    idleState as RegisterPatientState,
  );
  const [pregnancy, setPregnancy] = React.useState(true);
  const [acknowledged, setAcknowledged] = React.useState(false);
  const [channel, setChannel] = React.useState("sms");

  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;
  const duplicates =
    state.status === "error" && state.code === "duplicates_found"
      ? (state.data?.duplicates ?? [])
      : [];

  React.useEffect(() => {
    if (duplicates.length > 0) setAcknowledged(false);
  }, [duplicates.length]);

  return (
    <form action={formAction} className="space-y-8">
      {acknowledged ? <input type="hidden" name="acknowledgedDuplicates" value="true" /> : null}

      {state.status === "error" && state.code !== "duplicates_found" && !fieldErrors ? (
        <Alert variant="destructive" title="The patient was not registered">
          <p>{state.message}</p>
        </Alert>
      ) : null}

      {duplicates.length > 0 ? (
        <Alert variant="warning" title="Possible existing records">
          <p>
            These records at your organisation may be the same person. Open one to check before
            creating a new record.
          </p>
          <ul className="mt-3 space-y-2">
            {duplicates.map((candidate) => (
              <li key={candidate.id} className="rounded border border-amber-200 bg-white p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link
                    href={`/app/patients/${candidate.id}`}
                    className="text-sm font-medium text-plum-700 hover:text-plum-900"
                    target="_blank"
                  >
                    {candidate.fullName}
                  </Link>
                  <span className="text-xs text-muted-foreground">{candidate.recordNumber}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {candidate.homeFacilityName}
                  {candidate.matchedOn.length > 0
                    ? ` · matches on ${candidate.matchedOn.join(", ")}`
                    : ""}
                </p>
              </li>
            ))}
          </ul>
          <label className="mt-3 flex items-start gap-2 text-sm">
            <Checkbox
              checked={acknowledged}
              onCheckedChange={(value) => setAcknowledged(value === true)}
              className="mt-0.5"
            />
            <span>
              I have checked these records and this is a different person. Create a new record.
            </span>
          </label>
        </Alert>
      ) : null}

      <section className="space-y-5">
        <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-foreground">
          Identity
        </h2>
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <Label htmlFor="firstName" required>
              First name
            </Label>
            <Input
              id="firstName"
              name="firstName"
              required
              autoComplete="off"
              aria-invalid={Boolean(fieldErrors?.firstName)}
              className="mt-1.5"
            />
            <FieldError errors={fieldErrors?.firstName} />
          </div>
          <div>
            <Label htmlFor="lastName" required>
              Surname
            </Label>
            <Input
              id="lastName"
              name="lastName"
              required
              autoComplete="off"
              aria-invalid={Boolean(fieldErrors?.lastName)}
              className="mt-1.5"
            />
            <FieldError errors={fieldErrors?.lastName} />
          </div>
          <div>
            <Label htmlFor="dateOfBirth">Date of birth</Label>
            <Input id="dateOfBirth" name="dateOfBirth" type="date" className="mt-1.5" />
          </div>
          <div>
            <Label htmlFor="recordNumber">Facility record number</Label>
            <Input
              id="recordNumber"
              name="recordNumber"
              placeholder="Leave blank to allocate one"
              className="mt-1.5"
            />
            <FieldError errors={fieldErrors?.recordNumber} />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="homeFacilityId" required>
              Registered at
            </Label>
            <Select name="homeFacilityId" defaultValue={facilities[0]?.id}>
              <SelectTrigger id="homeFacilityId" className="mt-1.5">
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
            <FieldError errors={fieldErrors?.homeFacilityId} />
          </div>
        </div>
      </section>

      <section className="space-y-5 border-t border-border pt-6">
        <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-foreground">
          Contact
        </h2>
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <Label htmlFor="phone" required={channel !== "none"}>
              Mobile number
            </Label>
            <Input
              id="phone"
              name="phone"
              type="tel"
              placeholder="072 123 4567"
              aria-invalid={Boolean(fieldErrors?.phone)}
              className="mt-1.5"
            />
            <FieldError errors={fieldErrors?.phone} />
          </div>
          <div>
            <Label htmlFor="alternatePhone">Alternative number</Label>
            <Input id="alternatePhone" name="alternatePhone" type="tel" className="mt-1.5" />
          </div>
          <div>
            <Label htmlFor="preferredLanguage" required>
              Preferred language
            </Label>
            <Select name="preferredLanguage" defaultValue="en">
              <SelectTrigger id="preferredLanguage" className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SUPPORTED_LANGUAGES.map((language) => (
                  <SelectItem key={language.code} value={language.code}>
                    {language.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1.5 text-xs text-muted-foreground">
              Messages are currently sent in English. Other languages are recorded for staff use
              and for future message translations.
            </p>
          </div>
          <div>
            <Label htmlFor="preferredChannel" required>
              How to contact the patient
            </Label>
            <Select name="preferredChannel" value={channel} onValueChange={setChannel}>
              <SelectTrigger id="preferredChannel" className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sms">SMS</SelectItem>
                <SelectItem value="whatsapp">WhatsApp</SelectItem>
                <SelectItem value="voice_callback">Telephone call by staff</SelectItem>
                <SelectItem value="none">Do not contact by message</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="residentialArea">Area where the patient lives</Label>
            <Input
              id="residentialArea"
              name="residentialArea"
              placeholder="Township, village or suburb"
              className="mt-1.5"
            />
            <p className="mt-1.5 text-xs text-muted-foreground">
              Used for travel context only. A precise home address is not collected.
            </p>
          </div>
          <div>
            <Label htmlFor="emergencyContactName">Emergency contact name</Label>
            <Input id="emergencyContactName" name="emergencyContactName" className="mt-1.5" />
          </div>
          <div>
            <Label htmlFor="emergencyContactPhone">Emergency contact number</Label>
            <Input
              id="emergencyContactPhone"
              name="emergencyContactPhone"
              type="tel"
              className="mt-1.5"
            />
          </div>
        </div>
      </section>

      <section className="space-y-5 border-t border-border pt-6">
        <div className="flex items-center gap-3">
          <Checkbox
            id="hasPregnancyEpisode"
            name="hasPregnancyEpisode"
            checked={pregnancy}
            onCheckedChange={(value) => setPregnancy(value === true)}
          />
          <Label htmlFor="hasPregnancyEpisode" className="font-display text-sm uppercase tracking-wide">
            Record a current pregnancy episode
          </Label>
        </div>

        {pregnancy ? (
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <Label htmlFor="estimatedDueDate">Estimated due date</Label>
              <Input id="estimatedDueDate" name="estimatedDueDate" type="date" className="mt-1.5" />
            </div>
            <div>
              <Label htmlFor="lastMenstrualPeriod">Last menstrual period</Label>
              <Input
                id="lastMenstrualPeriod"
                name="lastMenstrualPeriod"
                type="date"
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="bookingDate">Booking visit date</Label>
              <Input id="bookingDate" name="bookingDate" type="date" className="mt-1.5" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="gravidity">Gravidity</Label>
                <Input
                  id="gravidity"
                  name="gravidity"
                  type="number"
                  min={0}
                  max={30}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label htmlFor="parity">Parity</Label>
                <Input id="parity" name="parity" type="number" min={0} max={30} className="mt-1.5" />
              </div>
            </div>
          </div>
        ) : null}
      </section>

      <section className="space-y-4 border-t border-border pt-6">
        <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-foreground">
          Consent
        </h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Record what the patient agreed to. Messages are only sent where consent for that category
          is on record and has not been withdrawn.
        </p>

        <div className="space-y-3 rounded-lg border border-border bg-muted/40 p-4">
          <label className="flex items-start gap-3 text-sm">
            <Checkbox name="consentDataProcessing" defaultChecked className="mt-0.5" />
            <span>
              <span className="font-medium text-foreground">Record and share for care</span>
              <span className="block text-xs text-muted-foreground">
                The patient agrees that their details may be recorded and shared with the facility
                they are referred to, for their care.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-3 text-sm">
            <Checkbox name="consentAppointmentMessaging" defaultChecked className="mt-0.5" />
            <span>
              <span className="font-medium text-foreground">Appointment messages</span>
              <span className="block text-xs text-muted-foreground">
                Confirmations and reminders about appointments.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-3 text-sm">
            <Checkbox name="consentFollowUpMessaging" defaultChecked className="mt-0.5" />
            <span>
              <span className="font-medium text-foreground">Follow-up messages</span>
              <span className="block text-xs text-muted-foreground">
                Contact after a missed visit or when follow-up is due.
              </span>
            </span>
          </label>
          <div>
            <Label htmlFor="consentMethod">How consent was obtained</Label>
            <Input
              id="consentMethod"
              name="consentMethod"
              defaultValue="Verbal consent at registration"
              className="mt-1.5 bg-card"
            />
          </div>
        </div>
      </section>

      <section className="space-y-4 border-t border-border pt-6">
        <Label htmlFor="notes">Notes for staff</Label>
        <Textarea
          id="notes"
          name="notes"
          rows={3}
          placeholder="Anything coordinators should know when contacting this patient."
        />
      </section>

      <div className="flex items-center gap-3 border-t border-border pt-6">
        <Button
          type="submit"
          size="lg"
          loading={pending}
          disabled={duplicates.length > 0 && !acknowledged}
        >
          Register patient
        </Button>
        {duplicates.length > 0 && !acknowledged ? (
          <span className="flex items-center gap-1.5 text-xs text-amber-800">
            <AlertTriangle className="size-3.5" />
            Confirm this is a different person first
          </span>
        ) : null}
      </div>
    </form>
  );
}
