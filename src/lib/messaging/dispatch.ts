import "server-only";

import { and, asc, desc, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";

import { db, type Executor } from "@/db";
import {
  consentRecords,
  messageEvents,
  messages,
  optOuts,
  patients,
  type CommunicationChannel,
  type ConsentType,
} from "@/db/schema";
import { env, integrations } from "@/lib/env";
import { normalisePhone, stripChannelPrefix, type MessagingProvider } from "./provider";
import { MESSAGE_TEMPLATES, renderTemplate, type TemplateKey } from "./templates";
import { twilioProvider } from "./twilio-provider";

/**
 * Message dispatch.
 *
 * Rules enforced here, in order:
 *
 *  1. The patient must have a usable address for the channel.
 *  2. The template's required consent must be on record and not withdrawn.
 *  3. The address must not be on the organisation opt out list.
 *  4. The idempotency key must not already exist, so a job that runs twice
 *     never sends twice.
 *
 * When messaging is not configured the message is still recorded with status
 * `queued` and is never silently reported as delivered.
 */

const MAX_ATTEMPTS = 4;
const BACKOFF_MINUTES = [5, 20, 60];

let provider: MessagingProvider = twilioProvider;

/** Used by tests to substitute a recording provider. */
export function setMessagingProvider(next: MessagingProvider) {
  provider = next;
}

export function getMessagingProvider(): MessagingProvider {
  return provider;
}

export type QueueOutcome =
  | { status: "queued" | "sent"; messageId: string }
  | { status: "skipped"; reason: SkipReason };

export type SkipReason =
  | "no_contact_details"
  | "consent_missing"
  | "opted_out"
  | "channel_disabled"
  | "duplicate";

export const SKIP_REASON_LABELS: Record<SkipReason, string> = {
  no_contact_details: "No usable phone number is on record.",
  consent_missing: "The patient has not consented to this kind of message.",
  opted_out: "The patient has opted out of messages.",
  channel_disabled: "The patient has chosen not to receive messages.",
  duplicate: "A message for this event was already created.",
};

export type QueueMessageInput = {
  organisationId: string;
  patientId: string;
  templateKey: TemplateKey;
  variables: Record<string, string>;
  referralId?: string | null;
  appointmentId?: string | null;
  /** Overrides the patient's preferred channel, for example to force SMS. */
  channel?: CommunicationChannel;
  /** Stable key derived from the triggering event. */
  idempotencyKey: string;
  /** Send immediately rather than leaving the row for the dispatch job. */
  sendNow?: boolean;
};

async function hasConsent(
  patientId: string,
  type: ConsentType,
  executor: Executor,
): Promise<boolean> {
  const [latest] = await executor
    .select({ status: consentRecords.status })
    .from(consentRecords)
    .where(and(eq(consentRecords.patientId, patientId), eq(consentRecords.type, type)))
    .orderBy(desc(consentRecords.capturedAt))
    .limit(1);
  return latest?.status === "granted";
}

async function isOptedOut(
  organisationId: string,
  address: string,
  channel: CommunicationChannel,
  executor: Executor,
): Promise<boolean> {
  const [row] = await executor
    .select({ id: optOuts.id })
    .from(optOuts)
    .where(
      and(
        eq(optOuts.organisationId, organisationId),
        eq(optOuts.address, address),
        eq(optOuts.channel, channel),
      ),
    )
    .limit(1);
  return Boolean(row);
}

export async function queueMessage(
  input: QueueMessageInput,
  executor: Executor = db,
): Promise<QueueOutcome> {
  const definition = MESSAGE_TEMPLATES[input.templateKey];

  const [patient] = await executor
    .select({
      phone: patients.phone,
      preferredChannel: patients.preferredChannel,
      preferredLanguage: patients.preferredLanguage,
      organisationId: patients.organisationId,
    })
    .from(patients)
    .where(eq(patients.id, input.patientId))
    .limit(1);

  if (!patient) return { status: "skipped", reason: "no_contact_details" };

  const channel = input.channel ?? patient.preferredChannel;
  if (channel === "none" || channel === "voice_callback") {
    return { status: "skipped", reason: "channel_disabled" };
  }

  const phone = normalisePhone(patient.phone);
  if (!phone) return { status: "skipped", reason: "no_contact_details" };

  if (definition.requiresConsent !== "none") {
    const consented = await hasConsent(input.patientId, definition.requiresConsent, executor);
    if (!consented) return { status: "skipped", reason: "consent_missing" };
  }

  if (await isOptedOut(input.organisationId, phone, channel, executor)) {
    return { status: "skipped", reason: "opted_out" };
  }

  const body = renderTemplate(input.templateKey, input.variables);

  const inserted = await executor
    .insert(messages)
    .values({
      organisationId: input.organisationId,
      patientId: input.patientId,
      referralId: input.referralId ?? null,
      appointmentId: input.appointmentId ?? null,
      direction: "outbound",
      channel,
      templateKey: input.templateKey,
      body,
      toAddress: phone,
      status: "queued",
      provider: provider.name,
      idempotencyKey: input.idempotencyKey,
      nextAttemptAt: new Date(),
    })
    // The unique index on idempotency_key is partial, so the predicate has to
    // be repeated here for PostgreSQL to accept it as the conflict arbiter.
    .onConflictDoNothing({
      target: messages.idempotencyKey,
      where: sql`idempotency_key is not null`,
    })
    .returning({ id: messages.id });

  const row = inserted[0];
  if (!row) return { status: "skipped", reason: "duplicate" };

  await executor.insert(messageEvents).values({ messageId: row.id, status: "queued" });

  if (input.sendNow && integrations()[channel === "whatsapp" ? "whatsapp" : "sms"].enabled) {
    const result = await deliverMessage(row.id, executor);
    return { status: result === "sent" ? "sent" : "queued", messageId: row.id };
  }

  return { status: "queued", messageId: row.id };
}

/**
 * Attempts one delivery of a queued message and records the result.
 * Returns the resulting message status.
 */
export async function deliverMessage(
  messageId: string,
  executor: Executor = db,
): Promise<"sent" | "queued" | "failed" | "undeliverable"> {
  const [message] = await executor
    .select()
    .from(messages)
    .where(eq(messages.id, messageId))
    .limit(1);

  if (!message) return "failed";
  if (message.status !== "queued" && message.status !== "failed") {
    return message.status === "sent" ? "sent" : "queued";
  }

  const channelStatus = integrations()[message.channel === "whatsapp" ? "whatsapp" : "sms"];
  if (!channelStatus.enabled) {
    // Not configured. The message stays queued so an operator can send it once
    // credentials are in place. It is never reported as delivered.
    return "queued";
  }

  const attempt = message.attemptCount + 1;
  await executor
    .update(messages)
    .set({ status: "sending", attemptCount: attempt, updatedAt: new Date() })
    .where(eq(messages.id, messageId));

  const config = env();
  const result = await provider.send({
    channel: message.channel,
    to: message.toAddress,
    body: message.body,
    idempotencyKey: message.idempotencyKey,
    statusCallbackUrl: config.TWILIO_WEBHOOK_URL
      ? `${config.TWILIO_WEBHOOK_URL.replace(/\/$/, "")}/status`
      : `${config.APP_URL.replace(/\/$/, "")}/api/webhooks/twilio/status`,
  });

  const now = new Date();
  if (result.ok) {
    await executor
      .update(messages)
      .set({
        status: "sent",
        providerMessageId: result.providerMessageId,
        sentAt: now,
        errorCode: null,
        errorDetail: null,
        nextAttemptAt: null,
        updatedAt: now,
      })
      .where(eq(messages.id, messageId));
    await executor.insert(messageEvents).values({ messageId, status: "sent" });
    return "sent";
  }

  const exhausted = attempt >= MAX_ATTEMPTS || !result.retryable;
  const status = exhausted ? (result.retryable ? "failed" : "undeliverable") : "queued";
  const backoff = BACKOFF_MINUTES[Math.min(attempt - 1, BACKOFF_MINUTES.length - 1)];

  await executor
    .update(messages)
    .set({
      status,
      errorCode: result.errorCode.slice(0, 40),
      errorDetail: result.errorDetail.slice(0, 300),
      nextAttemptAt: exhausted ? null : new Date(now.getTime() + backoff * 60_000),
      updatedAt: now,
    })
    .where(eq(messages.id, messageId));

  await executor.insert(messageEvents).values({
    messageId,
    status,
    detail: `${result.errorCode}: ${result.errorDetail}`.slice(0, 300),
  });

  return status === "queued" ? "queued" : status;
}

/** Sends due messages. Called by the scheduled job endpoint. */
export async function processPendingMessages(limit = 50, now = new Date()) {
  const due = await db
    .select({ id: messages.id })
    .from(messages)
    .where(
      and(
        inArray(messages.status, ["queued", "failed"]),
        or(isNull(messages.nextAttemptAt), lte(messages.nextAttemptAt, now)),
        lte(messages.attemptCount, MAX_ATTEMPTS - 1),
      ),
    )
    .orderBy(asc(messages.createdAt))
    .limit(limit);

  let sent = 0;
  let stillQueued = 0;
  let failed = 0;

  for (const row of due) {
    const result = await deliverMessage(row.id);
    if (result === "sent") sent += 1;
    else if (result === "queued") stillQueued += 1;
    else failed += 1;
  }

  return { considered: due.length, sent, stillQueued, failed };
}

/** Applies a provider delivery status callback. Safe to call repeatedly. */
export async function applyDeliveryStatus(input: {
  providerMessageId: string;
  status: "sent" | "delivered" | "read" | "failed" | "undeliverable";
  providerEventId?: string | null;
  detail?: string | null;
}): Promise<"applied" | "unknown_message" | "duplicate"> {
  const [message] = await db
    .select({ id: messages.id, status: messages.status })
    .from(messages)
    .where(
      and(
        eq(messages.provider, provider.name),
        eq(messages.providerMessageId, input.providerMessageId),
      ),
    )
    .limit(1);

  if (!message) return "unknown_message";

  const inserted = await db
    .insert(messageEvents)
    .values({
      messageId: message.id,
      status: input.status,
      providerEventId: input.providerEventId ?? null,
      detail: input.detail?.slice(0, 300) ?? null,
    })
    .onConflictDoNothing()
    .returning({ id: messageEvents.id });

  if (inserted.length === 0 && input.providerEventId) return "duplicate";

  const now = new Date();
  await db
    .update(messages)
    .set({
      status: input.status,
      deliveredAt: input.status === "delivered" || input.status === "read" ? now : undefined,
      errorDetail:
        input.status === "failed" || input.status === "undeliverable"
          ? (input.detail?.slice(0, 300) ?? null)
          : undefined,
      updatedAt: now,
    })
    .where(eq(messages.id, message.id));

  return "applied";
}

const OPT_OUT_KEYWORDS = new Set(["stop", "stopall", "unsubscribe", "cancel", "end", "quit"]);
const OPT_IN_KEYWORDS = new Set(["start", "unstop", "yes"]);

/**
 * Stores an inbound message and applies opt out or opt in keywords.
 * Inbound text is stored verbatim because the patient chose to send it, but it
 * is never parsed for clinical meaning.
 */
export async function recordInboundMessage(input: {
  fromAddress: string;
  toAddress: string;
  channel: CommunicationChannel;
  body: string;
  providerMessageId: string;
}): Promise<{ action: "opted_out" | "opted_in" | "stored"; patientId: string | null }> {
  const phone = normalisePhone(stripChannelPrefix(input.fromAddress));
  if (!phone) return { action: "stored", patientId: null };

  const [patient] = await db
    .select({ id: patients.id, organisationId: patients.organisationId })
    .from(patients)
    .where(and(eq(patients.phone, phone), isNull(patients.deletedAt)))
    .limit(1);

  const keyword = input.body.trim().toLowerCase().split(/\s+/)[0] ?? "";
  let action: "opted_out" | "opted_in" | "stored" = "stored";

  if (patient) {
    if (OPT_OUT_KEYWORDS.has(keyword)) {
      await db
        .insert(optOuts)
        .values({
          organisationId: patient.organisationId,
          address: phone,
          channel: input.channel,
          source: "inbound_keyword",
        })
        .onConflictDoNothing();
      action = "opted_out";
    } else if (OPT_IN_KEYWORDS.has(keyword)) {
      await db
        .delete(optOuts)
        .where(
          and(
            eq(optOuts.organisationId, patient.organisationId),
            eq(optOuts.address, phone),
            eq(optOuts.channel, input.channel),
          ),
        );
      action = "opted_in";
    }
  }

  if (!patient) {
    // An inbound message from a number that matches no patient is not stored.
    // There is no organisation it can legitimately be filed under, and keeping
    // it would mean holding personal data with no basis for doing so.
    return { action, patientId: null };
  }

  await db
    .insert(messages)
    .values({
      organisationId: patient.organisationId,
      patientId: patient.id,
      direction: "inbound",
      channel: input.channel,
      body: input.body.slice(0, 1600),
      toAddress: stripChannelPrefix(input.toAddress),
      fromAddress: phone,
      status: "delivered",
      provider: provider.name,
      providerMessageId: input.providerMessageId,
    })
    .onConflictDoNothing();

  return { action, patientId: patient.id };
}
