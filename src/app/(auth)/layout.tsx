import Link from "next/link";

import { Logo } from "@/components/brand/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col bg-background">
      <div className="pointer-events-none absolute inset-0 grid-backdrop" aria-hidden />
      <header className="relative border-b border-border/60">
        <div className="container flex h-16 items-center justify-between">
          <Logo variant="wordmark" className="h-8" priority />
          <Link
            href="/"
            className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Back to website
          </Link>
        </div>
      </header>

      <main id="main" className="relative flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">{children}</div>
      </main>

      <footer className="relative border-t border-border/60 py-6">
        <div className="container flex flex-col gap-2 text-xs text-muted-foreground sm:flex-row sm:justify-between">
          <p>Kea is for authorised healthcare staff. Access is logged.</p>
          <div className="flex gap-4">
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
