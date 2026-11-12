import { NextResponse } from "next/server";

import { db } from "@/db";
import { webhookDeliveries } from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import { env } from "@/lib/env";
import { recordInboundMessage } from "@/lib/messaging/dispatch";
import { stripChannelPrefix } from "@/lib/messaging/provider";
import { twilioProvider } from "@/lib/messaging/twilio-provider";

export const dynamic = "force-dynamic";

/**
 * Inbound patient messages.
 *
 * Handles opt out and opt in keywords and stores the message against the
 * patient when the sending number matches one on record. The reply is an empty
 * TwiML document, which tells Twilio not to send an automatic response: any
 * reply to a patient must come from the product's own consented templates.
 */

const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

function twiml(body = EMPTY_TWIML) {
  return new NextResponse(body, {
    status: 200,
    headers: { "content-type": "text/xml; charset=utf-8" },
  });
}

export async function POST(request: Request) {
  const signature = request.headers.get("x-twilio-signature");
  const rawBody = await request.text();
  const params = Object.fromEntries(new URLSearchParams(rawBody).entries());

  const configuredUrl = env().TWILIO_WEBHOOK_URL;
  const url = configuredUrl
    ? `${configuredUrl.replace(/\/$/, "")}/inbound`
    : new URL(request.url).toString();

  if (!twilioProvider.verifyWebhook({ signature, url, params, rawBody })) {
    await recordAudit({
      actorSystem: "twilio_webhook",
      action: "webhook.reject",
      resourceType: "message",
      outcome: "denied",
      metadata: { provider: "twilio", reason: "invalid_signature" },
    });
    return new NextResponse("Invalid signature", { status: 403 });
  }

  const providerMessageId = params.MessageSid ?? params.SmsSid;
  const from = params.From;
  const to = params.To;
  const body = params.Body ?? "";

  if (!providerMessageId || !from || !to) {
    return twiml();
  }

  const inserted = await db
    .insert(webhookDeliveries)
    .values({ provider: "twilio", externalId: providerMessageId, kind: "inbound_message" })
    .onConflictDoNothing()
    .returning({ id: webhookDeliveries.id });

  if (inserted.length === 0) {
    return twiml();
  }

  const channel = from.startsWith("whatsapp:") ? "whatsapp" : "sms";

  const result = await recordInboundMessage({
    fromAddress: stripChannelPrefix(from),
    toAddress: stripChannelPrefix(to),
    channel,
    body,
    providerMessageId,
  });

  await recordAudit({
    actorSystem: "twilio_webhook",
    actorPatientId: result.patientId,
    action: "webhook.inbound_message",
    resourceType: "message",
    resourceId: providerMessageId,
    metadata: { provider: "twilio", channel, result: result.action },
  });

  return twiml();
}
