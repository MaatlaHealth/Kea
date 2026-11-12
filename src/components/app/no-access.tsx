import Link from "next/link";
import { ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Shown when a signed in user opens a screen their role does not include.
 *
 * This is a normal outcome, not an error: a programme analyst following a
 * bookmarked link to the patient list should get a clear explanation rather
 * than a generic failure page. It never says whether any particular record
 * exists, only what this role can do.
 */
export function NoAccess({
  title = "Not available to your role",
  description,
  backHref = "/app",
  backLabel = "Go to the dashboard",
}: {
  title?: string;
  description: string;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <Card className="mx-auto max-w-xl">
      <CardContent className="flex flex-col items-center gap-4 p-10 text-center">
        <span className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <ShieldAlert className="size-5" />
        </span>
        <div className="space-y-1.5">
          <h1 className="font-display text-lg font-semibold text-foreground">{title}</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
        </div>
        <Button variant="outline" asChild>
          <Link href={backHref}>{backLabel}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
