import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <Logo className="mb-8 h-9" />
      <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">404</p>
      <h1 className="mt-2 font-display text-2xl font-semibold text-foreground">
        That page is not available
      </h1>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
        The page may have moved, or the record may not be available to your account. Records you
        have no care relationship with are reported as not found.
      </p>
      <div className="mt-8 flex gap-3">
        <Button asChild>
          <Link href="/app">Go to the dashboard</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/">Back to the website</Link>
        </Button>
      </div>
    </div>
  );
}
