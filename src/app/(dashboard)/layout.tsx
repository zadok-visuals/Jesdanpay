import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DashboardChrome } from "@/components/layout/DashboardChrome";
import { isAdminEmail } from "@/lib/auth/admin";
import { getUnreadSupportMessageCountForUser, getSupportThread } from "@/lib/actions/support";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: notifications }, unreadChatCount, supportThreadResult] = await Promise.all([
    supabase.from("profiles").select("full_name, email").eq("id", user.id).single(),
    // Own targeted notifications + every broadcast (user_id null) — RLS (migration 0037) already
    // scopes this to rows this user is allowed to see, but the explicit .or() keeps this query
    // self-documenting rather than relying solely on the policy, matching how other user-facing
    // queries in this app filter explicitly even under RLS.
    supabase
      .from("notifications")
      .select("*")
      .or(`user_id.eq.${user.id},user_id.is.null`)
      .order("created_at", { ascending: false })
      .limit(20),
    getUnreadSupportMessageCountForUser(),
    // Fetched here too (not just lazily on panel-open in ChatSupportButton) so the chat panel has
    // real content the instant it's opened, instead of flashing an empty state while a cold
    // server-action round trip resolves — slowest right after a fresh sign-in. On failure this
    // silently falls back to ChatSupportButton's own client-side fetch (see initialMessages below).
    getSupportThread(),
  ]);

  const name = profile?.full_name || profile?.email || "there";
  const initialSupportMessages = "messages" in supportThreadResult ? supportThreadResult.messages : undefined;

  return (
    <DashboardChrome
      name={name}
      isAdmin={isAdminEmail(user.email)}
      notifications={notifications ?? []}
      unreadChatCount={unreadChatCount}
      initialSupportMessages={initialSupportMessages}
    >
      {children}
    </DashboardChrome>
  );
}
