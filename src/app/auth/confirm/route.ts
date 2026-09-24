import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Verifies a Supabase email OTP (token_hash) directly — the cross-device-safe counterpart to
// /auth/callback's exchangeCodeForSession(code). A PKCE `code` (what {{ .ConfirmationURL }}
// produces) only works if the browser opening the link is the SAME one that originally made the
// request, since the PKCE code_verifier lives in that browser's storage — an email link is
// routinely opened in a different browser/device/tab than the one that requested it, so
// Supabase's own docs recommend {{ .TokenHash }} + verifyOtp for every email-based link (password
// recovery here; signup confirmation and magic links would use this same route with a different
// `type`). See https://supabase.com/docs/guides/auth/passwords for the reference pattern this
// mirrors exactly.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/login";

  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login`);
}
