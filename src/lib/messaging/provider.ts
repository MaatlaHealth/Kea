import type { CommunicationChannel } from "@/db/schema";

/**
 * Messaging provider abstraction.
 *
 * The referral workflow never talks to a provider SDK directly. It asks the
 * registry for a provider that can serve a channel, which keeps Twilio
 * replaceable and lets tests substitute a recording provider.
 */

export type SendRequest = {
  channel: CommunicationChannel;
  to: string;
  body: string;
  /** Provider side approved template identifier, where the channel requires one. */
  providerTemplateId?: string | null;
  /** Passed to the provider so repeat deliveries are not duplicated upstream. */
  idempotencyKey?: string | null;
  statusCallbackUrl?: string | null;
};

export type SendResult =
  | { ok: true; providerMessageId: string; status: "sent" | "queued" }
  | { ok: false; errorCode: string; errorDetail: string; retryable: boolean };

export interface MessagingProvider {
  readonly name: string;
  supports(channel: CommunicationChannel): boolean;
  /** Whether credentials and a sender are configured for this channel. */
  isConfigured(channel: CommunicationChannel): boolean;
  send(request: SendRequest): Promise<SendResult>;
  /** Verifies a provider webhook signature. */
  verifyWebhook(input: {
    signature: string | null;
    url: string;
    params: Record<string, string>;
    rawBody: string;
  }): boolean;
}

/** Normalises a South African or international number to E.164, or returns null. */
export function normalisePhone(input: string | null | undefined, defaultCountry = "27"): string | null {
  if (!input) return null;
  const trimmed = input.replace(/[^\d+]/g, "");
  if (trimmed.length === 0) return null;

  let digits: string;
  if (trimmed.startsWith("+")) {
    digits = trimmed.slice(1);
  } else if (trimmed.startsWith("00")) {
    digits = trimmed.slice(2);
  } else if (trimmed.startsWith("0")) {
    digits = defaultCountry + trimmed.slice(1);
  } else {
    digits = trimmed;
  }

  if (!/^\d{8,15}$/.test(digits)) return null;
  return `+${digits}`;
}

export function channelAddress(channel: CommunicationChannel, phone: string): string {
  return channel === "whatsapp" ? `whatsapp:${phone}` : phone;
}

export function stripChannelPrefix(address: string): string {
  return address.startsWith("whatsapp:") ? address.slice("whatsapp:".length) : address;
}
