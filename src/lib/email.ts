import "server-only";

import { env } from "@/lib/env";

/**
 * Operational email.
 *
 * Used only for messages to staff and administrators: invitations, password
 * resets and pilot enquiry notifications. Patient communication never goes
 * through this path, and no clinical content is ever placed in an email body.
 *
 * When SMTP is not configured the message is logged rather than sent, and the
 * caller is told it was not delivered. Nothing pretends a send succeeded.
 */

export type OperationalEmail = {
  to: string;
  subject: string;
  body: string;
};

export type EmailResult = { delivered: boolean; reason?: string };

let transportPromise: Promise<import("nodemailer").Transporter> | null = null;

async function getTransport() {
  if (!transportPromise) {
    transportPromise = (async () => {
      const nodemailer = await import("nodemailer");
      return nodemailer.createTransport(env().SMTP_URL as string);
    })();
  }
  return transportPromise;
}

export async function sendOperationalEmail(email: OperationalEmail): Promise<EmailResult> {
  const config = env();
  if (!config.SMTP_URL || !config.SMTP_FROM) {
    console.info(
      `[kea] email not sent, SMTP is not configured. subject="${email.subject}" to="${email.to}"`,
    );
    return { delivered: false, reason: "smtp_not_configured" };
  }

  try {
    const transport = await getTransport();
    await transport.sendMail({
      from: config.SMTP_FROM,
      to: email.to,
      subject: email.subject,
      text: email.body,
    });
    return { delivered: true };
  } catch (error) {
    console.error("[kea] email send failed", { subject: email.subject, error });
    return { delivered: false, reason: "send_failed" };
  }
}

/** Builds the absolute URL used in invitation and reset emails. */
export function absoluteUrl(path: string): string {
  const base = env().APP_URL.replace(/\/$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}
