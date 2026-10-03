import { createClient } from "@/lib/supabase/server";
import { requireAdminEmailOnly } from "@/lib/auth/admin";
import { Card } from "@/components/ui/Card";
import { Wordmark } from "@/components/layout/Wordmark";
import { MfaEnrollForm } from "@/components/admin/MfaEnrollForm";

// Lives outside src/app/admin/ deliberately — see requireAdminEmailOnly's own comment for why
// nesting this under /admin would create a redirect loop with requireAdminUser(). Doubles as a
// standing "admin security" status page: an already-enrolled admin sees a confirmation instead of
// the enrollment form, so this is safe to link to at any time, not just during first-time setup.
export default async function AdminMfaEnrollPage() {
  await requireAdminEmailOnly();
  const supabase = await createClient();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const hasVerifiedFactor = (factors?.totp ?? []).some((f) => f.status === "verified");

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4 py-12">
      <Card className="w-full max-w-sm p-6 sm:p-8">
        <Wordmark className="mb-6 h-7" />
        <h1 className="mb-1 text-xl font-semibold">Admin two-factor authentication</h1>
        {hasVerifiedFactor ? (
          <>
            <p className="mb-4 text-sm text-foreground/60">
              MFA is enabled on this admin account via an authenticator app.
            </p>
            <a href="/admin" className="text-sm font-medium text-primary-600 hover:underline">
              Back to admin dashboard
            </a>
          </>
        ) : (
          <>
            <p className="mb-6 text-sm text-foreground/60">
              Admin accounts require a second factor on top of your password. Set it up once below.
            </p>
            <MfaEnrollForm />
          </>
        )}
      </Card>
    </div>
  );
}
