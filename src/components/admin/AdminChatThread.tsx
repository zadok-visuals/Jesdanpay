"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { ChatImageLightbox } from "@/components/layout/ChatImageLightbox";
import { useChatAttachmentUpload } from "@/lib/hooks/useChatAttachmentUpload";
import { formatMessageTime, dayLabel, isNewDay } from "@/lib/chatFormat";
import {
  getSupportThreadMessages,
  sendAdminSupportReply,
  markSupportThreadReadByAdmin,
  createAdminSupportUploadUrl,
} from "@/lib/actions/support";
import type { SupportMessage } from "@/lib/types/database";

// Same polling-while-mounted pattern as the user-facing ChatSupportButton — this component is
// only ever rendered while the admin is actively looking at a specific thread, so it always polls
// (no open/closed toggle needed here, unlike the user's modal panel). Each tick both re-fetches
// messages (so an admin bubble's "Seen" status flips once the user reads it, without reopening
// the thread) and re-marks the user's own messages read.
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
  const isAdmin = message.sender === "admin";
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
      <div className={`flex max-w-[80%] flex-col gap-1 ${isAdmin ? "self-end items-end" : "self-start items-start"}`}>
        <div
          className={`overflow-hidden rounded-xl text-sm ${
            isAdmin ? "bg-primary-500 text-white" : "bg-black/[.04] text-foreground"
          } ${message.attachment_url ? "" : "px-3 py-2"}`}
        >
          {message.attachment_url && (
            // See ChatSupportButton.tsx's identical comment — a fixed base width (not w-full) is
            // required here for the same reason: this bubble sits in a flex column with
            // items-end/items-start, which never stretches a child to fill the cross axis.
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
          {isAdmin && <> · {seen ? `Seen ${formatMessageTime(message.read_at!)}` : "Sent"}</>}
        </span>
      </div>
      {lightboxOpen && message.attachment_url && (
        <ChatImageLightbox src={message.attachment_url} onClose={() => setLightboxOpen(false)} />
      )}
    </>
  );
}

export function AdminChatThread({ userId, initialMessages }: { userId: string; initialMessages: SupportMessage[] }) {
  const [messages, setMessages] = useState(initialMessages);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const createUploadUrl = (fileName: string, fileSize: number, mimeType: string) =>
    createAdminSupportUploadUrl(userId, fileName, fileSize, mimeType);
  const { attachment, status: uploadStatus, error: uploadError, pickFile, clear: clearAttachment } =
    useChatAttachmentUpload(createUploadUrl);

  useEffect(() => {
    markSupportThreadReadByAdmin(userId);
    const interval = setInterval(async () => {
      const fresh = await getSupportThreadMessages(userId);
      setMessages(fresh);
      markSupportThreadReadByAdmin(userId);
    }, POLL_MS);
    return () => clearInterval(interval);
  }, [userId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  async function handleSend() {
    const trimmed = body.trim();
    if (!trimmed && !attachment) return;
    setSending(true);
    setError(null);
    const result = await sendAdminSupportReply(userId, trimmed, attachment?.ref ?? null);
    if (result.error) {
      setError(result.error);
    } else {
      setBody("");
      clearAttachment();
      const fresh = await getSupportThreadMessages(userId);
      setMessages(fresh);
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
    <div className="flex flex-col gap-4">
      <div ref={scrollRef} className="flex max-h-[28rem] min-h-[16rem] flex-col gap-2 overflow-y-auto rounded-xl border border-border bg-white p-4">
        {messages.length === 0 ? (
          <p className="py-10 text-center text-sm text-foreground/50">No messages in this thread yet.</p>
        ) : (
          messages.map((m, i) => (
            <MessageBubble key={m.id} message={m} showDaySeparator={isNewDay(m.created_at, messages[i - 1]?.created_at)} />
          ))
        )}
      </div>

      {error && <p className="text-xs text-danger-500">{error}</p>}
      {uploadError && <p className="text-xs text-danger-500">{uploadError}</p>}

      {attachment && (
        <div className="flex items-center gap-2 rounded-xl border border-border bg-black/[.02] px-2.5 py-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- local object URL preview */}
          <img src={attachment.previewUrl} alt="" className="h-10 w-10 rounded-lg object-cover" />
          <span className="flex-1 truncate text-xs text-foreground/60">{attachment.fileName}</span>
          <button type="button" onClick={clearAttachment} className="text-xs text-foreground/50 hover:text-foreground">
            Remove
          </button>
        </div>
      )}

      <div className="flex items-end gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
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
          placeholder="Reply…"
          className="flex-1 rounded-xl border border-border bg-white px-3.5 py-2.5 text-sm outline-none focus:border-primary-400"
        />
        <Button onClick={handleSend} loading={sending} disabled={sendDisabled}>
          Reply
        </Button>
      </div>
    </div>
  );
}
