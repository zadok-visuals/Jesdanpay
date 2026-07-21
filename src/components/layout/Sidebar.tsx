"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wordmark } from "@/components/layout/Wordmark";
import { logOut } from "@/lib/actions/auth";
import {
  AccountsIcon,
  CardsIcon,
  HomeIcon,
  PaymentsIcon,
  ReportsIcon,
  TransactionsIcon,
} from "@/components/layout/NavIcons";

const NAV_ITEMS = [
  { href: "/home", label: "Home", Icon: HomeIcon },
  { href: "/accounts", label: "Accounts", Icon: AccountsIcon },
  { href: "/payments", label: "Payments", Icon: PaymentsIcon },
  { href: "/transactions", label: "Transactions", Icon: TransactionsIcon },
  { href: "/cards", label: "Cards", Icon: CardsIcon },
  { href: "/reports", label: "Reports", Icon: ReportsIcon },
] as const;

interface SidebarProps {
  className?: string;
  onNavigate?: () => void;
}

export function Sidebar({ className = "", onNavigate }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside
      className={`flex h-full w-64 shrink-0 flex-col border-r border-border bg-surface ${className}`}
    >
      <div className="flex h-16 shrink-0 items-center border-b border-border px-6">
        <Wordmark />
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-4 py-6">
        {NAV_ITEMS.map(({ href, label, Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                active
                  ? "bg-primary-50 text-primary-700"
                  : "text-foreground/60 hover:bg-primary-50/70 hover:text-primary-700"
              }`}
            >
              <Icon className="shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="px-4 pb-6">
        <form action={logOut}>
          <button
            type="submit"
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-danger-500 hover:bg-danger-50"
          >
            <svg
              className="h-[18px] w-[18px] shrink-0"
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
      </div>
    </aside>
  );
}
