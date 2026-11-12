import { db, type Executor } from "@/db";
import { auditEvents } from "@/db/schema";

/**
 * Audit logging.
 *
 * Audit rows record who did what to which record. They deliberately exclude
 * patient names, contact details, clinical content and message bodies so the
 * audit trail can be read by administrators and exported for review without
 * disclosing health information.
 */

const ALLOWED_METADATA_KEYS = new Set([
  "role",
  "roles",
  "reason",
  "fromStatus",
  "toStatus",
  "channel",
  "templateKey",
  "facilityId",
  "receivingFacilityId",
  "referringFacilityId",
  "referralReference",
  "taskKind",
  "count",
  "durationMs",
  "modelVersion",
  "feature",
  "scope",
  "method",
  "changedFields",
  "result",
  "provider",
  "errorCode",
  "targetUserId",
  "invitationId",
  "appointmentId",
  "consentType",
  "consentStatus",
  "band",
  "field",
  "query",
]);

export type AuditInput = {
  organisationId?: string | null;
  actorUserId?: string | null;
  actorPatientId?: string | null;
  actorSystem?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  outcome?: "success" | "failure" | "denied";
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
  userAgent?: string | null;
};

/** Drops any metadata key that is not on the allow list. */
function sanitiseMetadata(metadata: Record<string, unknown> | undefined) {
  if (!metadata) return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (!ALLOWED_METADATA_KEYS.has(key)) continue;
    if (value === null || value === undefined) continue;
    if (typeof value === "string") {
      out[key] = value.slice(0, 200);
    } else if (typeof value === "number" || typeof value === "boolean") {
      out[key] = value;
    } else if (Array.isArray(value)) {
      out[key] = value.slice(0, 40).map((item) => String(item).slice(0, 80));
    }
  }
  return out;
}

export async function recordAudit(input: AuditInput, executor: Executor = db): Promise<void> {
  try {
    await executor.insert(auditEvents).values({
      organisationId: input.organisationId ?? null,
      actorUserId: input.actorUserId ?? null,
      actorPatientId: input.actorPatientId ?? null,
      actorSystem: input.actorSystem ?? null,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId ?? null,
      outcome: input.outcome ?? "success",
      metadata: sanitiseMetadata(input.metadata),
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ? input.userAgent.slice(0, 300) : null,
    });
  } catch (error) {
    // Audit failures must never break a clinical action, but they must be loud.
    console.error("[kea] failed to write audit event", {
      action: input.action,
      resourceType: input.resourceType,
      error,
    });
  }
}

export { sanitiseMetadata as sanitiseAuditMetadata };
