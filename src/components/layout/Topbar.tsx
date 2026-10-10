import Link from "next/link";
import { NotificationBell } from "@/components/layout/NotificationBell";
import { ChatSupportButton } from "@/components/layout/ChatSupportButton";
import type { Notification, SupportMessage } from "@/lib/types/database";

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

interface TopbarProps {
  name: string;
  onMenuClick?: () => void;
  notifications?: Notification[];
  unreadChatCount?: number;
  initialSupportMessages?: SupportMessage[];
}

export function Topbar({
  name,
  onMenuClick,
  notifications = [],
  unreadChatCount = 0,
  initialSupportMessages,
}: TopbarProps) {
  return (
    <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center justify-between gap-3 border-b border-border bg-surface px-4 sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={onMenuClick}
          aria-label="Open menu"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-foreground/60 hover:bg-black/[.04] md:hidden"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
          </svg>
        </button>
        <h1 className="truncate text-base font-semibold sm:text-lg">
          Hello, {name.split(" ")[0]} 👋
        </h1>
      </div>

      <div className="flex shrink-0 items-center gap-2 sm:gap-4">
        <NotificationBell notifications={notifications} />
        <ChatSupportButton initialUnreadCount={unreadChatCount} initialMessages={initialSupportMessages} />

        <Link
          href="/settings"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-500 text-sm font-semibold text-white"
        >
          {initials(name) || "?"}
        </Link>
      </div>
    </header>
  );
}
