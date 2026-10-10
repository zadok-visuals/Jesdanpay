"use client";

import { useEffect, useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { getSupportThread, sendSupportMessage, markSupportMessagesReadByUser } from "@/lib/actions/support";
import type { SupportMessage } from "@/lib/types/database";

// Polls every 17s (within the 15-20s window) while the panel is open — same setInterval-while-
// mounted pattern as src/components/marketing/LiveRate.tsx, just gated on `open` here since there's
// no reason to poll a chat panel nobody's looking at.
const POLL_MS = 17_000;

export function ChatSupportButton({
  initialUnreadCount = 0,
  initialMessages,
}: {
  initialUnreadCount?: number;
  // Fetched server-side alongside the dashboard layout's other queries (src/app/(dashboard)/
  // layout.tsx) and seeded straight into state so the panel opens with real content instantly
  // instead of flashing the empty state while getSupportThread's own cold round trip resolves —
  // slowest right after a fresh sign-in. Undefined when that fetch failed; in that case `loaded`
  // starts false and this falls back to the plain client fetch below, same as before.
  initialMessages?: SupportMessage[];
}) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<SupportMessage[]>(initialMessages ?? []);
  const [loaded, setLoaded] = useState(initialMessages !== undefined);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const scrollRef = useRef<HTMLDivElement>(null);

  // handleSend also needs to trigger a reload after sending — kept as its own function for that,
  // separate from the effect below's own guarded copy.
  async function loadMessages() {
    const result = await getSupportThread();
    if ("error" in result) setError(result.error);
    else {
      setMessages(result.messages);
      setLoaded(true);
    }
  }

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    async function tick() {
      const result = await getSupportThread();
      if (cancelled) return;
      if ("error" in result) setError(result.error);
      else {
        setMessages(result.messages);
        setLoaded(true);
      }
    }

    tick();
    markSupportMessagesReadByUser();
    const interval = setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [open]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  async function handleSend() {
    const trimmed = body.trim();
    if (!trimmed) return;
    setSending(true);
    setError(null);
    const result = await sendSupportMessage(trimmed);
    if (result.error) setError(result.error);
    else {
      setBody("");
      await loadMessages();
    }
    setSending(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setUnreadCount(0);
        }}
        aria-label="Chat with support"
        className="relative flex h-9 w-9 items-center justify-center rounded-full text-foreground/60 hover:bg-black/[.04]"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 14v-2a8 8 0 0 1 16 0v2" strokeLinecap="round" strokeLinejoin="round" />
          <rect x="2.5" y="14" width="4" height="6" rx="1.5" />
          <rect x="17.5" y="14" width="4" height="6" rx="1.5" />
          <path d="M19.5 20v.5a3 3 0 0 1-3 3H13" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger-500 px-1 text-[10px] font-semibold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="Support">
        <div ref={scrollRef} className="flex max-h-80 min-h-[10rem] flex-col gap-2 overflow-y-auto">
          {!loaded ? (
            <div className="flex flex-col gap-2 py-4">
              <div className="h-9 w-2/3 animate-pulse self-start rounded-xl bg-black/[.06]" />
              <div className="h-9 w-1/2 animate-pulse self-end rounded-xl bg-black/[.06]" />
              <div className="h-9 w-3/5 animate-pulse self-start rounded-xl bg-black/[.06]" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 py-10 text-center">
              <div className="animate-chat-bubble-float relative flex h-14 w-14 items-center justify-center rounded-full bg-primary-50 text-primary-500">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M4 18V7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H9l-4 4z" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="absolute -bottom-1 flex gap-0.5 rounded-full bg-white px-1.5 py-0.5 shadow-sm">
                  <span className="animate-chat-typing-dot h-1.5 w-1.5 rounded-full bg-primary-400 [animation-delay:0ms]" />
                  <span className="animate-chat-typing-dot h-1.5 w-1.5 rounded-full bg-primary-400 [animation-delay:150ms]" />
                  <span className="animate-chat-typing-dot h-1.5 w-1.5 rounded-full bg-primary-400 [animation-delay:300ms]" />
                </span>
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">No messages yet</p>
                <p className="mt-1 text-sm text-foreground/50">
                  Send us a message below and we will reply right here.
                </p>
              </div>
            </div>
          ) : (
            messages.map((m) => (
              <div
                key={m.id}
                className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${
                  m.sender === "user" ? "self-end bg-primary-500 text-white" : "self-start bg-black/[.04] text-foreground"
                }`}
              >
                {m.body}
              </div>
            ))
          )}
        </div>

        {error && <p className="mt-2 text-xs text-danger-500">{error}</p>}

        <div className="mt-4 flex items-end gap-2">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            rows={2}
            placeholder="Type a message…"
            className="flex-1 rounded-xl border border-border bg-white px-3.5 py-2.5 text-sm outline-none focus:border-primary-400"
          />
          <Button onClick={handleSend} loading={sending} disabled={!body.trim()}>
            Send
          </Button>
        </div>
      </Modal>
    </>
  );
}
