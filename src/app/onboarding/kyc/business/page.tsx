import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BusinessKycForm } from "./BusinessKycForm";

// Server wrapper only — see IndividualKycPage's identical comment for why, including the two
// guards below.
export default async function BusinessKycPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("kyc_type, phone").eq("id", user.id).maybeSingle();

  if (!profile?.kyc_type || !profile?.phone) {
    redirect("/onboarding/kyc");
  }
  if (profile.kyc_type !== "business") {
    redirect("/onboarding/kyc/individual");
  }

  return <BusinessKycForm userId={user.id} />;
}
