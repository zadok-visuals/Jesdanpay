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
