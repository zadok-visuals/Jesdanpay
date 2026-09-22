"use client";

import Link from "next/link";
import { Button } from "@/components/ui/Button";

function PlusIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 5v14M5 12h14" strokeLinecap="round" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M22 2 11 13" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M22 2 15 22l-4-9-9-4 20-7Z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function WithdrawIcon() {
  return (
    <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 5v14M5 12l7 7 7-7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SwapIcon() {
  return (
    <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M7 4v13M7 17l-3-3M7 17l3-3M17 20V7M17 7l-3 3M17 7l3 3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TradeIcon() {
  return (
    <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 12a9 9 0 0 1-15.5 6.3M3 12a9 9 0 0 1 15.5-6.3" strokeLinecap="round" />
      <path d="M3 16v-4h4M21 8v4h-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const SECONDARY_ACTIONS = [
  { label: "Withdraw", href: "/accounts", Icon: WithdrawIcon },
  { label: "Convert", href: "/payments?tab=cny", Icon: SwapIcon },
  { label: "Trade USDT", href: "/payments?tab=usdt", Icon: TradeIcon },
];

export function QuickActions() {
  return (
    <div className="flex flex-col gap-4">
      {/* Primary actions — the two most common things a user does */}
      <div className="flex gap-3">
        <Link href="/accounts" className="flex-1">
          <Button className="w-full" size="lg">
            <PlusIcon />
            Add Money
          </Button>
        </Link>
        <Link href="/pay-to-china" className="flex-1">
          <Button variant="secondary" className="w-full" size="lg">
            <SendIcon />
            Send to China
          </Button>
        </Link>
      </div>

      {/* Secondary quick actions — everything else, one tap away, no menu to open first */}
      <div className="flex flex-nowrap justify-center gap-2 sm:gap-3">
        {SECONDARY_ACTIONS.map(({ label, href, Icon }) => (
          <Link key={href} href={href}>
            <span className="flex w-14 flex-col items-center gap-1.5 text-center text-[10px] font-medium text-foreground/70 transition-colors hover:text-primary-700 sm:w-18 sm:text-xs">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-50 text-primary-600 transition-colors hover:bg-primary-100 sm:h-11 sm:w-11">
                <Icon />
              </span>
              <span className="leading-tight">{label}</span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
