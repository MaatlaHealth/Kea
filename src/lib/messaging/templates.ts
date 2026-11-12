import type { CommunicationChannel } from "@/db/schema";

/**
 * Message templates.
 *
 * Every template is written so that an intercepted message reveals nothing
 * clinical. Templates may reference a facility name, a date and a time. They
 * must never reference a diagnosis, a reason for referral, a department that
 * implies a condition, or any clinical observation.
 *
 * The rendering function rejects any variable value that is not on the allowed
 * variable list for the template, so a future template change cannot silently
 * start interpolating sensitive content.
 */

export type TemplateKey =
  | "referral_confirmation"
  | "appointment_scheduled"
  | "appointment_reminder"
  | "appointment_missed"
  | "follow_up_reminder"
  | "contact_request"
  | "portal_access_code"
  | "opt_out_confirmation";

export type TemplateDefinition = {
  key: TemplateKey;
  /** Which consent must be on record before this template may be sent. */
  requiresConsent: "appointment_messaging" | "follow_up_messaging" | "none";
  variables: readonly string[];
  /** Plain language description shown to staff in the settings screen. */
  purpose: string;
  bodies: Record<"en", string>;
};

export const MESSAGE_TEMPLATES: Record<TemplateKey, TemplateDefinition> = {
  referral_confirmation: {
    key: "referral_confirmation",
    requiresConsent: "appointment_messaging",
    variables: ["facilityName", "reference"],
    purpose: "Confirms that a referral has been sent to another facility.",
    bodies: {
      en:
        "Hello, this is Kea. Your healthcare facility has arranged a visit for you at {{facilityName}}. " +
        "Your reference is {{reference}}. Please contact your clinic if you need help.",
    },
  },
  appointment_scheduled: {
    key: "appointment_scheduled",
    requiresConsent: "appointment_messaging",
    variables: ["facilityName", "date", "time"],
    purpose: "Tells the patient the date and time of a booked visit.",
    bodies: {
      en:
        "Hello, this is Kea. You have a healthcare appointment at {{facilityName}} on {{date}} at {{time}}. " +
        "Please contact your clinic if you need to change it.",
    },
  },
  appointment_reminder: {
    key: "appointment_reminder",
    requiresConsent: "appointment_messaging",
    variables: ["facilityName", "date", "time"],
    purpose: "Reminds the patient shortly before a booked visit.",
    bodies: {
      en:
        "Hello, this is Kea. A reminder of your healthcare appointment at {{facilityName}} on {{date}} at {{time}}. " +
        "Reply STOP to stop these messages.",
    },
  },
  appointment_missed: {
    key: "appointment_missed",
    requiresConsent: "follow_up_messaging",
    variables: ["facilityName"],
    purpose: "Invites the patient to rebook after a missed visit.",
    bodies: {
      en:
        "Hello, this is Kea. We did not see you at your appointment at {{facilityName}}. " +
        "Please contact your clinic so a new date can be arranged.",
    },
  },
  follow_up_reminder: {
    key: "follow_up_reminder",
    requiresConsent: "follow_up_messaging",
    variables: ["facilityName"],
    purpose: "Reminds the patient that a follow up visit is due.",
    bodies: {
      en:
        "Hello, this is Kea. A follow up visit is due at {{facilityName}}. " +
        "Please contact your clinic to arrange a time.",
    },
  },
  contact_request: {
    key: "contact_request",
    requiresConsent: "follow_up_messaging",
    variables: ["facilityName", "phone"],
    purpose: "Asks the patient to make contact with the facility.",
    bodies: {
      en:
        "Hello, this is Kea. Please contact {{facilityName}} on {{phone}} about your healthcare appointment.",
    },
  },
  portal_access_code: {
    key: "portal_access_code",
    requiresConsent: "none",
    variables: ["code", "minutes"],
    purpose: "Sends a one time code for signing in to the patient portal.",
    bodies: {
      en: "Your Kea access code is {{code}}. It expires in {{minutes}} minutes. Do not share it.",
    },
  },
  opt_out_confirmation: {
    key: "opt_out_confirmation",
    requiresConsent: "none",
    variables: [],
    purpose: "Confirms that the patient will no longer receive messages.",
    bodies: {
      en:
        "You will no longer receive Kea messages. Your healthcare facility will contact you another way if needed.",
    },
  },
};

const PLACEHOLDER = /\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g;

export class TemplateError extends Error {}

/**
 * Renders a template body. Throws when a placeholder has no value or when a
 * supplied variable is not declared by the template.
 */
export function renderTemplate(
  key: TemplateKey,
  variables: Record<string, string>,
  language: "en" = "en",
): string {
  const definition = MESSAGE_TEMPLATES[key];
  if (!definition) throw new TemplateError(`Unknown message template: ${key}`);

  for (const name of Object.keys(variables)) {
    if (!definition.variables.includes(name)) {
      throw new TemplateError(`Variable ${name} is not permitted in template ${key}.`);
    }
  }

  const body = definition.bodies[language];
  return body.replace(PLACEHOLDER, (_match, name: string) => {
    const value = variables[name];
    if (value === undefined || value === null || value === "") {
      throw new TemplateError(`Missing value for ${name} in template ${key}.`);
    }
    // Strip newlines so a value can never inject extra message lines.
    return String(value).replace(/[\r\n]+/g, " ").slice(0, 120);
  });
}

/** Longest body across templates, used to size the message column and warn on SMS segments. */
export function estimateSmsSegments(body: string): number {
  const gsmSafe = /^[\x20-\x7E\n\r]*$/.test(body);
  const limit = gsmSafe ? 160 : 70;
  const concatLimit = gsmSafe ? 153 : 67;
  if (body.length <= limit) return 1;
  return Math.ceil(body.length / concatLimit);
}

export function templateChannelsFor(key: TemplateKey): CommunicationChannel[] {
  return key === "portal_access_code" ? ["sms"] : ["sms", "whatsapp"];
}
