import type { createAdminClient } from "@/lib/supabase/admin";

// Every admin queue row only has a user_id, not an email — resolve an email search into a set of
// matching ids first, then filter the real query by user_id.in(...). Returns null when no email
// search is active, so callers can skip the filter entirely rather than treating "no matches" and
// "no search" the same way.
export async function resolveUserIdsByEmail(
  admin: ReturnType<typeof createAdminClient>,
  emailQuery: string | undefined,
): Promise<string[] | null> {
  if (!emailQuery) return null;
  const { data } = await admin.from("profiles").select("id").ilike("email", `%${emailQuery}%`);
  return (data ?? []).map((p) => p.id);
}

// Same idea, but a single query matching email OR full_name — used where an admin might search
// by either (e.g. the Transactions ledger), so "jane" finds her by name just as readily as
// "jane@example.com" finds her by email. "%"/"," are stripped from the query since they're
// ilike/or-syntax special characters a user could type without meaning them literally.
export async function resolveUserIdsBySearch(
  admin: ReturnType<typeof createAdminClient>,
  search: string | undefined,
): Promise<string[] | null> {
  if (!search) return null;
  const escaped = search.replace(/[%,]/g, "");
  const { data } = await admin.from("profiles").select("id").or(`email.ilike.%${escaped}%,full_name.ilike.%${escaped}%`);
  return (data ?? []).map((p) => p.id);
}
