import * as React from "react";

import { cn } from "@/lib/utils";

export function Section({
  className,
  children,
  muted = false,
  id,
}: {
  className?: string;
  children: React.ReactNode;
  muted?: boolean;
  id?: string;
}) {
  return (
    <section id={id} className={cn("section", muted && "bg-muted/40", className)}>
      <div className="container">{children}</div>
    </section>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "left",
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  align?: "left" | "center";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "max-w-2xl",
        align === "center" && "mx-auto text-center",
        className,
      )}
    >
      {eyebrow ? <p className="eyebrow mb-3">{eyebrow}</p> : null}
      <h2 className="font-display text-2xl font-semibold leading-tight tracking-tight text-foreground text-balance sm:text-3xl lg:text-[2.1rem]">
        {title}
      </h2>
      {description ? (
        <p className="mt-4 text-[0.975rem] leading-7 text-muted-foreground text-pretty">
          {description}
        </p>
      ) : null}
    </div>
  );
}

export function FeatureCard({
  icon: Icon,
  title,
  children,
  className,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "group rounded-xl border border-border bg-card p-6 shadow-subtle transition-shadow duration-200 hover:shadow-raised",
        className,
      )}
    >
      <span className="mb-4 flex size-10 items-center justify-center rounded-lg bg-plum-50 text-plum-700 transition-colors group-hover:bg-plum-100">
        <Icon className="size-5" />
      </span>
      <h3 className="mb-2 font-display text-base font-semibold text-foreground">{title}</h3>
      <div className="text-sm leading-relaxed text-muted-foreground">{children}</div>
    </div>
  );
}
