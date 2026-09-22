import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // Defaults to the existing signup-confirmation destination — the password-reset flow passes
  // its own `next` value (see requestPasswordReset in src/lib/actions/auth.ts) so this route can
  // serve both without knowing which flow triggered it.
  const next = searchParams.get("next") ?? "/onboarding/kyc";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login`);
}
