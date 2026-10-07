import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { KycTypeSelector } from "@/components/kyc/KycTypeSelector";

export default async function KycSelectorPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("kyc_status, kyc_type, phone, country")
    .eq("id", user.id)
    .single();

  if (profile && profile.kyc_status !== "not_started") {
    redirect("/onboarding/kyc/status");
  }

  // Quick onboarding already done (saveOnboardingBasics) — skip straight to the matching ID form
  // instead of re-showing the account-type/phone step they've already completed.
  if (profile?.phone && profile?.kyc_type) {
    redirect(profile.kyc_type === "business" ? "/onboarding/kyc/business" : "/onboarding/kyc/individual");
  }

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold">Let&rsquo;s get you set up</h1>
      <p className="mb-6 text-sm text-foreground/60">
        Just a couple of quick details to get started. You can submit your ID for full
        verification any time from your dashboard.
      </p>
      <KycTypeSelector country={profile?.country ?? null} />
    </div>
  );
}
