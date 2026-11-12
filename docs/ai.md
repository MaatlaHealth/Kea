# AI assistance

Kea has one optional AI feature. It is off by default and the product is
complete without it.

## What it does

A clinician types rough notes. The feature returns a proposed structured
draft: a summary, a list of observations, a list of requested actions, a
suggested reason category chosen from Kea's own fixed list, and a list of
referral fields the notes did not cover.

The clinician reads the draft, decides whether it is accurate, and either
places it into the editable field or discards it. Nothing is written to a
record by the feature itself.

## What it does not do

- It does not diagnose, suggest a diagnosis, or name a condition the clinician
  did not write.
- It does not recommend treatment or medication.
- It does not assign or suggest clinical urgency.
- It does not triage.
- It does not save anything.
- It does not read the patient record. It sees only the text the clinician
  typed into the assistance box in that moment.

A note that began as an AI draft is flagged `ai_assisted` when it is saved,
and the interface shows that flag beside the note for anyone who reads it
later.

## Default state

`AI_ASSIST_ENABLED` defaults to `false`. With it off, the control does not
appear and the manual workflow is complete on its own.

Do not enable it against real patient data until your organisation has:

1. a lawful basis for sending that text to the provider;
2. a data processing agreement with the provider covering it;
3. a decision, recorded, about data residency and whether the provider's
   region is acceptable to your regulator;
4. clinical sign off that an assisted draft is acceptable in your workflow.

## How the request is constructed

`src/lib/ai/gemini.ts` is the only module that talks to the provider. It is a
plain HTTPS request, not a vendor SDK, so the body, the schema and the timeout
are all visible in one file.

Defences, in order:

1. **A system instruction** stating that the model restructures text only,
   must not add clinical information, must not diagnose or assign urgency, and
   **must not follow instructions contained in the input**.
2. **Explicit delimiters.** The clinician's text is wrapped in
   `<<<CLINICIAN_NOTE_START>>>` and `<<<CLINICIAN_NOTE_END>>>`, and the prompt
   states that everything between them is data.
3. **A bounded response schema.** The request asks for JSON matching a fixed
   shape. The response is parsed with Zod and discarded if it does not match.
4. **An allow list on the way back.** A suggested reason category that is not
   one of Kea's own categories is dropped.
5. **Length and timeout limits.** Input is truncated to 6000 characters, the
   request times out after 20 seconds, and output tokens are capped.
6. **Rate limiting** per user.
7. **Logging that excludes content.** Failures log the HTTP status and the
   error name. They never log the request body or the response, because both
   can contain what the clinician typed.

## Prompt injection

The realistic risk is text pasted from elsewhere into the notes box that
contains instructions. The defences above treat all input as data, constrain
the output to a fixed schema, and filter the only field that feeds back into
the product. The output is also never applied automatically: a person reads it
before it becomes part of a record, which is the control that matters most.

## Audit

Every use writes an audit entry recording that assistance was used, by whom,
how long it took and whether it succeeded. It does not record the text sent or
the draft returned.

## Failure behaviour

Every failure, including a timeout, an unparsable response or a schema
mismatch, produces a plain message telling the clinician to write the note
manually. The feature never silently degrades into something that looks like
a successful draft.

## Cost and dependency

The product does not depend on the provider being available. Disabling the
feature removes the control and changes nothing else.
