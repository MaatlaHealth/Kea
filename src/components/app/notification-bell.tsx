"use client";

import * as React from "react";
import Link from "next/link";
import { Bell, CheckCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/misc";
import {
  fetchNotifications,
  markAllNotificationsReadAction,
  type NotificationItem,
} from "@/server/actions/notifications";
import { formatRelative } from "@/lib/utils";

export function NotificationBell({ initialUnread }: { initialUnread: number }) {
  const [open, setOpen] = React.useState(false);
  const [unread, setUnread] = React.useState(initialUnread);
  const [items, setItems] = React.useState<NotificationItem[] | null>(null);
  const [loading, setLoading] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchNotifications();
      setItems(result.items);
      setUnread(result.unread);
    } finally {
      setLoading(false);
    }
  }, []);

  // Loading happens in the open event rather than in an effect watching the
  // open flag, so the fetch is tied to the interaction that caused it.
  const onOpenChange = React.useCallback(
    (next: boolean) => {
      setOpen(next);
      if (next) void load();
    },
    [load],
  );

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="relative rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        >
          <Bell className="size-5" />
          {unread > 0 ? (
            <span className="absolute right-1 top-1 flex min-w-4 items-center justify-center rounded-full bg-coral-700 px-1 text-[10px] font-semibold leading-4 text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[22rem] p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <p className="text-sm font-semibold">Notifications</p>
          {unread > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                await markAllNotificationsReadAction();
                await load();
              }}
            >
              <CheckCheck />
              Mark all read
            </Button>
          ) : null}
        </div>

        <div className="max-h-96 overflow-y-auto">
          {loading && !items ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">Loading</p>
          ) : null}

          {items && items.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              Nothing to catch up on.
            </p>
          ) : null}

          <ul className="divide-y divide-border">
            {items?.map((item) => {
              const content = (
                <div className="flex gap-3 px-4 py-3 transition-colors hover:bg-muted/60">
                  <span
                    className={`mt-1.5 size-2 shrink-0 rounded-full ${
                      item.readAt ? "bg-transparent" : "bg-teal-600"
                    }`}
                    aria-hidden
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium leading-snug text-foreground">{item.title}</p>
                    {item.body ? (
                      <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                        {item.body}
                      </p>
                    ) : null}
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {formatRelative(item.createdAt)}
                    </p>
                  </div>
                </div>
              );

              return (
                <li key={item.id}>
                  {item.referralId ? (
                    <Link href={`/app/referrals/${item.referralId}`} onClick={() => setOpen(false)}>
                      {content}
                    </Link>
                  ) : (
                    content
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </PopoverContent>
    </Popover>
  );
}
