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

interface SidebarProps {
  className?: string;
  onNavigate?: () => void;
}

export function Sidebar({ className = "", onNavigate }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside
      className={`flex h-full w-64 shrink-0 flex-col border-r border-border bg-surface px-4 py-6 ${className}`}
    >
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
              onClick={onNavigate}
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
          className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-danger-500 hover:bg-danger-50"
        >
          <svg
            className="h-4 w-4 shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M16 17l5-5-5-5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M21 12H9" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Log out
        </button>
      </form>
    </aside>
  );
}
