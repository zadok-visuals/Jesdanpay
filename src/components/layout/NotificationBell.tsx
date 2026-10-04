"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Notification } from "@/lib/types/database";

function formatWhen(createdAt: string): string {
  return new Date(createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// Opening the panel marks every currently-unread notification read in one batch (rather than
// requiring a click per item) — the simplest, most common "bell" UX. Marking happens via a direct
// client-side update against the user's own session; RLS (migration 0037) already permits a user
// to update their own targeted rows and any broadcast row, so no server action round trip is
// needed here.
export function NotificationBell({ notifications: initial }: { notifications: Notification[] }) {
  const [notifications, setNotifications] = useState(initial);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter((n) => !n.read_at).length;

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function handleOpen() {
    setOpen((prev) => !prev);
    const unreadIds = notifications.filter((n) => !n.read_at).map((n) => n.id);
    if (unreadIds.length === 0 || open) return;

    const now = new Date().toISOString();
    setNotifications((prev) => prev.map((n) => (unreadIds.includes(n.id) ? { ...n, read_at: now } : n)));

    const supabase = createClient();
    await supabase.from("notifications").update({ read_at: now }).in("id", unreadIds).is("read_at", null);
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={handleOpen}
        aria-label="Notifications"
        className="relative flex h-9 w-9 items-center justify-center rounded-full text-foreground/60 hover:bg-black/[.04]"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger-500 px-1 text-[10px] font-semibold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-x-4 top-16 z-30 max-h-[70vh] overflow-hidden rounded-2xl border border-border bg-surface shadow-lg sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-80 sm:max-w-[calc(100vw-2rem)] sm:max-h-none">
          <div className="border-b border-border px-4 py-3">
            <p className="text-sm font-semibold">Notifications</p>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-foreground/50">No notifications yet.</p>
            ) : (
              notifications.map((n) => (
                <div key={n.id} className="flex flex-col gap-0.5 border-b border-border px-4 py-3 last:border-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{n.title}</span>
                    <span className="shrink-0 text-xs text-foreground/40">{formatWhen(n.created_at)}</span>
                  </div>
                  <p className="text-xs text-foreground/60">{n.body}</p>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
