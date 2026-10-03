import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Wordmark } from "@/components/layout/Wordmark";
import { LogoutButton } from "@/components/auth/LogoutButton";

const SUPPORT_EMAIL = "support@jesdanpay.net";

export default async function AccountSuspendedPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("suspended_at, suspension_reason").eq("id", user.id).maybeSingle();

  // A user whose account isn't actually suspended landing here directly (e.g. a stale bookmark
  // after being released) should just go back into the app, not get stuck on this page.
  if (!profile?.suspended_at) redirect("/home");

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4 py-12">
      <Card className="w-full max-w-sm p-6 text-center sm:p-8">
        <Wordmark className="mx-auto mb-6 h-7" />
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-danger-50 text-2xl">
          ⏸️
        </div>
        <h1 className="mb-1 text-xl font-semibold">Account temporarily suspended</h1>
        <p className="mb-4 text-sm text-foreground/60">
          Your account has been temporarily suspended and you can&rsquo;t access the dashboard
          right now.
        </p>
        {profile.suspension_reason && (
          <p className="mb-4 rounded-xl bg-black/[.03] px-4 py-3 text-sm text-foreground/70">
            {profile.suspension_reason}
          </p>
        )}
        <p className="mb-6 text-sm text-foreground/60">
          If you believe this is a mistake, contact us at{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="font-medium text-primary-600 hover:underline">
            {SUPPORT_EMAIL}
          </a>
          .
        </p>
        <LogoutButton className="mx-auto inline-flex items-center justify-center gap-1.5 rounded-xl border border-border px-4 py-2 text-sm font-medium text-foreground/70 hover:bg-black/[.03]" />
      </Card>
    </div>
  );
}
