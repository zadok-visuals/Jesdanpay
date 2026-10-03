"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import {
  getSupportThreadMessages,
  sendAdminSupportReply,
  markSupportThreadReadByAdmin,
} from "@/lib/actions/support";
import type { SupportMessage } from "@/lib/types/database";

// Same polling-while-mounted pattern as the user-facing ChatSupportButton — this component is
// only ever rendered while the admin is actively looking at a specific thread, so it always polls
// (no open/closed toggle needed here, unlike the user's modal panel).
const POLL_MS = 17_000;

export function AdminChatThread({ userId, initialMessages }: { userId: string; initialMessages: SupportMessage[] }) {
  const [messages, setMessages] = useState(initialMessages);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    markSupportThreadReadByAdmin(userId);
    const interval = setInterval(async () => {
      const fresh = await getSupportThreadMessages(userId);
      setMessages(fresh);
    }, POLL_MS);
    return () => clearInterval(interval);
  }, [userId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  async function handleSend() {
    const trimmed = body.trim();
    if (!trimmed) return;
    setSending(true);
    setError(null);
    const result = await sendAdminSupportReply(userId, trimmed);
    if (result.error) {
      setError(result.error);
    } else {
      setBody("");
      const fresh = await getSupportThreadMessages(userId);
      setMessages(fresh);
    }
    setSending(false);
  }

  return (
    <div className="flex flex-col gap-4">
      <div ref={scrollRef} className="flex max-h-[28rem] min-h-[16rem] flex-col gap-2 overflow-y-auto rounded-xl border border-border bg-white p-4">
        {messages.length === 0 ? (
          <p className="py-10 text-center text-sm text-foreground/50">No messages in this thread yet.</p>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${
                m.sender === "admin" ? "self-end bg-primary-500 text-white" : "self-start bg-black/[.04] text-foreground"
              }`}
            >
              {m.body}
            </div>
          ))
        )}
      </div>

      {error && <p className="text-xs text-danger-500">{error}</p>}

      <div className="flex items-end gap-2">
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
          placeholder="Reply…"
          className="flex-1 rounded-xl border border-border bg-white px-3.5 py-2.5 text-sm outline-none focus:border-primary-400"
        />
        <Button onClick={handleSend} loading={sending} disabled={!body.trim()}>
          Reply
        </Button>
      </div>
    </div>
  );
}
