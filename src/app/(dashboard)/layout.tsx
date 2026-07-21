import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DashboardChrome } from "@/components/layout/DashboardChrome";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", user.id)
    .single();

  const name = profile?.full_name || profile?.email || "there";

  return <DashboardChrome name={name}>{children}</DashboardChrome>;
}
