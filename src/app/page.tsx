import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LandingPage } from "@/components/marketing/LandingPage";

export default async function RootPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Signed-in users still skip straight to the dashboard; logged-out visitors now get the public
  // marketing site instead of being sent straight to /login.
  if (user) redirect("/home");

  return <LandingPage />;
}
