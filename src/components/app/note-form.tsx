"use client";

import * as React from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { AiDraftPanel } from "@/components/app/ai-draft-panel";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/misc";
import { addNoteAction } from "@/server/actions/referrals";
import { idleState, type ActionState } from "@/server/action-result";

export function NoteForm({
  patientId,
  referralId,
  aiEnabled,
}: {
  patientId: string;
  referralId?: string;
  aiEnabled: boolean;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    addNoteAction,
    idleState,
  );
  const [body, setBody] = React.useState("");
  const [visible, setVisible] = React.useState(false);
  const [aiAssisted, setAiAssisted] = React.useState(false);

  React.useEffect(() => {
    if (state.status === "success") {
      toast.success(state.message ?? "Note saved.");
      // A server action result arrives with no callback, so the local reset
      // happens here. It runs once per submission, after a network round
      // trip, not in a render loop.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setBody("");
      setAiAssisted(false);
      router.refresh();
    }
  }, [state, router]);

  return (
    <div className="space-y-4">
      {aiEnabled ? (
        <AiDraftPanel
          onAccept={(draft) => {
            setBody(draft);
            setAiAssisted(true);
          }}
        />
      ) : null}

      <form action={formAction} className="space-y-3">
        <input type="hidden" name="patientId" value={patientId} />
        {referralId ? <input type="hidden" name="referralId" value={referralId} /> : null}
        {aiAssisted ? <input type="hidden" name="aiAssisted" value="true" /> : null}

        {state.status === "error" ? (
          <Alert variant="destructive" title="Note not saved">
            <p>{state.message}</p>
          </Alert>
        ) : null}

        <div>
          <Label htmlFor="noteBody" className="sr-only">
            Clinical note
          </Label>
          <Textarea
            id="noteBody"
            name="body"
            required
            rows={4}
            value={body}
            onChange={(event) => {
              setBody(event.target.value);
              if (aiAssisted) setAiAssisted(false);
            }}
            placeholder="Add a note to this referral. Notes are attributed to you and cannot be edited afterwards."
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <Checkbox
              name="visibleToPatient"
              checked={visible}
              onCheckedChange={(value) => setVisible(value === true)}
            />
            Share this note with the patient in their portal
          </label>
          <Button type="submit" size="sm" loading={pending} disabled={body.trim().length < 3}>
            Save note
          </Button>
        </div>

        {aiAssisted ? (
          <p className="text-xs text-amber-800">
            This text started as an AI draft. It is recorded as AI assisted once saved. You are
            responsible for its accuracy.
          </p>
        ) : null}
      </form>
    </div>
  );
}
