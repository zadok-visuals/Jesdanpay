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
    .select("kyc_status")
    .eq("id", user.id)
    .single();

  if (profile && profile.kyc_status !== "not_started") {
    redirect("/onboarding/kyc/status");
  }

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold">Verify your identity</h1>
      <p className="mb-6 text-sm text-foreground/60">
        Choose how you&apos;ll be using JesDanPay. This determines the verification steps you need
        to complete.
      </p>
      <KycTypeSelector />
    </div>
  );
}
