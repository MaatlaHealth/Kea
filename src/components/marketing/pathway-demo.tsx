"use client";

import * as React from "react";
import {
  Building2,
  CalendarCheck,
  CheckCircle2,
  ClipboardList,
  Pause,
  Play,
  Send,
  Stethoscope,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Illustrative referral pathway.
 *
 * Every value shown here is fixed, fictional sample content used to explain the
 * workflow on the public website. It is not connected to the application
 * database and shows no patient data.
 */

type Stage = {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  actor: string;
  headline: string;
  detail: string;
  meta: { label: string; value: string }[];
  tone: "progress" | "positive";
};

const STAGES: Stage[] = [
  {
    key: "screening",
    label: "Screening",
    icon: ClipboardList,
    actor: "Primary health clinic",
    headline: "A midwife records a clinical concern at an antenatal visit",
    detail:
      "The visit is recorded against the patient record, with the reason for concern and the clinical observations that support it.",
    meta: [
      { label: "Facility", value: "Riverside Clinic (sample)" },
      { label: "Recorded by", value: "N. Molefe, midwife (sample)" },
    ],
    tone: "progress",
  },
  {
    key: "referral",
    label: "Referral",
    icon: Send,
    actor: "Primary health clinic",
    headline: "The referral is submitted to the receiving hospital",
    detail:
      "Kea allocates a reference, places the referral in the hospital queue and starts the acknowledgement clock set by the facility policy.",
    meta: [
      { label: "Reference", value: "KEA-4T8BWQ (sample)" },
      { label: "Priority", value: "Urgent" },
    ],
    tone: "progress",
  },
  {
    key: "acknowledgement",
    label: "Hospital acknowledgement",
    icon: Building2,
    actor: "District hospital",
    headline: "A clinician accepts the referral and books a date",
    detail:
      "The acknowledgement is timestamped and attributed. The referring clinic sees the change without having to telephone the hospital.",
    meta: [
      { label: "Acknowledged in", value: "3 hours 12 minutes" },
      { label: "Appointment", value: "Thursday, 09:30" },
    ],
    tone: "progress",
  },
  {
    key: "care",
    label: "Care received",
    icon: Stethoscope,
    actor: "District hospital",
    headline: "Attendance and the care outcome are recorded",
    detail:
      "If the patient does not arrive, a coordination task is opened instead and the outreach attempts are documented against the referral.",
    meta: [
      { label: "Attendance", value: "Recorded by hospital staff" },
      { label: "Outcome", value: "Documented for the referring clinic" },
    ],
    tone: "positive",
  },
  {
    key: "follow-up",
    label: "Follow-up",
    icon: CalendarCheck,
    actor: "Primary health clinic",
    headline: "The pathway is closed once follow-up is complete",
    detail:
      "Follow-up tasks stay open at the referring clinic until someone records what happened, so the loop is closed rather than assumed.",
    meta: [
      { label: "Follow-up", value: "Completed at the clinic" },
      { label: "Pathway", value: "Closed with a confirmed outcome" },
    ],
    tone: "positive",
  },
];

const ADVANCE_MS = 5200;

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

export function PathwayDemo() {
  const [index, setIndex] = React.useState(0);
  const [playRequested, setPlayRequested] = React.useState(true);

  // The motion preference is external state, read directly rather than
  // mirrored into React state by an effect.
  const reducedMotion = React.useSyncExternalStore(
    (notify) => {
      const query = window.matchMedia(REDUCED_MOTION_QUERY);
      query.addEventListener("change", notify);
      return () => query.removeEventListener("change", notify);
    },
    () => window.matchMedia(REDUCED_MOTION_QUERY).matches,
    () => false,
  );

  // Someone who asked for reduced motion never gets the automatic advance,
  // whatever the play control says.
  const playing = playRequested && !reducedMotion;
  const setPlaying = setPlayRequested;

  React.useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % STAGES.length);
    }, ADVANCE_MS);
    return () => window.clearInterval(timer);
  }, [playing]);

  const stage = STAGES[index];
  const Icon = stage.icon;

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-raised sm:p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Badge variant="warning">Illustrative workflow</Badge>
          <span className="text-xs text-muted-foreground">
            Sample content. Not live patient data.
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setPlaying((value) => !value)}
          aria-label={playing ? "Pause the illustration" : "Play the illustration"}
        >
          {playing ? <Pause /> : <Play />}
          {playing ? "Pause" : "Play"}
        </Button>
      </div>

      <ol className="mb-6 grid gap-2 sm:grid-cols-5" aria-label="Referral pathway stages">
        {STAGES.map((item, itemIndex) => {
          const isCurrent = itemIndex === index;
          const isPast = itemIndex < index;
          return (
            <li key={item.key}>
              <button
                type="button"
                onClick={() => {
                  setIndex(itemIndex);
                  setPlaying(false);
                }}
                aria-current={isCurrent ? "step" : undefined}
                className={cn(
                  "group flex w-full flex-col gap-2 rounded-lg border p-3 text-left transition-colors",
                  isCurrent
                    ? "border-plum-300 bg-plum-50"
                    : "border-border bg-background hover:border-plum-200",
                )}
              >
                <span className="flex items-center gap-2">
                  <span
                    className={cn(
                      "flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
                      isCurrent
                        ? "bg-plum-700 text-white"
                        : isPast
                          ? "bg-teal-600 text-white"
                          : "bg-muted text-muted-foreground",
                    )}
                  >
                    {isPast ? <CheckCircle2 className="size-3.5" /> : itemIndex + 1}
                  </span>
                  <span
                    className={cn(
                      "text-xs font-medium leading-tight",
                      isCurrent ? "text-plum-900" : "text-muted-foreground",
                    )}
                  >
                    {item.label}
                  </span>
                </span>
                <span
                  className={cn(
                    "h-1 w-full rounded-full",
                    isCurrent ? "bg-plum-300" : isPast ? "bg-teal-300" : "bg-muted",
                  )}
                  aria-hidden
                >
                  {isCurrent && playing && !reducedMotion ? (
                    <span
                      key={`${stage.key}-${index}`}
                      className="block h-1 rounded-full bg-plum-700"
                      style={{
                        animation: `pathway-progress ${ADVANCE_MS}ms linear forwards`,
                      }}
                    />
                  ) : null}
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      <div
        key={stage.key}
        className="animate-fade-up rounded-xl border border-border bg-background p-5"
      >
        <div className="flex flex-wrap items-start gap-4">
          <span
            className={cn(
              "flex size-11 shrink-0 items-center justify-center rounded-lg",
              stage.tone === "positive" ? "bg-teal-100 text-teal-700" : "bg-plum-100 text-plum-700",
            )}
          >
            <Icon className="size-5" />
          </span>
          <div className="min-w-0 flex-1 space-y-2">
            <p className="eyebrow">{stage.actor}</p>
            <h3 className="font-display text-base font-semibold leading-snug text-foreground sm:text-lg">
              {stage.headline}
            </h3>
            <p className="text-sm leading-relaxed text-muted-foreground">{stage.detail}</p>
          </div>
        </div>

        <dl className="mt-5 grid gap-3 border-t border-border pt-4 sm:grid-cols-2">
          {stage.meta.map((item) => (
            <div key={item.label}>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                {item.label}
              </dt>
              <dd className="mt-0.5 text-sm font-medium text-foreground">{item.value}</dd>
            </div>
          ))}
        </dl>
      </div>

      <style>{`@keyframes pathway-progress { from { width: 0% } to { width: 100% } }`}</style>
    </div>
  );
}
