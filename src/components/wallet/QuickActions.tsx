"use client";

import Link from "next/link";

const ACTIONS = [
  { label: "Add Money", icon: "➕", href: null },
  { label: "Send", icon: "↗", href: null },
  { label: "Convert", icon: "⇄", href: null },
  { label: "Exchange RMB", icon: "🇨🇳", href: "/payments" },
  { label: "Exchange USDT", icon: "₮", href: null },
] as const;

export function QuickActions() {
  return (
    <div className="flex flex-wrap justify-center gap-3">
      {ACTIONS.map((action) => {
        const inner = (
          <span
            className={`flex w-18 flex-col items-center gap-1.5 text-center text-xs font-medium transition-colors ${
              action.href
                ? "text-foreground/70 hover:text-primary-700"
                : "cursor-not-allowed text-foreground/50"
            }`}
            title={action.href ? undefined : "Coming soon — Milestone 2"}
          >
            <span
              className={`flex h-11 w-11 items-center justify-center rounded-full text-lg transition-colors ${
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
