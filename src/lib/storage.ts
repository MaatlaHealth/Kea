import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";

import { db, type Executor } from "@/db";
import { documentBlobs, documents } from "@/db/schema";
import { requirePatientAccess } from "@/lib/access";
import { recordAudit } from "@/lib/audit";
import { assertCan, type AuthContext } from "@/lib/auth/context";
import { NotFoundError, ValidationError } from "@/lib/errors";

/**
 * Referral attachment storage.
 *
 * Contents live in the database beside the clinical record, so they are
 * covered by the same access control, the same transaction and the same
 * backup. Nothing is ever served from a public URL: every read is brokered by
 * the server after an access check, and every read is audited.
 */

export const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024;

export const ALLOWED_CONTENT_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "text/plain",
]);

export type UploadInput = {
  patientId: string;
  referralId?: string | null;
  fileName: string;
  contentType: string;
  bytes: Buffer;
};

function safeFileName(name: string): string {
  const base = name.replace(/[\\/]/g, "_").replace(/[^\w.\- ]/g, "").trim();
  return (base || "attachment").slice(0, 240);
}

export async function storeDocument(
  ctx: AuthContext,
  input: UploadInput,
  executor: Executor = db,
): Promise<{ id: string }> {
  const { patient, viaFacilityId } = await requirePatientAccess(ctx, input.patientId, executor);
  assertCan(ctx, "document:upload", { facilityId: viaFacilityId });

  if (input.bytes.byteLength === 0) {
    throw new ValidationError("That file is empty.", { file: ["Choose a file with content."] });
  }
  if (input.bytes.byteLength > MAX_DOCUMENT_BYTES) {
    throw new ValidationError("That file is too large.", {
      file: [`The limit is ${Math.round(MAX_DOCUMENT_BYTES / (1024 * 1024))} MB.`],
    });
  }
  if (!ALLOWED_CONTENT_TYPES.has(input.contentType)) {
    throw new ValidationError("That file type is not accepted.", {
      file: ["Attach a PDF, a photograph or a plain text file."],
    });
  }

  const storageKey = `doc_${randomUUID()}`;
  const checksum = createHash("sha256").update(input.bytes).digest("hex");

  const id = await executor.transaction(async (tx) => {
    const [document] = await tx
      .insert(documents)
      .values({
        organisationId: patient.organisationId,
        patientId: patient.id,
        referralId: input.referralId ?? null,
        fileName: safeFileName(input.fileName),
        contentType: input.contentType,
        byteSize: input.bytes.byteLength,
        storageKey,
        checksumSha256: checksum,
        uploadedByUserId: ctx.userId,
      })
      .returning({ id: documents.id });

    await tx.insert(documentBlobs).values({ documentId: document.id, content: input.bytes });

    await recordAudit(
      {
        organisationId: patient.organisationId,
        actorUserId: ctx.userId,
        action: "document.upload",
        resourceType: "document",
        resourceId: document.id,
        metadata: { facilityId: viaFacilityId },
      },
      tx,
    );

    return document.id;
  });

  return { id };
}

export type LoadedDocument = {
  fileName: string;
  contentType: string;
  bytes: Buffer;
};

export async function readDocument(
  ctx: AuthContext,
  documentId: string,
): Promise<LoadedDocument> {
  const [row] = await db
    .select({
      id: documents.id,
      organisationId: documents.organisationId,
      patientId: documents.patientId,
      fileName: documents.fileName,
      contentType: documents.contentType,
      content: documentBlobs.content,
    })
    .from(documents)
    .innerJoin(documentBlobs, eq(documentBlobs.documentId, documents.id))
    .where(and(eq(documents.id, documentId), isNull(documents.deletedAt)))
    .limit(1);

  if (!row) throw new NotFoundError("That attachment could not be found.");

  const { viaFacilityId } = await requirePatientAccess(ctx, row.patientId);
  assertCan(ctx, "document:read", { facilityId: viaFacilityId });

  await recordAudit({
    organisationId: row.organisationId,
    actorUserId: ctx.userId,
    action: "document.read",
    resourceType: "document",
    resourceId: row.id,
    metadata: { facilityId: viaFacilityId },
  });

  return {
    fileName: row.fileName,
    contentType: row.contentType,
    bytes: Buffer.from(row.content),
  };
}

export async function softDeleteDocument(ctx: AuthContext, documentId: string) {
  const [row] = await db
    .select({
      id: documents.id,
      organisationId: documents.organisationId,
      patientId: documents.patientId,
    })
    .from(documents)
    .where(eq(documents.id, documentId))
    .limit(1);
  if (!row) throw new NotFoundError("That attachment could not be found.");

  const { viaFacilityId } = await requirePatientAccess(ctx, row.patientId);
  assertCan(ctx, "document:upload", { facilityId: viaFacilityId });

  await db.transaction(async (tx) => {
    await tx.update(documents).set({ deletedAt: new Date() }).where(eq(documents.id, documentId));
    await tx.delete(documentBlobs).where(eq(documentBlobs.documentId, documentId));
    await recordAudit(
      {
        organisationId: row.organisationId,
        actorUserId: ctx.userId,
        action: "document.delete",
        resourceType: "document",
        resourceId: documentId,
      },
      tx,
    );
  });
}
