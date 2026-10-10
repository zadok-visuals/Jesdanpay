"use client";

import type { ReactNode } from "react";

interface TabsProps<T extends string> {
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  // Optional per-option badge (e.g. a "Coming soon" pill) — rendered next to the label, never
  // changes tab selection/click behavior, so existing callers (TotalBalanceCard.tsx) are
  // unaffected by simply not passing it.
  renderBadge?: (option: T) => ReactNode;
}

export function Tabs<T extends string>({ options, value, onChange, renderBadge }: TabsProps<T>) {
  return (
    <div className="flex max-w-full items-center gap-1 overflow-x-auto rounded-xl bg-black/[.04] p-1 [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          className={`flex shrink-0 items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
            option === value
              ? "bg-white text-primary-700"
              : "text-foreground/60 hover:text-foreground"
          }`}
        >
          {option}
          {renderBadge?.(option)}
        </button>
      ))}
    </div>
  );
}
