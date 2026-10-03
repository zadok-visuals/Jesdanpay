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

export function ChatSupportButton() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // handleSend also needs to trigger a reload after sending — kept as its own function for that,
  // separate from the effect below's own guarded copy.
  async function loadMessages() {
    const result = await getSupportThread();
    if ("error" in result) setError(result.error);
    else setMessages(result.messages);
  }

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    async function tick() {
      const result = await getSupportThread();
      if (cancelled) return;
      if ("error" in result) setError(result.error);
      else setMessages(result.messages);
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
        onClick={() => setOpen(true)}
        aria-label="Chat with support"
        className="flex h-9 w-9 items-center justify-center rounded-full text-foreground/60 hover:bg-black/[.04]"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path
            d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="Support">
        <div ref={scrollRef} className="flex max-h-80 min-h-[10rem] flex-col gap-2 overflow-y-auto">
          {messages.length === 0 ? (
            <p className="py-10 text-center text-sm text-foreground/50">
              No messages yet — send us one below and we&rsquo;ll reply here.
            </p>
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
