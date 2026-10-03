import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { User } from "@supabase/supabase-js";

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
// below stays the actual access gate for admin pages/actions; this is display-only.
export function isAdminEmail(email: string | null | undefined): boolean {
  return !!email && adminEmails().includes(email.toLowerCase());
}

function assertAdminEmail(user: { email?: string | null } | null): asserts user is { email: string } {
  if (!user) redirect("/login");
  if (!user.email || !adminEmails().includes(user.email.toLowerCase())) {
    redirect("/home");
  }
}

// Lighter gate used ONLY by the MFA enrollment/challenge pages themselves
// (src/app/admin-mfa/*) — checks the ADMIN_EMAILS allowlist but deliberately skips the AAL/factor
// check below, since those pages are how an admin GETS to aal2 in the first place. They live
// outside src/app/admin/ specifically so they never inherit admin/layout.tsx's own
// requireAdminUser() call — nesting them under /admin would re-trigger the full check on the very
// page meant to satisfy it, an infinite redirect loop.
export async function requireAdminEmailOnly(): Promise<User> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  assertAdminEmail(user);
  return user;
}

// Redirects away if the current session isn't an allowlisted admin, OR isn't verified at aal2 via
// an enrolled TOTP factor (Supabase's built-in MFA — see src/app/admin-mfa/enroll,
// src/app/admin-mfa/challenge). Call this at the top of every admin page AND every admin server
// action — actions are reachable directly via POST regardless of whether the page itself is
// gated. An admin with no enrolled factor yet is sent to enroll rather than locked out with no
// path forward; one with a factor but still at aal1 this session (e.g. just logged in with
// password only) is sent to verify it before getting in.
export async function requireAdminUser(): Promise<User> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  assertAdminEmail(user);

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
