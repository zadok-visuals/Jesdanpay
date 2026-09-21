"use client";

import Link from "next/link";
import type { ReactNode } from "react";

function PlusIcon() {
  return (
    <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 5v14M5 12h14" strokeLinecap="round" />
    </svg>
  );
}

function CurrencyBadge({ symbol }: { symbol: string }) {
  return <span className="text-[15px] font-bold leading-none">{symbol}</span>;
}

// "Send" and "Convert" were dropped from here — once given real destinations they were exact
// duplicates of "Exchange RMB" and "Exchange USDT" below (the only send/convert features that
// actually exist), so having both was confusing rather than useful.
const ACTIONS: { label: string; icon: ReactNode; href: string }[] = [
  { label: "Add Money", icon: <PlusIcon />, href: "/accounts" },
  { label: "Exchange RMB", icon: <CurrencyBadge symbol="¥" />, href: "/payments" },
  { label: "Exchange USDT", icon: <CurrencyBadge symbol="₮" />, href: "/payments?tab=usdt" },
];

export function QuickActions() {
  return (
    <div className="flex flex-nowrap justify-center gap-2 sm:gap-3">
      {ACTIONS.map((action) => (
        <Link key={action.label} href={action.href}>
          <span className="flex w-14 flex-col items-center gap-1.5 text-center text-[10px] font-medium text-foreground/70 transition-colors hover:text-primary-700 sm:w-18 sm:text-xs">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-50 text-primary-600 transition-colors hover:bg-primary-100 sm:h-11 sm:w-11">
              {action.icon}
            </span>
            <span className="leading-tight">{action.label}</span>
          </span>
        </Link>
      ))}
    </div>
  );
}
