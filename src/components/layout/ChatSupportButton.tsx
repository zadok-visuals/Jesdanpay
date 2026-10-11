"use client";

import { useEffect, useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { ChatImageLightbox } from "@/components/layout/ChatImageLightbox";
import { useChatAttachmentUpload } from "@/lib/hooks/useChatAttachmentUpload";
import { formatMessageTime, dayLabel, isNewDay } from "@/lib/chatFormat";
import {
  getSupportThread,
  sendSupportMessage,
  markSupportMessagesReadByUser,
  createSupportUploadUrl,
} from "@/lib/actions/support";
import type { SupportMessage } from "@/lib/types/database";

// Polls every 17s (within the 15-20s window) while the panel is open — same setInterval-while-
// mounted pattern as src/components/marketing/LiveRate.tsx, just gated on `open` here since there's
// no reason to poll a chat panel nobody's looking at. Every tick also re-fetches read_at (plain
// part of each message row), so a "Sent" bubble flips to "Seen" without the user reopening the
// panel, and re-marks the admin's replies read so an admin viewing their own "Seen" status on the
// other end stays accurate too.
const POLL_MS = 17_000;

function PaperclipIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path
        d="M21 11.5 12.5 20a4.5 4.5 0 0 1-6.36-6.36L14.5 5.3a3 3 0 0 1 4.24 4.24l-8.49 8.49a1.5 1.5 0 0 1-2.12-2.12l7.78-7.78"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MessageBubble({ message, showDaySeparator }: { message: SupportMessage; showDaySeparator: boolean }) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const isUser = message.sender === "user";
  const seen = !!message.read_at;

  return (
    <>
      {showDaySeparator && (
        <div className="my-1 flex items-center justify-center">
          <span className="rounded-full bg-black/[.04] px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide text-foreground/40">
            {dayLabel(message.created_at)}
          </span>
        </div>
      )}
      <div className={`flex max-w-[80%] flex-col gap-1 ${isUser ? "self-end items-end" : "self-start items-start"}`}>
        <div
          className={`overflow-hidden rounded-xl text-sm ${
            isUser ? "bg-primary-500 text-white" : "bg-black/[.04] text-foreground"
          } ${message.attachment_url ? "" : "px-3 py-2"}`}
        >
          {message.attachment_url && (
            // A fixed base width (not w-full) is deliberate — this bubble sits in a flex column
            // with items-end/items-start, which never stretches a child to fill the cross axis,
            // so a percentage-width image inside a shrink-to-fit container has nothing real to
            // size against and collapses to its own intrinsic pixel size instead (confirmed live:
            // a real upload rendered as a 1x1 box). max-w-full keeps it from overflowing on a
            // narrow viewport where 14rem exceeds the modal's own width.
            <button type="button" onClick={() => setLightboxOpen(true)} className="block w-56 max-w-full">
              {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL,
                  not a static asset next/image can cache/optimize */}
              <img src={message.attachment_url} alt="Attachment" className="h-40 w-full object-cover" />
            </button>
          )}
          {message.body && <p className={message.attachment_url ? "px-3 py-2" : ""}>{message.body}</p>}
        </div>
        <span className="px-1 text-[10px] text-foreground/40">
          {formatMessageTime(message.created_at)}
          {isUser && <> · {seen ? `Seen ${formatMessageTime(message.read_at!)}` : "Sent"}</>}
        </span>
      </div>
      {lightboxOpen && message.attachment_url && (
        <ChatImageLightbox src={message.attachment_url} onClose={() => setLightboxOpen(false)} />
      )}
    </>
  );
}

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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { attachment, status: uploadStatus, error: uploadError, pickFile, clear: clearAttachment } =
    useChatAttachmentUpload(createSupportUploadUrl);

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
    const interval = setInterval(() => {
      tick();
      markSupportMessagesReadByUser();
    }, POLL_MS);
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
    if (!trimmed && !attachment) return;
    setSending(true);
    setError(null);
    const result = await sendSupportMessage(trimmed, attachment?.ref ?? null);
    if (result.error) setError(result.error);
    else {
      setBody("");
      clearAttachment();
      await loadMessages();
    }
    setSending(false);
  }

  function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const file = [...e.clipboardData.items].find((i) => i.type.startsWith("image/"))?.getAsFile();
    if (file) {
      e.preventDefault();
      pickFile(file);
    }
  }

  const sendDisabled = (!body.trim() && !attachment) || uploadStatus === "uploading" || sending;

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
        {loaded && messages.length > 0 && (
          <div className="mb-3 flex items-start gap-2 rounded-xl bg-primary-50 px-3.5 py-2.5 text-xs text-primary-800">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mt-0.5 shrink-0" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 7v5l3 2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>
              We have received your messages and our team will attend to you shortly. Typical
              reply time is within a few hours.
            </span>
          </div>
        )}

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
            messages.map((m, i) => (
              <MessageBubble key={m.id} message={m} showDaySeparator={isNewDay(m.created_at, messages[i - 1]?.created_at)} />
            ))
          )}
        </div>

        {error && <p className="mt-2 text-xs text-danger-500">{error}</p>}
        {uploadError && <p className="mt-2 text-xs text-danger-500">{uploadError}</p>}

        {attachment && (
          <div className="mt-2 flex items-center gap-2 rounded-xl border border-border bg-black/[.02] px-2.5 py-2">
            {/* eslint-disable-next-line @next/next/no-img-element -- local object URL preview */}
            <img src={attachment.previewUrl} alt="" className="h-10 w-10 rounded-lg object-cover" />
            <span className="flex-1 truncate text-xs text-foreground/60">{attachment.fileName}</span>
            <button type="button" onClick={clearAttachment} className="text-xs text-foreground/50 hover:text-foreground">
              Remove
            </button>
          </div>
        )}

        <div className="mt-4 flex items-end gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) pickFile(file);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadStatus === "uploading"}
            aria-label="Attach an image"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border text-foreground/60 transition-colors hover:border-primary-300 hover:text-foreground disabled:opacity-50"
          >
            {uploadStatus === "uploading" ? (
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <PaperclipIcon />
            )}
          </button>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onPaste={handlePaste}
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
          <Button onClick={handleSend} loading={sending} disabled={sendDisabled}>
            Send
          </Button>
        </div>
      </Modal>
    </>
  );
}
