"use client";

import * as React from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { PhoneCall, UserCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  assignTaskAction,
  recordContactAttemptAction,
  resolveTaskAction,
} from "@/server/actions/coordination";
import { idleState, type ActionState } from "@/server/action-result";

const CHANNELS = [
  { value: "phone_call", label: "Telephone call" },
  { value: "sms", label: "SMS" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "home_visit", label: "Home visit" },
  { value: "community_worker", label: "Community health worker" },
  { value: "other", label: "Other" },
];

const OUTCOMES = [
  { value: "reached", label: "Reached the patient" },
  { value: "no_answer", label: "No answer" },
  { value: "voicemail", label: "Left a voicemail" },
  { value: "message_sent", label: "Sent a message" },
  { value: "wrong_number", label: "Wrong number" },
  { value: "refused", label: "Patient declined" },
  { value: "other", label: "Other" },
];

const RESOLUTIONS = [
  { value: "contacted_and_rebooked", label: "Contacted and rebooked" },
  { value: "contacted_no_action_needed", label: "Contacted, no further action needed" },
  { value: "patient_declined", label: "Patient declined further care" },
  { value: "unable_to_contact", label: "Unable to contact after repeated attempts" },
  { value: "referred_elsewhere", label: "Care arranged elsewhere" },
  { value: "duplicate_task", label: "Duplicate task" },
  { value: "other", label: "Other" },
];

export function ContactAttemptForm({ taskId }: { taskId: string }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    recordContactAttemptAction,
    idleState,
  );
  const [key, setKey] = React.useState(0);

  React.useEffect(() => {
    if (state.status === "success") {
      toast.success(state.message ?? "Attempt recorded.");
      setKey((value) => value + 1);
      router.refresh();
    }
  }, [state, router]);

  return (
    <form key={key} action={formAction} className="space-y-4">
      <input type="hidden" name="taskId" value={taskId} />

      {state.status === "error" ? (
        <Alert variant="destructive" title="Attempt not recorded">
          <p>{state.message}</p>
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="channel" required>
            How you tried to reach them
          </Label>
          <Select name="channel" defaultValue="phone_call">
            <SelectTrigger id="channel" className="mt-1.5">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CHANNELS.map((channel) => (
                <SelectItem key={channel.value} value={channel.value}>
                  {channel.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="outcome" required>
            What happened
          </Label>
          <Select name="outcome" defaultValue="no_answer">
            <SelectTrigger id="outcome" className="mt-1.5">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {OUTCOMES.map((outcome) => (
                <SelectItem key={outcome.value} value={outcome.value}>
                  {outcome.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <Label htmlFor="attemptNote">Notes</Label>
        <Textarea
          id="attemptNote"
          name="note"
          rows={3}
          placeholder="What the patient said, what was agreed, or why contact failed."
          className="mt-1.5"
        />
      </div>

      <Button type="submit" size="sm" loading={pending}>
        <PhoneCall />
        Record attempt
      </Button>
    </form>
  );
}

export function ResolveTaskForm({ taskId }: { taskId: string }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    resolveTaskAction,
    idleState,
  );

  React.useEffect(() => {
    if (state.status === "success") {
      toast.success(state.message ?? "Task resolved.");
      router.refresh();
    }
  }, [state, router]);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="taskId" value={taskId} />

      {state.status === "error" ? (
        <Alert variant="destructive" title="Not resolved">
          <p>{state.message}</p>
        </Alert>
      ) : null}

      <div>
        <Label htmlFor="resolutionOutcome" required>
          Outcome
        </Label>
        <Select name="outcome" defaultValue="contacted_and_rebooked">
          <SelectTrigger id="resolutionOutcome" className="mt-1.5">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RESOLUTIONS.map((resolution) => (
              <SelectItem key={resolution.value} value={resolution.value}>
                {resolution.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label htmlFor="resolutionNote" required>
          What was done
        </Label>
        <Textarea
          id="resolutionNote"
          name="note"
          rows={3}
          required
          placeholder="A short record of how this was resolved, for whoever reads this later."
          className="mt-1.5"
        />
      </div>

      <Button type="submit" size="sm" loading={pending}>
        Resolve task
      </Button>
    </form>
  );
}

export function ClaimTaskButton({
  taskId,
  currentUserId,
  assignedToUserId,
}: {
  taskId: string;
  currentUserId: string;
  assignedToUserId: string | null;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    assignTaskAction,
    idleState,
  );

  React.useEffect(() => {
    if (state.status === "success") {
      toast.success(state.message ?? "Updated.");
      router.refresh();
    } else if (state.status === "error") {
      toast.error(state.message);
    }
  }, [state, router]);

  const mine = assignedToUserId === currentUserId;

  return (
    <form action={formAction}>
      <input type="hidden" name="taskId" value={taskId} />
      <input type="hidden" name="assigneeUserId" value={mine ? "" : currentUserId} />
      <Button type="submit" variant={mine ? "outline" : "default"} size="sm" loading={pending}>
        <UserCheck />
        {mine ? "Release task" : "Assign to me"}
      </Button>
    </form>
  );
}
