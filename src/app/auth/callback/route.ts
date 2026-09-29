import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // Defaults to the dashboard, not the KYC form — the client wants new users landing on the
  // dashboard first. This is safe: KYC is enforced server-side at the point of actual
  // consequence, not by blocking navigation — create_withdrawal_request (migration 0031) already
  // rejects with "KYC approval is required" for anything but an approved profile, independent of
  // what page the user landed on after signup. The KycStatusBanner shown on /home still nudges an
  // unverified user to complete it. The password-reset flow passes its own `next` value (see
  // requestPasswordReset in src/lib/actions/auth.ts) so this route can serve both without knowing
  // which flow triggered it.
  const next = searchParams.get("next") ?? "/home";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login`);
}
