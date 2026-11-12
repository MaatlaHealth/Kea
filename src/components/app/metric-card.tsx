import Link from "next/link";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export function MetricCard({
  label,
  value,
  hint,
  icon: Icon,
  href,
  tone = "neutral",
}: {
  label: string;
  value: number | string;
  hint?: string;
  icon?: LucideIcon;
  href?: string;
  tone?: "neutral" | "attention" | "positive";
}) {
  const body = (
    <div
      className={cn(
        "group h-full rounded-xl border bg-card p-4 shadow-subtle transition-shadow",
        href && "hover:shadow-raised",
        tone === "attention" ? "border-amber-200" : "border-border",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        {Icon ? (
          <Icon
            className={cn(
              "size-4 shrink-0",
              tone === "attention"
                ? "text-amber-600"
                : tone === "positive"
                  ? "text-teal-600"
                  : "text-muted-foreground",
            )}
          />
        ) : null}
      </div>
      <p className="mt-2 font-display text-2xl font-semibold tabular-nums text-foreground">
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{hint}</p> : null}
    </div>
  );

  if (!href) return body;
  return (
    <Link href={href} className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      {body}
    </Link>
  );
}
