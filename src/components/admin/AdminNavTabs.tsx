"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Pill } from "@/components/ui/Pill";
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
// screen can add/remove admin access entirely. chatUnreadCount is likewise fetched once in
// admin/layout.tsx (getUnreadSupportMessageCountForAdmin) rather than here, since this is a client
// component and that count needs the service-role client.
export function AdminNavTabs({ role, chatUnreadCount = 0 }: { role: AdminRole | null; chatUnreadCount?: number }) {
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
            className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium transition-colors ${
              active
                ? "border-primary-500 text-primary-700"
                : "border-transparent text-foreground/60 hover:text-foreground"
            }`}
          >
            {label}
            {href === "/admin/chat" && chatUnreadCount > 0 && (
              <Pill tone="warning">{chatUnreadCount > 9 ? "9+" : chatUnreadCount}</Pill>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
