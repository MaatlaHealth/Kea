import {
  BarChart3,
  Building2,
  CalendarDays,
  Inbox,
  LayoutDashboard,
  LifeBuoy,
  MessageSquare,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";

import type { Permission } from "@/lib/auth/permissions";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** The permission a user must hold somewhere for this item to appear. */
  permission: Permission;
  description: string;
};

export type NavGroup = {
  heading: string;
  items: NavItem[];
};

export const NAV_GROUPS: NavGroup[] = [
  {
    heading: "Work",
    items: [
      {
        href: "/app",
        label: "Dashboard",
        icon: LayoutDashboard,
        permission: "referral:read",
        description: "Your overview for today",
      },
      {
        href: "/app/inbox",
        label: "Incoming referrals",
        icon: Inbox,
        permission: "referral:read",
        description: "Referrals sent to your facility",
      },
      {
        href: "/app/referrals",
        label: "All referrals",
        icon: LifeBuoy,
        permission: "referral:read",
        description: "Search and filter every referral you can see",
      },
      {
        href: "/app/appointments",
        label: "Appointments",
        icon: CalendarDays,
        permission: "referral:read",
        description: "Booked visits at your facility",
      },
      {
        href: "/app/coordination",
        label: "Coordination",
        icon: LifeBuoy,
        permission: "task:read",
        description: "Exceptions that need a person",
      },
    ],
  },
  {
    heading: "Records",
    items: [
      {
        href: "/app/patients",
        label: "Patients",
        icon: Users,
        permission: "patient:read",
        description: "Patients registered at your facility",
      },
      {
        href: "/app/messages",
        label: "Messages",
        icon: MessageSquare,
        permission: "message:read",
        description: "Messages sent to patients and their delivery status",
      },
    ],
  },
  {
    heading: "Insight",
    items: [
      {
        href: "/app/analytics",
        label: "Analytics",
        icon: BarChart3,
        permission: "analytics:read",
        description: "Referral performance across facilities",
      },
    ],
  },
  {
    heading: "Administration",
    items: [
      {
        href: "/app/admin",
        label: "Organisation",
        icon: Building2,
        permission: "user:manage",
        description: "Facilities, staff, pathways and policies",
      },
      {
        href: "/app/settings",
        label: "My account",
        icon: Settings,
        permission: "referral:read",
        description: "Password, multifactor authentication and sessions",
      },
    ],
  },
];

/** Items always visible to any signed in user, regardless of permissions. */
export const ALWAYS_VISIBLE = new Set(["/app/settings"]);
