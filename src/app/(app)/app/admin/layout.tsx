import Link from "next/link";

import { NoAccess } from "@/components/app/no-access";
import { canAnywhere } from "@/lib/auth/context";
import { requireAuth } from "@/lib/auth/session";

const TABS = [
  { href: "/app/admin", label: "Overview" },
  { href: "/app/admin/staff", label: "Staff and roles" },
  { href: "/app/admin/facilities", label: "Facilities" },
  { href: "/app/admin/pathways", label: "Referral pathways" },
  { href: "/app/admin/policies", label: "Escalation policy" },
  { href: "/app/admin/audit", label: "Audit log" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireAuth();
  if (!canAnywhere(ctx, "user:manage")) {
    return (
      <NoAccess description="Administration is available to facility and organisation administrators. Your role does not include it." />
    );
  }

  return (
    <div>
      <nav
        className="mb-6 flex gap-1 overflow-x-auto border-b border-border pb-px no-scrollbar"
        aria-label="Administration"
      >
        {TABS.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className="whitespace-nowrap rounded-t-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {tab.label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
