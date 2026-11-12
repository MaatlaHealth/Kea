import { Check } from "lucide-react";

import type { ReferralStatus } from "@/db/schema";
import { EXCEPTION_STATUSES, PATHWAY_STEPS, STATUS_LABELS, pathwayProgress } from "@/lib/referrals/state-machine";
import { cn } from "@/lib/utils";

/**
 * Shows where a referral has reached along the expected pathway. Exception
 * states are highlighted rather than hidden, because an exception is a real
 * position in the pathway and not a failure to display.
 */
export function PathwayProgress({ status }: { status: ReferralStatus }) {
  const reached = pathwayProgress(status);
  const isException = EXCEPTION_STATUSES.includes(status);

  return (
    <div>
      <ol className="flex flex-wrap items-center gap-x-1 gap-y-2">
        {PATHWAY_STEPS.map((step, index) => {
          const position = index + 1;
          const complete = reached > position;
          const current = reached === position;
          return (
            <li key={step} className="flex items-center gap-1">
              <span
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
                  complete
                    ? "bg-teal-100 text-teal-800"
                    : current
                      ? isException
                        ? "bg-amber-100 text-amber-900"
                        : "bg-plum-100 text-plum-900"
                      : "bg-muted text-muted-foreground",
                )}
              >
                {complete ? <Check className="size-3" /> : null}
                {STATUS_LABELS[step]}
              </span>
              {index < PATHWAY_STEPS.length - 1 ? (
                <span
                  className={cn(
                    "h-px w-4 shrink-0",
                    complete ? "bg-teal-300" : "bg-border",
                  )}
                  aria-hidden
                />
              ) : null}
            </li>
          );
        })}
      </ol>
      {isException ? (
        <p className="mt-2 text-xs text-amber-800">
          This referral is currently in the {STATUS_LABELS[status].toLowerCase()} state and needs a
          recorded resolution before it can progress.
        </p>
      ) : null}
    </div>
  );
}
