import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

// Redirects away if the current session isn't an allowlisted admin. Call this
// at the top of every admin page AND every admin server action — actions are
// reachable directly via POST regardless of whether the page itself is gated.
export async function requireAdminUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");
  if (!user.email || !adminEmails().includes(user.email.toLowerCase())) {
    redirect("/home");
  }

  return user;
}
