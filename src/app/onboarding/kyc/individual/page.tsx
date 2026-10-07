import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { IndividualKycForm } from "./IndividualKycForm";

// Server wrapper only — IndividualKycForm needs the signed-in user's id to build each upload's
// storage path client-side (see FileDropzone/clientUpload.ts), so it's fetched here rather than
// client-side, consistent with how every other dashboard page already gets its user.
export default async function IndividualKycPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return <IndividualKycForm userId={user.id} />;
}
