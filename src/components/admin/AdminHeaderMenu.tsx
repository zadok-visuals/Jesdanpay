"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { adminLogOut } from "@/lib/actions/admin";
import { LogoutButton } from "@/components/auth/LogoutButton";

// Same dropdown pattern as NotificationBell.tsx — useState + a containerRef/mousedown-outside
// effect to close it, absolutely positioned panel off a relative wrapper. Only shown below `sm`
// (admin/layout.tsx keeps the desktop row hidden at that breakpoint instead) since the three
// header actions collide with AdminNavTabs on narrow screens otherwise.
export function AdminHeaderMenu() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative sm:hidden" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label="Admin menu"
        className="flex h-9 w-9 items-center justify-center rounded-full text-foreground/60 hover:bg-black/[.04]"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-30 mt-2 w-48 rounded-2xl border border-border bg-surface shadow-lg">
          <div className="flex flex-col gap-1 p-2">
            <a
              href="/admin-mfa/enroll"
              className="rounded-xl px-3 py-2 text-left text-sm font-medium text-foreground/70 hover:bg-black/[.03]"
              onClick={() => setOpen(false)}
            >
              Security
            </a>
            <Link
              href="/home"
              className="rounded-xl px-3 py-2 text-left text-sm font-medium text-foreground/70 hover:bg-black/[.03]"
              onClick={() => setOpen(false)}
            >
              Back to app
            </Link>
            <LogoutButton
              className="w-full rounded-xl px-3 py-2 text-left text-sm font-medium text-danger-500 hover:bg-black/[.03]"
              action={adminLogOut}
            />
          </div>
        </div>
      )}
    </div>
  );
}
