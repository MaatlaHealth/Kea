"use server";

import { headers } from "next/headers";
import { z } from "zod";

import { db } from "@/db";
import { pilotEnquiries } from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import { sendOperationalEmail } from "@/lib/email";
import { env } from "@/lib/env";
import { enforceRateLimit } from "@/lib/rate-limit";
import { errorState, parseForm, successState, toActionError, type ActionState } from "../action-result";

const enquirySchema = z.object({
  organisationName: z.string().trim().min(2, "Enter the name of your organisation.").max(200),
  contactName: z.string().trim().min(2, "Enter your name.").max(160),
  contactEmail: z.string().trim().email("Enter a valid email address.").max(254),
  contactPhone: z.string().trim().max(32).optional().or(z.literal("")),
  role: z.string().trim().max(120).optional().or(z.literal("")),
  country: z.string().trim().min(2, "Enter the country your service operates in.").max(80),
  facilityCount: z.string().trim().max(40).optional().or(z.literal("")),
  monthlyReferralVolume: z.string().trim().max(40).optional().or(z.literal("")),
  message: z
    .string()
    .trim()
    .min(20, "Tell us a little about your referral pathways so we can respond usefully.")
    .max(4000),
  /** Hidden field. Real users leave it empty. */
  website: z.string().max(0).optional(),
  consent: z.literal("on", {
    errorMap: () => ({ message: "Please confirm you agree to be contacted about a pilot." }),
  }),
});

export async function submitPilotEnquiry(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const input = parseForm(enquirySchema, formData);

    if (input.website) {
      // Honeypot filled. Report success without storing anything.
      return successState("Thank you. We will be in touch.");
    }

    const headerList = await headers();
    const ip =
      headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      headerList.get("x-real-ip") ??
      "unknown";
    await enforceRateLimit("pilotEnquiry", ip);

    const [enquiry] = await db
      .insert(pilotEnquiries)
      .values({
        organisationName: input.organisationName,
        contactName: input.contactName,
        contactEmail: input.contactEmail.toLowerCase(),
        contactPhone: input.contactPhone || null,
        role: input.role || null,
        country: input.country,
        facilityCount: input.facilityCount || null,
        monthlyReferralVolume: input.monthlyReferralVolume || null,
        message: input.message,
        sourcePath: "/request-a-pilot",
      })
      .returning({ id: pilotEnquiries.id });

    await recordAudit({
      action: "pilot_enquiry.create",
      resourceType: "pilot_enquiry",
      resourceId: enquiry.id,
      actorSystem: "public_website",
      metadata: { result: "stored" },
      ipAddress: ip,
    });

    const notifyTo = env().PILOT_ENQUIRY_NOTIFY_EMAIL;
    if (notifyTo) {
      await sendOperationalEmail({
        to: notifyTo,
        subject: `Kea pilot enquiry from ${input.organisationName}`,
        body: [
          "A new pilot enquiry was submitted on the Kea website.",
          "",
          `Organisation: ${input.organisationName}`,
          `Country: ${input.country}`,
          `Contact: ${input.contactName}`,
          `Email: ${input.contactEmail}`,
          input.contactPhone ? `Phone: ${input.contactPhone}` : null,
          input.role ? `Role: ${input.role}` : null,
          input.facilityCount ? `Facilities: ${input.facilityCount}` : null,
          input.monthlyReferralVolume ? `Monthly referrals: ${input.monthlyReferralVolume}` : null,
          "",
          "Message:",
          input.message,
          "",
          `Enquiry id: ${enquiry.id}`,
        ]
          .filter((line) => line !== null)
          .join("\n"),
      }).catch((error) => {
        // A failed notification must not lose the enquiry, which is already stored.
        console.error("[kea] pilot enquiry notification failed", error);
      });
    }

    return successState(
      "Thank you. Your enquiry has been recorded and we will respond to the email address you gave.",
    );
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "rate_limited") {
      return errorState("Too many enquiries from this connection. Please try again later.");
    }
    return toActionError(error);
  }
}
