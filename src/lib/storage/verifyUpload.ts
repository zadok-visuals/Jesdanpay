// Server-only. A client now uploads a file straight to storage (see clientUpload.ts) and only
// sends the resulting path string through the server action — so that path is untrusted input
// like anything else from a client, and must be checked before being written into a database row
// a reviewer/admin will later open. Two checks: the path's own first folder segment must be the
// signed-in user's id (never trust a path implying another user's folder), and the object must
// actually exist at that path (never trust that an upload the client claims happened, did).
import type { createClient } from "@/lib/supabase/server";

export async function verifyOwnedUpload(
  supabase: Awaited<ReturnType<typeof createClient>>,
  bucket: string,
  userId: string,
  path: string,
): Promise<boolean> {
  if (!path.startsWith(`${userId}/`)) return false;

  const lastSlash = path.lastIndexOf("/");
  const folder = path.slice(0, lastSlash);
  const fileName = path.slice(lastSlash + 1);
  if (!fileName) return false;

  const { data, error } = await supabase.storage.from(bucket).list(folder, { search: fileName, limit: 1 });
  if (error) return false;
  return !!data?.some((f) => f.name === fileName);
}
