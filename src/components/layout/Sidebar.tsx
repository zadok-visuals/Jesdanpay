"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wordmark } from "@/components/layout/Wordmark";
import { logOut } from "@/lib/actions/auth";

const NAV_ITEMS = [
  { href: "/home", label: "Home" },
  { href: "/accounts", label: "Accounts" },
  { href: "/payments", label: "Payments" },
  { href: "/transactions", label: "Transactions" },
  { href: "/cards", label: "Cards" },
  { href: "/reports", label: "Reports" },
] as const;

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-60 flex-col border-r border-border bg-surface px-4 py-6">
      <div className="mb-8 px-2">
        <Wordmark />
      </div>

      <nav className="flex flex-1 flex-col gap-1">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                active
                  ? "bg-primary-50 text-primary-700"
                  : "text-foreground/60 hover:bg-black/[.04] hover:text-foreground"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <form action={logOut}>
        <button
          type="submit"
          className="w-full rounded-xl px-3 py-2.5 text-left text-sm font-medium text-foreground/60 hover:bg-black/[.04] hover:text-foreground"
        >
          Log out
        </button>
      </form>
    </aside>
  );
}
