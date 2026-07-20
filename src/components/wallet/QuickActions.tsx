"use client";

const ACTIONS = [
  { label: "Add Money", icon: "➕" },
  { label: "Send", icon: "↗" },
  { label: "Convert", icon: "⇄" },
  { label: "Exchange RMB", icon: "🇨🇳" },
  { label: "Exchange USDT", icon: "₮" },
] as const;

export function QuickActions() {
  return (
    <div className="flex gap-5">
      {ACTIONS.map((action) => (
        <button
          key={action.label}
          type="button"
          disabled
          title="Coming soon — Milestone 2"
          className="flex flex-col items-center gap-1.5 text-xs font-medium text-foreground/50 disabled:cursor-not-allowed"
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary-50 text-lg text-primary-600">
            {action.icon}
          </span>
          {action.label}
        </button>
      ))}
    </div>
  );
}
