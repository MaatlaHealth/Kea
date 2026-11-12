"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, LogOut, Menu, UserRound, X } from "lucide-react";

import { Logo } from "@/components/brand/logo";
import { NotificationBell } from "@/components/app/notification-bell";
import { ThemeToggle } from "@/components/theme";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ALWAYS_VISIBLE, NAV_GROUPS } from "./app-nav";
import { signOutAction } from "@/server/actions/auth";
import { cn, initials } from "@/lib/utils";

export type ShellUser = {
  fullName: string;
  email: string;
  roleLabel: string;
  organisationName: string;
  facilityCount: number;
  isDemonstration: boolean;
};

export function AppShell({
  user,
  allowedHrefs,
  unreadCount,
  children,
}: {
  user: ShellUser;
  allowedHrefs: string[];
  unreadCount: number;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const allowed = React.useMemo(() => new Set(allowedHrefs), [allowedHrefs]);

  // The drawer belongs to the route it was opened on, so navigating closes it
  // without an effect that resets state after the fact.
  const [openedOn, setOpenedOn] = React.useState<string | null>(null);
  const mobileOpen = openedOn === pathname;
  const setMobileOpen = (next: boolean) => setOpenedOn(next ? pathname : null);

  const groups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => allowed.has(item.href) || ALWAYS_VISIBLE.has(item.href)),
  })).filter((group) => group.items.length > 0);

  const navigation = (
    <nav className="flex flex-col gap-6 px-3 py-4" aria-label="Application">
      {groups.map((group) => (
        <div key={group.heading}>
          <p className="mb-1.5 px-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            {group.heading}
          </p>
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const Icon = item.icon;
              const active =
                item.href === "/app" ? pathname === "/app" : pathname.startsWith(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    title={item.description}
                    className={cn(
                      "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors",
                      active
                        ? "bg-plum-100 text-plum-900"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <Icon className="size-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  return (
    <div className="flex min-h-screen bg-muted/30">
      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-card lg:flex">
        <div className="flex h-16 items-center border-b border-border px-4">
          <Logo variant="wordmark" className="h-7" href="/app" priority />
        </div>
        <div className="flex-1 overflow-y-auto">{navigation}</div>
        <div className="border-t border-border p-3">
          <p className="truncate px-2 text-xs text-muted-foreground">{user.organisationName}</p>
          <p className="px-2 text-xs text-muted-foreground">
            {user.facilityCount === 1 ? "1 facility" : `${user.facilityCount} facilities`}
          </p>
        </div>
      </aside>

      {/* Mobile drawer */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-plum-950/40"
            onClick={() => setMobileOpen(false)}
            aria-hidden
          />
          <div className="absolute inset-y-0 left-0 flex w-72 flex-col bg-card shadow-float">
            <div className="flex h-16 items-center justify-between border-b border-border px-4">
              <Logo variant="wordmark" className="h-7" href="/app" />
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="rounded-md p-2 text-muted-foreground hover:bg-muted"
                aria-label="Close menu"
              >
                <X className="size-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">{navigation}</div>
          </div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-16 items-center gap-3 border-b border-border bg-card/95 px-4 backdrop-blur sm:px-6">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="rounded-md p-2 text-muted-foreground hover:bg-muted lg:hidden"
            aria-label="Open menu"
          >
            <Menu className="size-5" />
          </button>

          <div className="min-w-0 flex-1">
            {user.isDemonstration ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-900">
                <span className="size-1.5 rounded-full bg-amber-500" aria-hidden />
                Demonstration environment, synthetic records only
              </span>
            ) : null}
          </div>

          <ThemeToggle />
          <NotificationBell initialUnread={unreadCount} />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="flex size-8 items-center justify-center rounded-full bg-plum-100 text-xs font-semibold text-plum-800">
                  {initials(user.fullName)}
                </span>
                <span className="hidden text-left sm:block">
                  <span className="block max-w-[11rem] truncate font-medium leading-tight">
                    {user.fullName}
                  </span>
                  <span className="block max-w-[11rem] truncate text-xs leading-tight text-muted-foreground">
                    {user.roleLabel}
                  </span>
                </span>
                <ChevronDown className="size-4 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuLabel>Signed in as</DropdownMenuLabel>
              <div className="px-2 pb-2">
                <p className="truncate text-sm font-medium">{user.fullName}</p>
                <p className="truncate text-xs text-muted-foreground">{user.email}</p>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/app/settings">
                  <UserRound />
                  My account
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <form action={signOutAction}>
                <button
                  type="submit"
                  className="flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-destructive transition-colors hover:bg-coral-50"
                >
                  <LogOut className="size-4" />
                  Sign out
                </button>
              </form>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        <main id="main" className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  breadcrumb,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  breadcrumb?: React.ReactNode;
}) {
  return (
    <div className="mb-6">
      {breadcrumb ? <div className="mb-2">{breadcrumb}</div> : null}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            {title}
          </h1>
          {description ? (
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}

export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
    >
      <span aria-hidden>&larr;</span>
      {children}
    </Link>
  );
}
