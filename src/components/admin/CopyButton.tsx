"use client";

import { useState, type ReactNode } from "react";

const RESET_DELAY_MS = 1500;

// The admin pastes these details into an external provider by hand to process a payment, often
// from a phone — this is the one UI affordance that makes that bearable. Never throws: a blocked
// clipboard should show "Copy failed", not crash the page.
async function copyText(value: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
    throw new Error("Clipboard API unavailable");
  } catch {
    // Fallback for older/mobile browsers without the async Clipboard API.
    try {
      const textarea = document.createElement("textarea");
      textarea.value = value;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(textarea);
      return ok;
    } catch {
      return false;
    }
  }
}

export function CopyButton({
  value,
  label,
  variant = "inline",
  children,
}: {
  value: string;
  label?: string;
  variant?: "inline" | "block";
  children?: ReactNode;
}) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");

  async function handleClick() {
    const ok = await copyText(value);
    setStatus(ok ? "copied" : "failed");
    setTimeout(() => setStatus("idle"), RESET_DELAY_MS);
  }

  const text = status === "copied" ? "Copied" : status === "failed" ? "Copy failed" : children ?? "Copy";

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={label ? `Copy ${label}` : "Copy"}
      className={
        variant === "block"
          ? "inline-flex min-h-9 w-full items-center justify-center gap-1.5 rounded-xl bg-primary-500 px-4 text-sm font-medium text-white transition-colors hover:bg-primary-600 sm:w-auto"
          : "inline-flex min-h-9 shrink-0 items-center justify-center rounded-lg border border-border bg-white px-2.5 text-xs font-medium text-foreground/70 transition-colors hover:border-primary-300 hover:text-primary-700"
      }
    >
      {text}
    </button>
  );
}
