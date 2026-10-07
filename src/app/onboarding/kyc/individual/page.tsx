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

  const { data: profile } = await supabase.from("profiles").select("country").eq("id", user.id).maybeSingle();

  return <IndividualKycForm userId={user.id} country={profile?.country ?? null} />;
}
