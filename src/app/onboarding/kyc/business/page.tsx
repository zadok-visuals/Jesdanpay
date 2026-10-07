import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BusinessKycForm } from "./BusinessKycForm";

// Server wrapper only — see IndividualKycPage's identical comment for why.
export default async function BusinessKycPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return <BusinessKycForm userId={user.id} />;
}
