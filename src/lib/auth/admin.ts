import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { User } from "@supabase/supabase-js";
import type { AdminRole } from "@/lib/types/database";

// Exported so other call sites that need the same allowlist — e.g. the new-KYC-submission email
// alert in src/lib/actions/kyc.ts — reuse this exact parsing instead of re-splitting
// process.env.ADMIN_EMAILS themselves.
export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

// Non-redirecting check for UI that needs to know "is this user an admin" without gating access
// to a whole page — e.g. deciding whether to render a link to /admin at all. requireAdminUser
// below stays the actual access gate for admin pages/actions; this is display-only. Still just the
// raw env var — good enough for a display-only check, and avoids every such check needing a
// database round trip.
export function isAdminEmail(email: string | null | undefined): boolean {
  return !!email && adminEmails().includes(email.toLowerCase());
}

// admin_users (migration 0038) is the authoritative access list once it has ANY rows — being
// listed in ADMIN_EMAILS no longer matters on its own at that point, so removing someone's
// admin_users row actually revokes access. ADMIN_EMAILS is only consulted as a safety-net
// fallback for the case where admin_users is completely empty (e.g. this migration hasn't run/
// seeded yet in some environment) — that fallback grants plain 'admin', never 'super_admin'.
export async function getAdminRole(userId: string, email: string | null | undefined): Promise<AdminRole | null> {
  const admin = createAdminClient();
  const { count } = await admin.from("admin_users").select("*", { count: "exact", head: true });

  if ((count ?? 0) > 0) {
    const { data } = await admin.from("admin_users").select("role").eq("id", userId).maybeSingle();
    return data?.role ?? null;
  }

  if (email && adminEmails().includes(email.toLowerCase())) {
    return "admin";
  }
  return null;
}

// Lighter gate used ONLY by the MFA enrollment/challenge pages themselves
// (src/app/admin-mfa/*) — checks getAdminRole (admin_users, or the ADMIN_EMAILS fallback) but
// deliberately skips the AAL/factor check below, since those pages are how an admin GETS to aal2
// in the first place. They live outside src/app/admin/ specifically so they never inherit
// admin/layout.tsx's own requireAdminUser() call — nesting them under /admin would re-trigger the
// full check on the very page meant to satisfy it, an infinite redirect loop.
//
// MUST use the same role resolution as requireAdminUser(), not just the raw ADMIN_EMAILS allowlist
// — an admin added only through the Administrators screen (admin_users, never listed in
// ADMIN_EMAILS at all) would otherwise pass requireAdminUser()'s role check, get redirected here to
// enroll, and then immediately get bounced to /home by a stricter check on this page alone.
// Confirmed live: exactly this happened before this was fixed.
export async function requireAdminEmailOnly(): Promise<User> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const role = await getAdminRole(user.id, user.email);
  if (!role) redirect("/home");

  return user;
}

// Redirects away if the current session isn't a recognized admin (admin_users, or the ADMIN_EMAILS
// fallback — see getAdminRole), OR isn't verified at aal2 via an enrolled TOTP factor (Supabase's
// built-in MFA — see src/app/admin-mfa/enroll, src/app/admin-mfa/challenge). Call this at the top
// of every admin page AND every admin server action — actions are reachable directly via POST
// regardless of whether the page itself is gated. An admin with no enrolled factor yet is sent to
// enroll rather than locked out with no path forward; one with a factor but still at aal1 this
// session (e.g. just logged in with password only) is sent to verify it before getting in.
export async function requireAdminUser(): Promise<User> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const role = await getAdminRole(user.id, user.email);
  if (!role) redirect("/home");

  const [{ data: aal }, { data: factors }] = await Promise.all([
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    supabase.auth.mfa.listFactors(),
  ]);

  const hasVerifiedFactor = (factors?.totp ?? []).some((f) => f.status === "verified");
  if (!hasVerifiedFactor) {
    redirect("/admin-mfa/enroll");
  }
  if (aal?.currentLevel !== "aal2") {
    redirect("/admin-mfa/challenge");
  }

  return user;
}

// Additional gate for the Administrators screen (src/app/admin/administrators) — everything
// requireAdminUser already checks, PLUS role === 'super_admin'. Redirects a plain 'admin' back to
// the main admin dashboard rather than erroring, since reaching this page at all just means they
// followed a link/URL they don't have access to, not something to hard-fail on.
export async function requireSuperAdmin(): Promise<User> {
  const user = await requireAdminUser();
  const role = await getAdminRole(user.id, user.email);
  if (role !== "super_admin") redirect("/admin");
  return user;
}
