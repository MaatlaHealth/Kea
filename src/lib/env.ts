import { z } from "zod";

/**
 * Environment validation.
 *
 * Server variables are validated lazily so that a missing optional integration
 * never prevents the application from starting. Required variables are checked
 * on first access and produce a single readable error.
 */

const serverSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  DATABASE_SSL: z.enum(["require", "prefer", "disable"]).default("prefer"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  SESSION_COOKIE_NAME: z.string().default("kea_session"),
  SESSION_TTL_HOURS: z.coerce.number().int().positive().max(720).default(12),
  /** Separate, shorter lifetime for the patient portal. */
  PATIENT_SESSION_TTL_MINUTES: z.coerce.number().int().positive().max(1440).default(45),

  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_SMS_FROM: z.string().optional(),
  TWILIO_WHATSAPP_FROM: z.string().optional(),
  TWILIO_MESSAGING_SERVICE_SID: z.string().optional(),
  TWILIO_WEBHOOK_URL: z.string().url().optional(),
  MESSAGING_ENABLED: z.enum(["true", "false"]).default("false"),

  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default("gemini-2.0-flash"),
  /** AI assistance is off unless explicitly enabled by an operator. */
  AI_ASSIST_ENABLED: z.enum(["true", "false"]).default("false"),

  PREDICTION_SERVICE_URL: z.string().url().optional(),
  PREDICTION_SERVICE_TOKEN: z.string().optional(),
  PREDICTION_ENABLED: z.enum(["true", "false"]).default("false"),

  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  STORAGE_LOCAL_DIR: z.string().default(".storage"),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),

  PILOT_ENQUIRY_NOTIFY_EMAIL: z.string().email().optional(),
  SMTP_URL: z.string().optional(),
  SMTP_FROM: z.string().optional(),

  /** Shared secret used by the scheduled jobs endpoint. */
  JOB_RUNNER_TOKEN: z.string().optional(),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type ServerEnv = z.infer<typeof serverSchema>;

let cached: ServerEnv | null = null;

export function env(): ServerEnv {
  if (cached) return cached;
  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

/** Used by tests to re-read process.env after mutation. */
export function resetEnvCache(): void {
  cached = null;
}

export type IntegrationStatus = {
  configured: boolean;
  enabled: boolean;
  missing: string[];
};

function status(enabled: boolean, required: Array<[string, string | undefined]>): IntegrationStatus {
  const missing = required.filter(([, value]) => !value).map(([name]) => name);
  return { configured: missing.length === 0, enabled: enabled && missing.length === 0, missing };
}

/**
 * Reports which optional integrations are usable. The application degrades to
 * a fully manual workflow when an integration is not configured.
 */
export function integrations() {
  const e = env();
  const smsSender = e.TWILIO_MESSAGING_SERVICE_SID ?? e.TWILIO_SMS_FROM;
  return {
    sms: status(e.MESSAGING_ENABLED === "true", [
      ["TWILIO_ACCOUNT_SID", e.TWILIO_ACCOUNT_SID],
      ["TWILIO_AUTH_TOKEN", e.TWILIO_AUTH_TOKEN],
      ["TWILIO_SMS_FROM or TWILIO_MESSAGING_SERVICE_SID", smsSender],
    ]),
    whatsapp: status(e.MESSAGING_ENABLED === "true", [
      ["TWILIO_ACCOUNT_SID", e.TWILIO_ACCOUNT_SID],
      ["TWILIO_AUTH_TOKEN", e.TWILIO_AUTH_TOKEN],
      ["TWILIO_WHATSAPP_FROM", e.TWILIO_WHATSAPP_FROM],
    ]),
    ai: status(e.AI_ASSIST_ENABLED === "true", [["GEMINI_API_KEY", e.GEMINI_API_KEY]]),
    prediction: status(e.PREDICTION_ENABLED === "true", [
      ["PREDICTION_SERVICE_URL", e.PREDICTION_SERVICE_URL],
    ]),
    email: status(Boolean(e.SMTP_URL), [
      ["SMTP_URL", e.SMTP_URL],
      ["SMTP_FROM", e.SMTP_FROM],
    ]),
  };
}

export function isProduction(): boolean {
  return env().NODE_ENV === "production";
}
