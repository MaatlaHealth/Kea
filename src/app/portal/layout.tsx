import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { getPatientSession } from "@/lib/auth/patient-session";
import { portalSignOutAction } from "@/server/actions/portal";

export const dynamic = "force-dynamic";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const patient = await getPatientSession();

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex h-14 w-full max-w-lg items-center justify-between px-4">
          <Logo variant="wordmark" className="h-7" href={patient ? "/portal" : "/"} priority />
          {patient ? (
            <form action={portalSignOutAction}>
              <button
                type="submit"
                className="rounded-md px-2 py-1 text-sm font-medium text-muted-foreground hover:text-foreground"
              >
                Sign out
              </button>
            </form>
          ) : null}
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-lg flex-1 px-4 py-6">
        {children}
      </main>

      <footer className="border-t border-border py-5">
        <div className="mx-auto w-full max-w-lg px-4 text-xs leading-relaxed text-muted-foreground">
          <p>
            Kea is used by your healthcare facility to keep track of referrals. It does not give
            medical advice. If you are unwell or worried, contact your clinic or go to your nearest
            healthcare facility.
          </p>
          <div className="mt-3 flex gap-4">
            <Link href="/privacy" className="hover:text-foreground">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-foreground">
              Terms
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
