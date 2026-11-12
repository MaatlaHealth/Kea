import { NextResponse } from "next/server";

import { requireAuth } from "@/lib/auth/session";
import { isAppError } from "@/lib/errors";
import { readDocument } from "@/lib/storage";

export const dynamic = "force-dynamic";

/**
 * Serves a referral attachment.
 *
 * Attachments are never public. The session is resolved, the patient access
 * rule is applied, the read is audited, and the response is marked private and
 * no-store so it is not cached by a proxy.
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  try {
    const ctx = await requireAuth();
    const document = await readDocument(ctx, id);

    return new NextResponse(new Uint8Array(document.bytes), {
      status: 200,
      headers: {
        "content-type": document.contentType,
        "content-length": String(document.bytes.byteLength),
        "content-disposition": `inline; filename="${encodeURIComponent(document.fileName)}"`,
        "cache-control": "private, no-store, max-age=0",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    if (isAppError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("[kea] document read failed", error);
    return NextResponse.json({ error: "That attachment could not be read." }, { status: 500 });
  }
}
