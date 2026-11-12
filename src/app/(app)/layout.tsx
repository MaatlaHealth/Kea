import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/app/app-shell";
import { NAV_GROUPS } from "@/components/app/app-nav";
import { db } from "@/db";
import { organisations } from "@/db/schema";
import { can, highestRole, primaryOrganisationId } from "@/lib/auth/context";
import { ROLE_LABELS } from "@/lib/auth/permissions";
import { getAuthContext } from "@/lib/auth/session";
import { unreadNotificationCount } from "@/lib/notifications";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/sign-in?redirectTo=/app");

  const organisationId = primaryOrganisationId(ctx);
  const [organisation] = organisationId
    ? await db
        .select({
          name: organisations.name,
          environment: organisations.environment,
        })
        .from(organisations)
        .where(eq(organisations.id, organisationId))
        .limit(1)
    : [];

  // Navigation is filtered by permission, but every destination also enforces
  // its own check on the server. Hiding a link is never the control.
  const allowedHrefs = NAV_GROUPS.flatMap((group) => group.items)
    .filter((item) =>
      ctx.facilities.some((facility) => can(ctx, item.permission, { facilityId: facility.id })) ||
      can(ctx, item.permission, { organisationId }),
    )
    .map((item) => item.href);

  const unread = await unreadNotificationCount(ctx.userId);
  const role = highestRole(ctx);

  return (
    <AppShell
      user={{
        fullName: ctx.fullName,
        email: ctx.email,
        roleLabel: role ? ROLE_LABELS[role] : "No role assigned",
        organisationName: organisation?.name ?? "No organisation",
        facilityCount: ctx.facilities.length,
        isDemonstration: organisation?.environment === "demonstration",
      }}
      allowedHrefs={allowedHrefs}
      unreadCount={unread}
    >
      {children}
    </AppShell>
  );
}
