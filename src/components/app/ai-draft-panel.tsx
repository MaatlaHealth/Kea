"use client";

import * as React from "react";
import { useActionState } from "react";
import { Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ReferralDraft } from "@/lib/ai/gemini";
import { draftFromNotesAction } from "@/server/actions/ai";
import { idleState, type ActionState } from "@/server/action-result";

/**
 * Assisted drafting.
 *
 * The draft is never saved by this component. A clinician reads it, decides
 * whether it is accurate, and chooses to place it in the editable field.
 */
export function AiDraftPanel({ onAccept }: { onAccept: (text: string) => void }) {
  const [open, setOpen] = React.useState(false);
  const [state, formAction, pending] = useActionState<ActionState<ReferralDraft>, FormData>(
    draftFromNotesAction,
    idleState as ActionState<ReferralDraft>,
  );

  const draft = state.status === "success" ? state.data : undefined;

  const asText = React.useMemo(() => {
    if (!draft) return "";
    const parts: string[] = [];
    if (draft.summary) parts.push(draft.summary);
    if (draft.clinicalObservations.length > 0) {
      parts.push(
        ["Observations:", ...draft.clinicalObservations.map((item) => `- ${item}`)].join("\n"),
      );
    }
    if (draft.requestedActions.length > 0) {
      parts.push(["Requested:", ...draft.requestedActions.map((item) => `- ${item}`)].join("\n"));
    }
    return parts.join("\n\n");
  }, [draft]);

  if (!open) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Sparkles />
        Draft with assistance
      </Button>
    );
  }

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold text-amber-900">
            <Sparkles className="size-4" />
            Assisted drafting
          </p>
          <p className="mt-1 text-xs leading-relaxed text-amber-900/90">
            This restructures text you have already written. It does not diagnose, does not suggest
            urgency and never saves anything. You review and approve every word.
          </p>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Close
        </Button>
      </div>

      <form action={formAction} className="space-y-3">
        <div>
          <Label htmlFor="aiText" className="text-xs">
            Your rough notes
          </Label>
          <Textarea
            id="aiText"
            name="text"
            rows={4}
            required
            minLength={20}
            placeholder="Type what you would otherwise write by hand."
            className="mt-1.5 bg-card"
          />
        </div>
        <Button type="submit" size="sm" loading={pending}>
          Produce a draft
        </Button>
      </form>

      {state.status === "error" ? (
        <Alert variant="warning" className="mt-3" title="Assistance unavailable">
          <p>{state.message}</p>
        </Alert>
      ) : null}

      {draft ? (
        <div className="mt-4 space-y-3 rounded-lg border border-border bg-card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Proposed draft, not yet saved
          </p>
          <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground">
            {asText || "The assistant produced no usable text."}
          </pre>

          {draft.reasonCategorySuggestion ? (
            <p className="text-xs text-muted-foreground">
              Suggested reason category:{" "}
              <span className="font-medium text-foreground">{draft.reasonCategorySuggestion}</span>
            </p>
          ) : null}

          {draft.missingInformation.length > 0 ? (
            <div className="text-xs text-amber-900">
              <p className="font-medium">The assistant could not find:</p>
              <ul className="mt-1 list-disc pl-4">
                {draft.missingInformation.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="flex gap-2 pt-1">
            <Button
              type="button"
              size="sm"
              disabled={!asText}
              onClick={() => {
                onAccept(asText);
                setOpen(false);
              }}
            >
              Use this draft
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
              Discard
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
