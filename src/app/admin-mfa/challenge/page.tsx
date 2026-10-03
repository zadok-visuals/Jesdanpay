import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAdminEmailOnly } from "@/lib/auth/admin";
import { Card } from "@/components/ui/Card";
import { Wordmark } from "@/components/layout/Wordmark";
import { MfaChallengeForm } from "@/components/admin/MfaChallengeForm";

// Lives outside src/app/admin/ for the same reason as src/app/admin-mfa/enroll — see
// requireAdminEmailOnly's comment. Only reachable mid-flow: requireAdminUser() redirects here when
// an admin has a verified factor but this session hasn't stepped up to aal2 yet.
export default async function AdminMfaChallengePage() {
  await requireAdminEmailOnly();
  const supabase = await createClient();

  const [{ data: aal }, { data: factors }] = await Promise.all([
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    supabase.auth.mfa.listFactors(),
  ]);

  if (aal?.currentLevel === "aal2") redirect("/admin");

  const verifiedFactor = (factors?.totp ?? []).find((f) => f.status === "verified");
  if (!verifiedFactor) redirect("/admin-mfa/enroll");

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4 py-12">
      <Card className="w-full max-w-sm p-6 sm:p-8">
        <Wordmark className="mb-6 h-7" />
        <h1 className="mb-1 text-xl font-semibold">Verify it&rsquo;s you</h1>
        <p className="mb-6 text-sm text-foreground/60">
          Enter the 6-digit code from your authenticator app to continue to the admin panel.
        </p>
        <MfaChallengeForm factorId={verifiedFactor.id} />
      </Card>
    </div>
  );
}
