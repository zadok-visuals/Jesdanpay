"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { AdminRole } from "@/lib/types/database";

const TABS = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/kyc", label: "KYC" },
  { href: "/admin/rmb", label: "RMB" },
  { href: "/admin/withdrawals", label: "Withdrawals" },
  { href: "/admin/rates", label: "Rates" },
  { href: "/admin/pnl", label: "PNL" },
  { href: "/admin/notifications", label: "Notifications" },
  { href: "/admin/chat", label: "Chat Support" },
] as const;

// role is passed down from admin/layout.tsx (already fetched there for requireAdminUser's own
// check) — Administrators only ever renders for a super_admin, never a plain admin, since that
// screen can add/remove admin access entirely.
export function AdminNavTabs({ role }: { role: AdminRole | null }) {
  const pathname = usePathname();
  const tabs = role === "super_admin" ? [...TABS, { href: "/admin/administrators", label: "Administrators" }] : TABS;

  return (
    <nav className="flex gap-1 overflow-x-auto border-b border-border bg-surface px-6 [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {tabs.map(({ href, label }) => {
        const active = href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={`shrink-0 whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium transition-colors ${
              active
                ? "border-primary-500 text-primary-700"
                : "border-transparent text-foreground/60 hover:text-foreground"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
