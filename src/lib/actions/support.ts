"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminUser, getAdminNotificationEmails } from "@/lib/auth/admin";
import { sendSupportMessageAlertEmail, sendSupportReplyEmail } from "@/lib/email";
import type { SupportMessage } from "@/lib/types/database";

// Below this, a message is considered part of the SAME burst as whatever unread message from
// the other side is already waiting — so a user firing off three messages in a row (or an admin
// replying twice while the user hasn't looked yet) only ever emails once, on the first one.
const FLOOD_WINDOW_MS = 10 * 60 * 1000;

const ATTACHMENT_BUCKET = "support-attachments";
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
const ALLOWED_ATTACHMENT_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const ATTACHMENT_URL_TTL_SECONDS = 60 * 60;
const UPLOAD_NOT_AVAILABLE_ERROR = "Image upload is not available yet.";

// migration 0046 adds support_messages.attachment_ref — until it's been pasted into the Supabase
// SQL editor, any query that explicitly references that column fails with PostgREST's "column
// not found in schema cache" (PGRST204) or Postgres's own undefined_column (42703). Checked
// narrowly (not just "any error") so a real failure isn't mistaken for a pending migration —
// same discipline as payments.ts's isFunctionNotFoundError for migration 0045.
function isMissingColumnError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === "PGRST204" || error.code === "42703") return true;
  return /column .*(does not exist|not found)/i.test(error.message ?? "");
}

function sanitizedExtension(fileName: string, mimeType: string): string {
  switch (mimeType) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    default: {
      const match = /\.([a-zA-Z0-9]{1,5})$/.exec(fileName);
      return match ? match[1].toLowerCase() : "bin";
    }
  }
}

export interface SupportUploadUrlState {
  error?: string;
  path?: string;
  token?: string;
}

// Mints a short-lived signed upload URL/token for an image attachment, same pattern as
// createRmbProofUploadUrl (src/lib/actions/admin.ts) — the file bytes never pass through this
// server action's own 1MB body limit; the browser finishes the upload itself via
// uploadToSignedUrl (src/lib/storage/clientUpload.ts). Validates type/size against the declared
// values up front for a fast error — the bucket's own file_size_limit/allowed_mime_types
// (migration 0046) is still the real, unbypassable enforcement at upload time.
export async function createSupportUploadUrl(fileName: string, fileSize: number, mimeType: string): Promise<SupportUploadUrlState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  if (!ALLOWED_ATTACHMENT_TYPES.includes(mimeType)) {
    return { error: "Only JPEG, PNG, WebP or GIF images are allowed." };
  }
  if (fileSize > MAX_ATTACHMENT_BYTES) {
    return { error: "That image is too large (max 5MB)." };
  }

  // Cheap compatibility probe — see isMissingColumnError's header comment.
  const probe = await supabase.from("support_messages").select("attachment_ref").limit(1);
  if (probe.error && isMissingColumnError(probe.error)) {
    return { error: UPLOAD_NOT_AVAILABLE_ERROR };
  }

  const ext = sanitizedExtension(fileName, mimeType);
  const path = `${user.id}/${randomUUID().replace(/-/g, "")}.${ext}`;

  const { data, error } = await supabase.storage.from(ATTACHMENT_BUCKET).createSignedUploadUrl(path);
  if (error) {
    console.error("[createSupportUploadUrl]", error);
    return { error: "We could not prepare the upload. Please try again." };
  }
  return { path: data.path, token: data.token };
}

// Admin variant — the destination folder is the CUSTOMER's own user id, not the admin's, so
// there's no RLS path for the admin's own browser session to upload directly (same reasoning as
// createRmbProofUploadUrl).
export async function createAdminSupportUploadUrl(
  userId: string,
  fileName: string,
  fileSize: number,
  mimeType: string,
): Promise<SupportUploadUrlState> {
  await requireAdminUser();
  if (!userId) return { error: "Missing user." };

  if (!ALLOWED_ATTACHMENT_TYPES.includes(mimeType)) {
    return { error: "Only JPEG, PNG, WebP or GIF images are allowed." };
  }
  if (fileSize > MAX_ATTACHMENT_BYTES) {
    return { error: "That image is too large (max 5MB)." };
  }

  const admin = createAdminClient();
  const probe = await admin.from("support_messages").select("attachment_ref").limit(1);
  if (probe.error && isMissingColumnError(probe.error)) {
    return { error: UPLOAD_NOT_AVAILABLE_ERROR };
  }

  const ext = sanitizedExtension(fileName, mimeType);
  const path = `${userId}/${randomUUID().replace(/-/g, "")}.${ext}`;

  const { data, error } = await admin.storage.from(ATTACHMENT_BUCKET).createSignedUploadUrl(path);
  if (error) {
    console.error("[createAdminSupportUploadUrl]", error);
    return { error: "We could not prepare the upload. Please try again." };
  }
  return { path: data.path, token: data.token };
}

// Resolves attachment_ref -> a short-lived signed URL for every message that has one, in a
// single batched call rather than one createSignedUrl per message. Silently leaves attachment_url
// unset on a signing failure (a broken image icon in the UI) rather than failing the whole thread
// load over one bad reference.
async function withAttachmentUrls(
  storage: ReturnType<typeof createAdminClient>["storage"] | Awaited<ReturnType<typeof createClient>>["storage"],
  messages: SupportMessage[],
): Promise<SupportMessage[]> {
  const refs = messages.map((m) => m.attachment_ref).filter((r): r is string => !!r);
  if (refs.length === 0) return messages;

  const { data, error } = await storage.from(ATTACHMENT_BUCKET).createSignedUrls(refs, ATTACHMENT_URL_TTL_SECONDS);
  if (error) {
    console.error("[withAttachmentUrls] createSignedUrls failed", error);
    return messages;
  }
  const urlByPath = new Map((data ?? []).map((d) => [d.path, d.signedUrl]));
  return messages.map((m) => (m.attachment_ref ? { ...m, attachment_url: urlByPath.get(m.attachment_ref) ?? null } : m));
}

// ---- User-facing (own session, RLS-protected — see migration 0040) ----

export async function getSupportThread(): Promise<{ messages: SupportMessage[] } | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { data, error } = await supabase
    .from("support_messages")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });
  if (error) return { error: error.message };
  return { messages: await withAttachmentUrls(supabase.storage, data ?? []) };
}

export async function sendSupportMessage(body: string, attachmentRef?: string | null): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };
  const trimmed = body.trim();
  if (!trimmed && !attachmentRef) return { error: "Message can't be empty." };

  // Untrusted client input — must point into THIS user's own folder, never another user's.
  if (attachmentRef && !attachmentRef.startsWith(`${user.id}/`)) {
    return { error: "That image upload doesn't match your account. Please try uploading it again." };
  }

  // Checked BEFORE the insert, so the new message can't count itself — true exactly when this
  // is the first message of a fresh burst (no other message from this user is still sitting
  // unread from within the flood window), which is exactly when an admin alert is worth sending.
  const windowStart = new Date(Date.now() - FLOOD_WINDOW_MS).toISOString();
  const [{ count: recentUnreadCount }, { data: profile }] = await Promise.all([
    supabase
      .from("support_messages")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("sender", "user")
      .is("read_at", null)
      .gte("created_at", windowStart),
    supabase.from("profiles").select("full_name, email").eq("id", user.id).maybeSingle(),
  ]);
  const shouldAlert = (recentUnreadCount ?? 0) === 0;

  const insertRow: { user_id: string; sender: "user"; body: string; attachment_ref?: string } = {
    user_id: user.id,
    sender: "user",
    body: trimmed,
  };
  // Only referenced when actually provided — a text-only send never touches this column at all,
  // so it keeps working even before migration 0046 has been applied.
  if (attachmentRef) insertRow.attachment_ref = attachmentRef;

  const { error } = await supabase.from("support_messages").insert(insertRow);
  if (error) {
    if (attachmentRef && isMissingColumnError(error)) return { error: UPLOAD_NOT_AVAILABLE_ERROR };
    // Never show raw database error text to the user — same discipline as every other customer
    // facing action in this app.
    console.error("[sendSupportMessage] insert failed", error);
    return { error: "We could not send your message. Please try again." };
  }

  if (shouldAlert) {
    try {
      const recipients = await getAdminNotificationEmails();
      await sendSupportMessageAlertEmail({
        to: recipients,
        userName: profile?.full_name || profile?.email || user.email || "A user",
        userEmail: profile?.email || user.email || "unknown",
        userId: user.id,
        messagePreview: trimmed || "Sent an image",
        isImageOnly: !trimmed && !!attachmentRef,
      });
    } catch (err) {
      // Belt-and-suspenders — sendSupportMessageAlertEmail already never throws on its own, but
      // the message the user just sent must never fail over an email problem either way.
      console.error("[email] support message alert failed", err);
    }
  }

  return {};
}

// Lean count-only query (no row bodies) for the chat icon's unread badge
// (src/components/layout/ChatSupportButton.tsx) — fetched once server-side alongside notifications
// in src/app/(dashboard)/layout.tsx, same pattern as that layout's own notifications query.
export async function getUnreadSupportMessageCountForUser(): Promise<number> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return 0;

  const { count } = await supabase
    .from("support_messages")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("sender", "admin")
    .is("read_at", null);
  return count ?? 0;
}

// Marks every unread admin reply in the caller's own thread read — called when the user opens
// the chat panel (src/components/layout/ChatSupportButton.tsx), and again on every poll tick
// while the panel stays open so "Seen" flips without the user having to close and reopen it.
export async function markSupportMessagesReadByUser(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("support_messages")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .eq("sender", "admin")
    .is("read_at", null);
}

// ---- Admin-facing (service-role client, every admin-only data path's established convention) ----

export interface SupportThreadSummary {
  userId: string;
  email: string;
  fullName: string | null;
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
}

// One row per user with any support_messages at all — fetched and aggregated in JS (Postgrest has
// no native group-by through the JS client), same pattern as every other admin aggregate view in
// this panel (e.g. src/app/admin/page.tsx's volume totals).
export async function getSupportThreads(): Promise<SupportThreadSummary[]> {
  await requireAdminUser();
  const admin = createAdminClient();

  const { data: messages } = await admin
    .from("support_messages")
    .select("*")
    .order("created_at", { ascending: false });

  const byUser = new Map<string, SupportMessage[]>();
  for (const m of messages ?? []) {
    byUser.set(m.user_id, [...(byUser.get(m.user_id) ?? []), m]);
  }

  const userIds = [...byUser.keys()];
  const { data: profiles } = userIds.length
    ? await admin.from("profiles").select("id, email, full_name").in("id", userIds)
    : { data: [] };
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

  return userIds
    .map((userId) => {
      const msgs = byUser.get(userId)!; // newest first
      const unreadCount = msgs.filter((m) => m.sender === "user" && !m.read_at).length;
      const profile = profileById.get(userId);
      const last = msgs[0];
      return {
        userId,
        email: profile?.email ?? "Unknown",
        fullName: profile?.full_name ?? null,
        lastMessage: last.body || (last.attachment_ref ? "Sent an image" : ""),
        lastMessageAt: last.created_at,
        unreadCount,
      };
    })
    .sort((a, b) => (a.lastMessageAt < b.lastMessageAt ? 1 : -1));
}

// Lean count-only query for AdminNavTabs' "Chat Support" tab badge — summed across every thread,
// unlike getSupportThreads()' per-thread unreadCount which needs the full message+profile fetch
// this avoids on every admin page load.
export async function getUnreadSupportMessageCountForAdmin(): Promise<number> {
  await requireAdminUser();
  const admin = createAdminClient();
  const { count } = await admin
    .from("support_messages")
    .select("*", { count: "exact", head: true })
    .eq("sender", "user")
    .is("read_at", null);
  return count ?? 0;
}

export async function getSupportThreadMessages(userId: string): Promise<SupportMessage[]> {
  await requireAdminUser();
  const admin = createAdminClient();
  const { data } = await admin
    .from("support_messages")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  return withAttachmentUrls(admin.storage, data ?? []);
}

export async function sendAdminSupportReply(userId: string, body: string, attachmentRef?: string | null): Promise<{ error?: string }> {
  await requireAdminUser();
  const trimmed = body.trim();
  if (!trimmed && !attachmentRef) return { error: "Message can't be empty." };

  const admin = createAdminClient();

  // Untrusted client input — must point into the CUSTOMER's own folder (every support attachment,
  // from either side of the conversation, lives under the user's folder — see migration 0046's
  // header comment), never anywhere else.
  if (attachmentRef && !attachmentRef.startsWith(`${userId}/`)) {
    return { error: "That image upload doesn't match this conversation. Please try uploading it again." };
  }

  // Same flood-protection shape as sendSupportMessage above, in reverse: skip the email when an
  // admin message is already sitting unread in this thread from within the window — checked
  // before the insert so the new reply can't count itself.
  const windowStart = new Date(Date.now() - FLOOD_WINDOW_MS).toISOString();
  const [{ count: recentUnreadCount }, { data: profile }] = await Promise.all([
    admin
      .from("support_messages")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("sender", "admin")
      .is("read_at", null)
      .gte("created_at", windowStart),
    admin.from("profiles").select("full_name, email").eq("id", userId).maybeSingle(),
  ]);
  const shouldAlert = (recentUnreadCount ?? 0) === 0;

  const insertRow: { user_id: string; sender: "admin"; body: string; attachment_ref?: string } = {
    user_id: userId,
    sender: "admin",
    body: trimmed,
  };
  if (attachmentRef) insertRow.attachment_ref = attachmentRef;

  const { error } = await admin.from("support_messages").insert(insertRow);
  if (error) {
    if (attachmentRef && isMissingColumnError(error)) return { error: UPLOAD_NOT_AVAILABLE_ERROR };
    return { error: error.message };
  }

  // No notifications-table insert here on purpose — the in-app chat badge (unread admin
  // messages) already covers this; a duplicate notification row would just be noise.
  if (shouldAlert && profile?.email) {
    try {
      await sendSupportReplyEmail({
        to: profile.email,
        userName: profile.full_name || profile.email,
        messagePreview: trimmed || "Sent an image",
        isImageOnly: !trimmed && !!attachmentRef,
      });
    } catch (err) {
      // Belt-and-suspenders — sendSupportReplyEmail already never throws on its own, but the
      // reply itself has already been saved and must never fail over an email problem.
      console.error("[email] support reply alert failed", err);
    }
  }

  revalidatePath(`/admin/chat/${userId}`);
  revalidatePath("/admin/chat");
  return {};
}

// Marks every unread user message in a given thread read — called when an admin opens that
// thread (src/app/admin/chat/[userId]/page.tsx), and again on every poll tick while the thread
// stays open so "Seen" flips for the user without the admin having to reopen it.
export async function markSupportThreadReadByAdmin(userId: string): Promise<void> {
  await requireAdminUser();
  const admin = createAdminClient();
  await admin
    .from("support_messages")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("sender", "user")
    .is("read_at", null);
  revalidatePath("/admin/chat");
}
