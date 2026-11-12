import Link from "next/link";
import { Github } from "lucide-react";

import { Logo } from "@/components/brand/logo";
import { REPOSITORY_URL } from "@/lib/site";

const COLUMNS = [
  {
    heading: "Product",
    links: [
      { href: "/how-it-works", label: "How it works" },
      { href: "/for-providers", label: "For healthcare providers" },
      { href: "/technology", label: "Technology and open source" },
      { href: "/request-a-pilot", label: "Request a pilot" },
    ],
  },
  {
    heading: "Access",
    links: [
      { href: "/sign-in", label: "Staff sign in" },
      { href: "/portal/sign-in", label: "Patient portal" },
    ],
  },
  {
    heading: "Legal",
    links: [
      { href: "/privacy", label: "Privacy policy" },
      { href: "/terms", label: "Terms of use" },
      { href: "/data-governance", label: "Data governance" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-muted/40">
      <div className="container py-12 lg:py-16">
        <div className="grid gap-10 md:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div className="space-y-4">
            <Logo className="h-9" />
            <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
              Kea connects clinics, hospitals and patients so maternal healthcare referrals can be
              tracked, coordinated and followed through.
            </p>
            <a
              href={REPOSITORY_URL}
              className="inline-flex items-center gap-2 text-sm font-medium text-plum-700 hover:text-plum-900"
              rel="noreferrer noopener"
              target="_blank"
            >
              <Github className="size-4" />
              Source code
            </a>
          </div>

          {COLUMNS.map((column) => (
            <div key={column.heading}>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-foreground">
                {column.heading}
              </h2>
              <ul className="space-y-2.5">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-border pt-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>Kea is open source software released under the Apache License 2.0.</p>
          <p>
            Kea is not a medical device and does not provide clinical advice. Clinical decisions
            remain with qualified healthcare professionals.
          </p>
        </div>
      </div>
    </footer>
  );
}
