import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { RmbExchangeForm } from "@/components/payments/RmbExchangeForm";

export default async function PayToChinaPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: wallets }, { data: savedRecipients }] = await Promise.all([
    supabase.from("wallets").select("*").eq("user_id", user.id).order("currency"),
    supabase
      .from("saved_rmb_recipients")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
  ]);

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold">Pay to China</h1>
      <RmbExchangeForm wallets={wallets ?? []} savedRecipients={savedRecipients ?? []} />
    </div>
  );
}
