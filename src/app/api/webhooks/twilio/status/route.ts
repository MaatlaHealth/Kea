import { NextResponse } from "next/server";

import { db } from "@/db";
import { webhookDeliveries } from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import { env } from "@/lib/env";
import { applyDeliveryStatus } from "@/lib/messaging/dispatch";
import { twilioProvider } from "@/lib/messaging/twilio-provider";

export const dynamic = "force-dynamic";

/**
 * Twilio delivery status callback.
 *
 * The signature is verified before anything is read from the body. Each
 * delivery is recorded by its provider identifier so a replayed callback is
 * ignored rather than applied twice.
 */

const STATUS_MAP: Record<string, "sent" | "delivered" | "read" | "failed" | "undeliverable"> = {
  sent: "sent",
  delivered: "delivered",
  read: "read",
  failed: "failed",
  undelivered: "undeliverable",
};

export async function POST(request: Request) {
  const signature = request.headers.get("x-twilio-signature");
  const rawBody = await request.text();
  const params = Object.fromEntries(new URLSearchParams(rawBody).entries());

  const configuredUrl = env().TWILIO_WEBHOOK_URL;
  const url = configuredUrl
    ? `${configuredUrl.replace(/\/$/, "")}/status`
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
  const providerStatus = params.MessageStatus ?? params.SmsStatus;

  if (!providerMessageId || !providerStatus) {
    return NextResponse.json({ ignored: true, reason: "missing_fields" });
  }

  const mapped = STATUS_MAP[providerStatus];
  if (!mapped) {
    return NextResponse.json({ ignored: true, reason: "unmapped_status" });
  }

  const eventId = `${providerMessageId}:${providerStatus}`;
  const inserted = await db
    .insert(webhookDeliveries)
    .values({ provider: "twilio", externalId: eventId, kind: "message_status" })
    .onConflictDoNothing()
    .returning({ id: webhookDeliveries.id });

  if (inserted.length === 0) {
    return NextResponse.json({ ignored: true, reason: "duplicate" });
  }

  const result = await applyDeliveryStatus({
    providerMessageId,
    status: mapped,
    providerEventId: eventId,
    detail: params.ErrorCode ? `Twilio error ${params.ErrorCode}` : null,
  });

  await recordAudit({
    actorSystem: "twilio_webhook",
    action: "webhook.message_status",
    resourceType: "message",
    resourceId: providerMessageId,
    metadata: { provider: "twilio", result, errorCode: params.ErrorCode },
  });

  return NextResponse.json({ applied: result === "applied" });
}
