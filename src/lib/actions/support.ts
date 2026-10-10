"use server";

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
  return { messages: data ?? [] };
}

export async function sendSupportMessage(body: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };
  const trimmed = body.trim();
  if (!trimmed) return { error: "Message can't be empty." };

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

  const { error } = await supabase.from("support_messages").insert({ user_id: user.id, sender: "user", body: trimmed });
  if (error) {
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
        messagePreview: trimmed,
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
// the chat panel (src/components/layout/ChatSupportButton.tsx).
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
      return {
        userId,
        email: profile?.email ?? "Unknown",
        fullName: profile?.full_name ?? null,
        lastMessage: msgs[0].body,
        lastMessageAt: msgs[0].created_at,
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
  return data ?? [];
}

export async function sendAdminSupportReply(userId: string, body: string): Promise<{ error?: string }> {
  await requireAdminUser();
  const trimmed = body.trim();
  if (!trimmed) return { error: "Message can't be empty." };

  const admin = createAdminClient();

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

  const { error } = await admin.from("support_messages").insert({ user_id: userId, sender: "admin", body: trimmed });
  if (error) return { error: error.message };

  // No notifications-table insert here on purpose — the in-app chat badge (unread admin
  // messages) already covers this; a duplicate notification row would just be noise.
  if (shouldAlert && profile?.email) {
    try {
      await sendSupportReplyEmail({
        to: profile.email,
        userName: profile.full_name || profile.email,
        messagePreview: trimmed,
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
// thread (src/app/admin/chat/[userId]/page.tsx).
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
