import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { AlertTriangle, CheckCircle2, Info, OctagonAlert } from "lucide-react";

import { cn } from "@/lib/utils";

/* ---------------------------------- Alert --------------------------------- */

const alertVariants = cva("relative w-full rounded-lg border p-4 text-sm", {
  variants: {
    variant: {
      default: "border-border bg-muted/60 text-foreground",
      info: "border-teal-200 bg-teal-50 text-teal-900",
      success: "border-emerald-200 bg-emerald-50 text-emerald-900",
      warning: "border-amber-200 bg-amber-50 text-amber-900",
      destructive: "border-coral-200 bg-coral-50 text-coral-900",
    },
  },
  defaultVariants: { variant: "default" },
});

const ALERT_ICONS = {
  default: Info,
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  destructive: OctagonAlert,
} as const;

export interface AlertProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof alertVariants> {
  title?: string;
  icon?: boolean;
}

function Alert({ className, variant = "default", title, icon = true, children, ...props }: AlertProps) {
  const Icon = ALERT_ICONS[variant ?? "default"];
  return (
    <div role="status" className={cn(alertVariants({ variant }), className)} {...props}>
      <div className="flex gap-3">
        {icon ? <Icon className="mt-0.5 size-4 shrink-0" aria-hidden /> : null}
        <div className="min-w-0 flex-1">
          {title ? <p className="mb-1 font-semibold leading-tight">{title}</p> : null}
          {children ? <div className="leading-relaxed [&_p]:mb-2 [&_p:last-child]:mb-0">{children}</div> : null}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------- Skeleton -------------------------------- */

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("animate-pulse-soft rounded-md bg-muted", className)} {...props} />;
}

/* ------------------------------- EmptyState ------------------------------- */

export type EmptyStateProps = {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
};

function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-muted/30 px-6 py-12 text-center",
        className,
      )}
    >
      {Icon ? (
        <span className="flex size-11 items-center justify-center rounded-full bg-plum-100 text-plum-700">
          <Icon className="size-5" />
        </span>
      ) : null}
      <div className="space-y-1">
        <p className="font-display text-sm font-semibold text-foreground">{title}</p>
        {description ? (
          <p className="mx-auto max-w-sm text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

/* ------------------------------- ErrorState ------------------------------- */

function ErrorState({
  title = "Something went wrong",
  description,
  action,
}: {
  title?: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <Alert variant="destructive" title={title}>
      {description ? <p>{description}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </Alert>
  );
}

export { Alert, alertVariants, Skeleton, EmptyState, ErrorState };
