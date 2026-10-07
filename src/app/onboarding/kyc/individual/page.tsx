import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { IndividualKycForm } from "./IndividualKycForm";

// Server wrapper only — IndividualKycForm needs the signed-in user's id to build each upload's
// storage path client-side (see FileDropzone/clientUpload.ts), and their country (the ISO
// alpha-2 code picked at signup, stored on profiles.country by handle_new_user — migration 0020)
// to decide which identity fields to show (BVN/NIN for Nigeria, a generic gov ID number + type
// for everyone else). Fetched here rather than client-side, consistent with how every other
// dashboard page already gets its user.
export default async function IndividualKycPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("country, kyc_type, phone")
    .eq("id", user.id)
    .maybeSingle();

  // Quick onboarding (account type + phone) hasn't happened yet — this form needs both to make
  // sense (the ID it asks for depends on country, and the phone is meant to already be on file),
  // so send them there first rather than letting them submit an incomplete profile.
  if (!profile?.kyc_type || !profile?.phone) {
    redirect("/onboarding/kyc");
  }
  // Wrong form for this account type — e.g. a business account's own link/bookmark to the
  // individual form. Redirect to the one that actually matches, not a dead end.
  if (profile.kyc_type !== "individual") {
    redirect("/onboarding/kyc/business");
  }

  return <IndividualKycForm userId={user.id} country={profile.country} />;
}
