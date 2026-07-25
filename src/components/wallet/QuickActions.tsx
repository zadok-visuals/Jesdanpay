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

function SendIcon() {
  return (
    <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M7 17 17 7M9 7h8v8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ConvertIcon() {
  return (
    <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M6 8h13l-3.5-3.5M18 16H5l3.5 3.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CurrencyBadge({ symbol }: { symbol: string }) {
  return <span className="text-[15px] font-bold leading-none">{symbol}</span>;
}

const ACTIONS: { label: string; icon: ReactNode; href: string | null }[] = [
  { label: "Add Money", icon: <PlusIcon />, href: null },
  { label: "Send", icon: <SendIcon />, href: null },
  { label: "Convert", icon: <ConvertIcon />, href: null },
  { label: "Exchange RMB", icon: <CurrencyBadge symbol="¥" />, href: "/payments" },
  { label: "Exchange USDT", icon: <CurrencyBadge symbol="₮" />, href: null },
];

export function QuickActions() {
  return (
    <div className="flex flex-nowrap justify-center gap-2 sm:gap-3">
      {ACTIONS.map((action) => {
        const inner = (
          <span
            className={`flex w-14 flex-col items-center gap-1.5 text-center text-[10px] font-medium transition-colors sm:w-18 sm:text-xs ${
              action.href
                ? "text-foreground/70 hover:text-primary-700"
                : "cursor-not-allowed text-foreground/50"
            }`}
            title={action.href ? undefined : "Coming soon — Milestone 2"}
          >
            <span
              className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors sm:h-11 sm:w-11 ${
                action.href
                  ? "bg-primary-50 text-primary-600 hover:bg-primary-100"
                  : "bg-primary-50 text-primary-600 opacity-50"
              }`}
            >
              {action.icon}
            </span>
            <span className="leading-tight">{action.label}</span>
          </span>
        );

        if (action.href) {
          return (
            <Link key={action.label} href={action.href}>
              {inner}
            </Link>
          );
        }

        return (
          <button
            key={action.label}
            type="button"
            disabled
            title="Coming soon — Milestone 2"
            className="appearance-none"
          >
            {inner}
          </button>
        );
      })}
    </div>
  );
}
