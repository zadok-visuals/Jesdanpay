"use client";

import { useRef } from "react";

function formatIntegerWithCommas(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

// Formats a raw numeric string (digits + optional single '.') for display with thousands
// separators, capping decimals at 2 places. A trailing "." or trailing zeros are left alone so
// the user can keep typing "1234." or "1234.50" without characters being eaten mid-entry.
export function formatAmountDisplay(raw: string): string {
  const cleaned = raw.replace(/[^\d.]/g, "");
  const firstDot = cleaned.indexOf(".");
  if (firstDot === -1) return formatIntegerWithCommas(cleaned);

  const intPart = cleaned.slice(0, firstDot);
  const decPart = cleaned.slice(firstDot + 1).replace(/\./g, "").slice(0, 2);
  return `${formatIntegerWithCommas(intPart)}.${decPart}`;
}

// Strips commas back out to a plain numeric string safe for Number()/form submission.
export function parseAmountValue(display: string): string {
  return display.replace(/,/g, "");
}

// Comma-formatted amount entry with a currency-symbol prefix. `value`/`onChange` always deal
// in the raw, unformatted numeric string — only the on-screen display carries commas — so
// callers don't need to change any validation or submission logic. Uses a plain text input
// rather than type="number" because browsers reject commas in a number input's value outright.
export function AmountInput({
  id,
  symbol,
  value,
  onChange,
  placeholder = "0.00",
  className = "",
}: {
  id: string;
  symbol: string;
  value: string;
  onChange: (rawValue: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const formatted = e.target.value;
    const cursorPos = e.target.selectionStart ?? formatted.length;
    // Count digits/decimal-point characters to the left of the cursor in the OLD formatted
    // string, so the cursor can be restored to an equivalent position once commas shift.
    const markersBeforeCursor = formatted.slice(0, cursorPos).replace(/[^\d.]/g, "").length;

    const stripped = formatted.replace(/[^\d.]/g, "");
    const firstDot = stripped.indexOf(".");
    const rawValue =
      firstDot === -1 ? stripped : stripped.slice(0, firstDot + 1) + stripped.slice(firstDot + 1).replace(/\./g, "");

    onChange(rawValue);

    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      const newFormatted = formatAmountDisplay(rawValue);
      let seen = 0;
      let newPos = newFormatted.length;
      for (let i = 0; i < newFormatted.length; i++) {
        if (/[\d.]/.test(newFormatted[i])) seen++;
        if (seen === markersBeforeCursor) {
          newPos = i + 1;
          break;
        }
      }
      el.setSelectionRange(newPos, newPos);
    });
  }

  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-medium text-foreground/50">
        {symbol}
      </span>
      <input
        ref={inputRef}
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={formatAmountDisplay(value)}
        onChange={handleChange}
        placeholder={placeholder}
        className={`h-11 w-full rounded-xl border border-border bg-white pl-14 pr-3.5 text-base outline-none transition-colors focus:border-primary-400 sm:text-sm ${className}`}
      />
    </div>
  );
}
