"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
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

const CONVERT_OPTIONS = [
  { label: "Convert CNY", href: "/payments?tab=cny" },
  { label: "Convert USDT", href: "/payments?tab=usdt" },
];

// Reintroduces the popover pattern this codebase used once before for the same reason (merging
// several destinations behind one "Convert" trigger) — see git history at commit 573b19f for
// the original, removed in b2b9318 when Send to China was promoted to a primary button and this
// row briefly went flat. Now Convert (CNY) and Trade USDT collapse back into one trigger.
function ConvertAction() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-14 flex-col items-center gap-1.5 text-center text-[10px] font-medium text-foreground/70 transition-colors hover:text-primary-700 sm:w-18 sm:text-xs"
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-50 text-primary-600 transition-colors hover:bg-primary-100 sm:h-11 sm:w-11">
          <SwapIcon />
        </span>
        <span className="leading-tight">Convert</span>
      </button>

      {open && (
        <div className="absolute left-1/2 top-full z-20 mt-2 w-48 -translate-x-1/2 rounded-xl border border-foreground/10 bg-background p-1.5 shadow-lg">
          {CONVERT_OPTIONS.map((option) => (
            <Link
              key={option.href}
              href={option.href}
              onClick={() => setOpen(false)}
              className="block rounded-lg px-3 py-2 text-left text-sm font-medium text-foreground/80 hover:bg-primary-50 hover:text-primary-700"
            >
              {option.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function QuickActions() {
  return (
    <div className="flex flex-col gap-4">
      {/* Primary actions — the two most common things a user does */}
      <div className="flex gap-3">
        <Link href="/accounts" className="flex-1">
          {/* Overrides size="lg"'s default px-6/text-base — at 390px width that combo forces
              "Send to China" onto two uneven lines. !-prefixed to reliably win over the size
              classes regardless of Tailwind's compiled rule order. */}
          <Button
            className="w-full !gap-1.5 !whitespace-nowrap !px-3 !text-xs sm:!gap-2 sm:!px-6 sm:!text-base"
            size="lg"
          >
            <PlusIcon />
            Add Money
          </Button>
        </Link>
        <Link href="/pay-to-china" className="flex-1">
          <Button
            variant="secondary"
            className="w-full !gap-1.5 !whitespace-nowrap !px-3 !text-xs sm:!gap-2 sm:!px-6 sm:!text-base"
            size="lg"
          >
            <SendIcon />
            Send to China
          </Button>
        </Link>
      </div>

      {/* Secondary quick actions — Withdraw is one tap; Convert opens a small chooser since it
          covers two destinations (Convert CNY, Convert USDT). */}
      <div className="flex flex-nowrap justify-center gap-2 sm:gap-3">
        <Link href="/accounts">
          <span className="flex w-14 flex-col items-center gap-1.5 text-center text-[10px] font-medium text-foreground/70 transition-colors hover:text-primary-700 sm:w-18 sm:text-xs">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-50 text-primary-600 transition-colors hover:bg-primary-100 sm:h-11 sm:w-11">
              <WithdrawIcon />
            </span>
            <span className="leading-tight">Withdraw</span>
          </span>
        </Link>
        <ConvertAction />
      </div>
    </div>
  );
}
