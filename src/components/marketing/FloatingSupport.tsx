"use client";

import { useEffect, useRef, useState } from "react";
import { LinkButton } from "@/components/ui/LinkButton";
import { HELLO_EMAIL } from "@/lib/site";

// Logged-out visitors have no support_messages thread to open (it's per-user, RLS-scoped — see
// ChatSupportButton.tsx), so clicking this never opens the real chat panel. Instead it opens a
// small card nudging them to sign in or create an account, with an email fallback for anyone who
// doesn't want to do either. Mounted only on the logged-out landing page (src/app/page.tsx
// redirects a signed-in user to /home before LandingPage ever renders), so no session check is
// needed here.
export function FloatingSupport() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div
      ref={containerRef}
      className="fixed z-40 flex flex-col items-end gap-3"
      style={{
        bottom: "calc(env(safe-area-inset-bottom, 0px) + 1.25rem)",
        right: "calc(env(safe-area-inset-right, 0px) + 1.25rem)",
      }}
    >
      {open && (
        <div className="animate-support-pop-in w-64 rounded-2xl border border-border bg-surface p-4 shadow-xl sm:w-72">
          <p className="text-sm font-semibold text-foreground">Need help?</p>
          <p className="mt-1 text-sm text-foreground/60">
            Sign in to chat with our support team, we reply right here.
          </p>
          <div className="mt-3 flex flex-col items-stretch gap-2">
            <LinkButton href="/login" size="sm" className="w-full justify-center">
              Sign in
            </LinkButton>
            <a
              href="/signup"
              className="text-center text-sm font-medium text-primary-600 hover:underline"
            >
              Create account
            </a>
            <a
              href={`mailto:${HELLO_EMAIL}`}
              className="mt-1 text-center text-xs text-foreground/50 hover:underline"
            >
              Email us
            </a>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Need help? Chat with support"
        aria-expanded={open}
        className="animate-support-pop-in relative flex h-14 w-14 items-center justify-center rounded-full bg-primary-500 text-white shadow-lg transition-transform hover:scale-105"
      >
        <span
          className="animate-support-pulse-ring absolute inset-0 rounded-full bg-primary-500"
          aria-hidden="true"
        />
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="relative"
          aria-hidden="true"
        >
          <path d="M4 14v-2a8 8 0 0 1 16 0v2" strokeLinecap="round" strokeLinejoin="round" />
          <rect x="2.5" y="14" width="4" height="6" rx="1.5" />
          <rect x="17.5" y="14" width="4" height="6" rx="1.5" />
          <path d="M19.5 20v.5a3 3 0 0 1-3 3H13" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  );
}
