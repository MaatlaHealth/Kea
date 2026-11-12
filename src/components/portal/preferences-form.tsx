"use client";

import * as React from "react";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem, Switch } from "@/components/ui/misc";
import { updatePortalPreferencesAction } from "@/server/actions/portal";
import { idleState, type ActionState } from "@/server/action-result";

const CHANNELS = [
  { value: "sms", label: "SMS", detail: "Text messages to your mobile number." },
  { value: "whatsapp", label: "WhatsApp", detail: "Messages through WhatsApp." },
  {
    value: "voice_callback",
    label: "A phone call from staff",
    detail: "No automatic messages. Someone will call you.",
  },
  { value: "none", label: "No messages", detail: "Your clinic will contact you another way." },
];

export function PreferencesForm({
  preferredChannel,
  appointmentMessaging,
  followUpMessaging,
}: {
  preferredChannel: string;
  appointmentMessaging: boolean;
  followUpMessaging: boolean;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    updatePortalPreferencesAction,
    idleState,
  );
  const [channel, setChannel] = React.useState(preferredChannel);
  const [appointments, setAppointments] = React.useState(appointmentMessaging);
  const [followUp, setFollowUp] = React.useState(followUpMessaging);

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="preferredChannel" value={channel} />
      <input type="hidden" name="appointmentMessaging" value={appointments ? "true" : "false"} />
      <input type="hidden" name="followUpMessaging" value={followUp ? "true" : "false"} />

      {state.status === "success" ? (
        <Alert variant="success">
          <p>{state.message}</p>
        </Alert>
      ) : null}
      {state.status === "error" ? (
        <Alert variant="destructive">
          <p>{state.message}</p>
        </Alert>
      ) : null}

      <fieldset>
        <legend className="mb-3 text-sm font-semibold text-foreground">
          How would you like to be contacted?
        </legend>
        <RadioGroup value={channel} onValueChange={setChannel} className="gap-3">
          {CHANNELS.map((option) => (
            <label
              key={option.value}
              className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-4 has-[:checked]:border-plum-300 has-[:checked]:bg-plum-50"
            >
              <RadioGroupItem value={option.value} className="mt-0.5" />
              <span>
                <span className="block text-sm font-medium text-foreground">{option.label}</span>
                <span className="block text-xs text-muted-foreground">{option.detail}</span>
              </span>
            </label>
          ))}
        </RadioGroup>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="mb-1 text-sm font-semibold text-foreground">
          Which messages may we send?
        </legend>

        <div className="flex items-start justify-between gap-4 rounded-lg border border-border p-4">
          <div>
            <Label className="text-sm">Appointment messages</Label>
            <p className="mt-0.5 text-xs text-muted-foreground">
              When your visit is booked, and a reminder before the date.
            </p>
          </div>
          <Switch
            checked={appointments}
            onCheckedChange={(value) => setAppointments(value === true)}
            aria-label="Appointment messages"
          />
        </div>

        <div className="flex items-start justify-between gap-4 rounded-lg border border-border p-4">
          <div>
            <Label className="text-sm">Follow-up messages</Label>
            <p className="mt-0.5 text-xs text-muted-foreground">
              If you miss a visit, or when a follow-up is due.
            </p>
          </div>
          <Switch
            checked={followUp}
            onCheckedChange={(value) => setFollowUp(value === true)}
            aria-label="Follow-up messages"
          />
        </div>
      </fieldset>

      <Button type="submit" size="lg" className="h-12 w-full" loading={pending}>
        Save my preferences
      </Button>

      <p className="text-xs leading-relaxed text-muted-foreground">
        Messages from Kea never contain your diagnosis or any medical detail. You can also stop
        messages at any time by replying STOP to an SMS.
      </p>
    </form>
  );
}
