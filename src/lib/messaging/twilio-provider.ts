import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import type { CommunicationChannel } from "@/db/schema";
import { env } from "@/lib/env";
import { channelAddress, type MessagingProvider, type SendRequest, type SendResult } from "./provider";

/**
 * Twilio provider.
 *
 * The SDK is imported lazily so that a deployment without Twilio credentials
 * never loads it, and so the module stays out of any client bundle.
 */

type TwilioClient = {
  messages: {
    create: (options: Record<string, unknown>) => Promise<{ sid: string; status: string }>;
  };
};

let clientPromise: Promise<TwilioClient> | null = null;

async function getClient(): Promise<TwilioClient> {
  if (!clientPromise) {
    clientPromise = (async () => {
      const config = env();
      const mod = await import("twilio");
      const factory = (mod.default ?? mod) as unknown as (
        sid: string,
        token: string,
      ) => TwilioClient;
      return factory(config.TWILIO_ACCOUNT_SID as string, config.TWILIO_AUTH_TOKEN as string);
    })();
  }
  return clientPromise;
}

/** Twilio error codes that will not succeed on retry. */
const PERMANENT_ERROR_CODES = new Set([
  "21211", // invalid to number
  "21408", // permission to send to region not enabled
  "21610", // recipient has opted out
  "21612", // cannot route to this number
  "63003", // WhatsApp recipient not found
  "63016", // outside session window and no approved template
]);

export class TwilioProvider implements MessagingProvider {
  readonly name = "twilio";

  supports(channel: CommunicationChannel): boolean {
    return channel === "sms" || channel === "whatsapp";
  }

  isConfigured(channel: CommunicationChannel): boolean {
    const config = env();
    if (!config.TWILIO_ACCOUNT_SID || !config.TWILIO_AUTH_TOKEN) return false;
    if (channel === "sms") {
      return Boolean(config.TWILIO_SMS_FROM || config.TWILIO_MESSAGING_SERVICE_SID);
    }
    if (channel === "whatsapp") return Boolean(config.TWILIO_WHATSAPP_FROM);
    return false;
  }

  async send(request: SendRequest): Promise<SendResult> {
    const config = env();
    if (!this.isConfigured(request.channel)) {
      return {
        ok: false,
        errorCode: "not_configured",
        errorDetail: `Twilio is not configured for ${request.channel}.`,
        retryable: false,
      };
    }

    const options: Record<string, unknown> = {
      to: channelAddress(request.channel, request.to),
      body: request.body,
    };

    if (request.channel === "whatsapp") {
      options.from = `whatsapp:${config.TWILIO_WHATSAPP_FROM}`;
    } else if (config.TWILIO_MESSAGING_SERVICE_SID) {
      options.messagingServiceSid = config.TWILIO_MESSAGING_SERVICE_SID;
    } else {
      options.from = config.TWILIO_SMS_FROM;
    }

    if (request.statusCallbackUrl) {
      options.statusCallback = request.statusCallbackUrl;
    }

    try {
      const client = await getClient();
      const message = await client.messages.create(options);
      return {
        ok: true,
        providerMessageId: message.sid,
        status: message.status === "sent" ? "sent" : "queued",
      };
    } catch (error) {
      const err = error as { code?: number | string; message?: string; status?: number };
      const code = err.code !== undefined ? String(err.code) : "unknown";
      const retryable = !PERMANENT_ERROR_CODES.has(code) && (err.status ?? 500) >= 500;
      return {
        ok: false,
        errorCode: code,
        errorDetail: (err.message ?? "Twilio request failed").slice(0, 300),
        retryable,
      };
    }
  }

  verifyWebhook(input: {
    signature: string | null;
    url: string;
    params: Record<string, string>;
    rawBody: string;
  }): boolean {
    const config = env();
    if (!config.TWILIO_AUTH_TOKEN || !input.signature) return false;
    return verifyTwilioSignature({
      authToken: config.TWILIO_AUTH_TOKEN,
      signature: input.signature,
      url: input.url,
      params: input.params,
    });
  }
}

/**
 * Validates the X-Twilio-Signature header.
 *
 * Twilio builds the signature by concatenating the full request URL with each
 * POST parameter name and value in alphabetical order, then taking the
 * base64 HMAC-SHA1 with the account auth token. Implemented here directly so
 * that webhook verification has no dependency on SDK internals and can be unit
 * tested without network access.
 */
export function verifyTwilioSignature(input: {
  authToken: string;
  signature: string;
  url: string;
  params: Record<string, string>;
}): boolean {
  let data = input.url;
  for (const key of Object.keys(input.params).sort()) {
    data += key + input.params[key];
  }
  const expected = createHmac("sha1", input.authToken).update(Buffer.from(data, "utf-8")).digest();

  let provided: Buffer;
  try {
    provided = Buffer.from(input.signature, "base64");
  } catch {
    return false;
  }
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

export const twilioProvider = new TwilioProvider();
